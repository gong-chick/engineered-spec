'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const PACKAGE_NAME = '@engineered/ai-spec-auto';
const SKIP_ENV = 'ENGINEERED_SPEC_SKIP_SELF_UPGRADE';
const SKIP_FLAG = '--no-self-upgrade';
const REENTRY_ENV = 'ENGINEERED_SPEC_SELF_UPGRADE_REENTRY';
const NPM_VIEW_TIMEOUT_MS = 5000;

function logInfo(msg) {
  process.stderr.write(`ℹ ${msg}\n`);
}

function logWarn(msg) {
  process.stderr.write(`⚠ ${msg}\n`);
}

function commandExists(name) {
  const probe = spawnSync(name, ['--version'], { stdio: 'ignore' });
  return probe.status === 0;
}

function detectPkgManager(targetDir) {
  if (fs.existsSync(path.join(targetDir, 'pnpm-lock.yaml')) && commandExists('pnpm')) return 'pnpm';
  if (commandExists('pnpm')) return 'pnpm';
  if (commandExists('npm')) return 'npm';
  return '';
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_e) {
    return null;
  }
}

function readSourceRegistry(pkgRoot) {
  const pkg = readJsonSafe(path.join(pkgRoot, 'package.json'));
  if (!pkg) return '';
  if (pkg.publishConfig && pkg.publishConfig.registry) return pkg.publishConfig.registry;
  return '';
}

function readInstalledVersion(targetDir) {
  const pkgPath = path.join(targetDir, 'node_modules', PACKAGE_NAME, 'package.json');
  const pkg = readJsonSafe(pkgPath);
  return pkg && pkg.version ? pkg.version : '';
}

function fetchLatestVersion(registry) {
  const args = ['view', `${PACKAGE_NAME}@latest`, 'version'];
  if (registry) args.push('--registry', registry);
  const result = spawnSync('npm', args, {
    encoding: 'utf8',
    timeout: NPM_VIEW_TIMEOUT_MS,
  });
  if (result.status !== 0 || !result.stdout) return '';
  return result.stdout.trim();
}

function resolveTargetDirFromArgs(args) {
  // args 已剥离命令名，例如 ['.', '--profile', 'vue'] 或 ['/abs/path']
  for (let i = 0; i < args.length; i++) {
    const value = args[i];
    if (!value || value.startsWith('-')) {
      // 跳过 flag 及其值（保守做法：仅跳过 flag 本身，--xxx=val 形式天然只占一个槽）
      if (value && value.startsWith('--') && !value.includes('=')) {
        // 简化：不能识别哪些 flag 带值，统一不消费下一个 arg；如果误判最多导致目标目录解析为 flag 值，
        // 后续 fs.existsSync 会失败 -> 自举跳过 -> 走原流程，不影响主流程
      }
      continue;
    }
    return path.resolve(value);
  }
  return process.cwd();
}

function stripSelfUpgradeFlag(args) {
  const idx = args.indexOf(SKIP_FLAG);
  if (idx === -1) return { stripped: args, hadFlag: false };
  const next = args.slice(0, idx).concat(args.slice(idx + 1));
  return { stripped: next, hadFlag: true };
}

/**
 * 自举升级目标项目里的 @engineered/ai-spec-auto 到 latest，并 re-exec 升级后的 CLI 继续跑 update。
 *
 * 任何分支失败都返回 { upgraded: false }，主流程继续，不会中断。
 *
 * @param {{ pkgRoot: string, args: string[], env: NodeJS.ProcessEnv, cwd: string }} ctx
 * @returns {{ upgraded: boolean, status?: number, args?: string[] }}
 */
function maybeSelfUpgradeForUpdate(ctx) {
  const args = ctx.args || [];

  // 仅 update 命令触发
  if (args[0] !== 'update') return { upgraded: false, args };

  // 剥离 --no-self-upgrade 标记（不论是否触发自举，剥离都是必要的，避免下游报 Unknown argument）
  const { stripped, hadFlag } = stripSelfUpgradeFlag(args);
  const finalArgs = stripped;

  // 熔断 1：用户显式禁用
  if (hadFlag) return { upgraded: false, args: finalArgs };
  if (ctx.env[SKIP_ENV] === '1') return { upgraded: false, args: finalArgs };

  // 熔断 2：开发场景使用本地路径，不要去 registry 拉
  if (ctx.env.ENGINEERED_SPEC_FORCE_LOCAL_CLI === '1') return { upgraded: false, args: finalArgs };

  // 熔断 3：防止死循环 —— 自举触发的 re-exec 不再重复自举
  if (ctx.env[REENTRY_ENV] === '1') return { upgraded: false, args: finalArgs };

  // 解析目标目录（与 install-workflow 保持一致：第一个非 flag 的位置参数，否则当前 cwd）
  const positionalArgs = finalArgs.slice(1);
  const targetDir = resolveTargetDirFromArgs(positionalArgs);

  // 熔断 4：目标目录无 package.json -> 走原流程（installLocalCli 内部会 warn）
  if (!fs.existsSync(path.join(targetDir, 'package.json'))) return { upgraded: false, args: finalArgs };

  // 熔断 5：目标项目还没装过 CLI -> 走原 installLocalCli 首装路径
  const installedVersion = readInstalledVersion(targetDir);
  if (!installedVersion) return { upgraded: false, args: finalArgs };

  // 熔断 6：无可用包管理器
  const pkgManager = detectPkgManager(targetDir);
  if (!pkgManager) return { upgraded: false, args: finalArgs };

  // 查 registry 上的 latest
  const registry = readSourceRegistry(ctx.pkgRoot);
  const latestVersion = fetchLatestVersion(registry);
  if (!latestVersion) {
    // 离线 / registry 不可达 -> 静默降级
    return { upgraded: false, args: finalArgs };
  }

  // 已经是最新
  if (installedVersion === latestVersion) return { upgraded: false, args: finalArgs };

  // 当前 CLI 进程版本就是 latest，且只是目标项目落后 -> 把升级交给后续 installLocalCli (mode: update)
  // 这个分支单独处理是为了避免 "当前进程已是 latest 还要 re-exec 一次"
  const currentPkg = readJsonSafe(path.join(ctx.pkgRoot, 'package.json'));
  const currentVersion = currentPkg && currentPkg.version ? currentPkg.version : '';
  if (currentVersion === latestVersion) {
    // 不 re-exec，只交给下游 installLocalCli 升级目标项目
    return { upgraded: false, args: finalArgs };
  }

  logInfo(`检测到 ${PACKAGE_NAME} 有新版本 (本地 ${installedVersion} / 当前 CLI ${currentVersion || '未知'} -> latest ${latestVersion})，先自举升级 ...`);

  // 升级目标项目内的 CLI
  const installSpec = `${PACKAGE_NAME}@${latestVersion}`;
  const addArgs = pkgManager === 'pnpm'
    ? ['add', '-D', installSpec]
    : ['install', '-D', installSpec];
  if (registry) {
    addArgs.push('--registry', registry);
    if (PACKAGE_NAME.startsWith('@')) {
      const scope = PACKAGE_NAME.split('/')[0];
      addArgs.push(`--${scope}:registry=${registry}`);
    }
  }
  const addResult = spawnSync(pkgManager, addArgs, {
    cwd: targetDir,
    stdio: 'inherit',
  });
  if (addResult.status !== 0) {
    logWarn(`${pkgManager} ${addArgs.join(' ')} 失败，跳过自举升级，继续使用当前 CLI 跑 update`);
    return { upgraded: false, args: finalArgs };
  }

  // re-exec 升级后的本地 CLI
  const localCli = path.join(targetDir, 'node_modules', '.bin', 'ai-spec-auto');
  if (!fs.existsSync(localCli)) {
    logWarn(`未找到 ${localCli}，跳过自举升级 re-exec`);
    return { upgraded: false, args: finalArgs };
  }

  logInfo(`自举升级完成，使用 ${latestVersion} 继续执行 update ...`);
  const childEnv = {
    ...ctx.env,
    [REENTRY_ENV]: '1',
  };
  const reExec = spawnSync(process.execPath, [localCli, ...finalArgs], {
    cwd: ctx.cwd,
    env: childEnv,
    stdio: 'inherit',
  });
  const status = typeof reExec.status === 'number' ? reExec.status : 1;
  return { upgraded: true, status, args: finalArgs };
}

module.exports = {
  maybeSelfUpgradeForUpdate,
  __test__: {
    stripSelfUpgradeFlag,
    resolveTargetDirFromArgs,
    PACKAGE_NAME,
    SKIP_ENV,
    SKIP_FLAG,
    REENTRY_ENV,
  },
};
