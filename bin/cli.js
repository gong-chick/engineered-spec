#!/usr/bin/env node
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pkgRoot = path.join(__dirname, '..');
let args = process.argv.slice(2);
const env = { ...process.env, ENGINEERED_SPEC_LOCAL: pkgRoot };
const opts = { stdio: 'inherit', cwd: process.cwd(), env };
const INSTALL_COMMANDS = new Set(['init', 'update', 'check', 'uninstall', 'sync', 'help']);

const VERSION_FLAGS = new Set(['-v', '-V', '-version', '--version', 'version']);
const RECOMMEND_INIT_FLAGS = new Set(['--recommend', '--dry-run', '--yes', '-y', '--json', '--help', '-h', '--manifest', '--hub-url', '--visual-url', '--no-hub-fallback']);

function shouldUseRecommendInit(args, cwd) {
  if (args[0] !== 'init') return false;
  if (args.includes('--recommend')) return true;
  const manifestIndex = args.indexOf('--manifest');
  if (manifestIndex < 0) return false;
  const manifestValue = args[manifestIndex + 1];
  if (!manifestValue || manifestValue.startsWith('-')) return false;
  const manifestPath = path.resolve(cwd, manifestValue);
  if (manifestValue.endsWith('.json') || fs.existsSync(manifestPath)) return false;

  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    if (index === manifestIndex + 1) continue;
    if (arg.startsWith('-') && !RECOMMEND_INIT_FLAGS.has(arg)) {
      return false;
    }
  }
  return true;
}

function getCommandTarget(args, cwd, startIndex = 1) {
  for (let index = startIndex; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith('-')) {
      return path.resolve(cwd, arg);
    }
  }
  return cwd;
}

function shouldUseIntegrityCommand(args, cwd) {
  if (args[0] !== 'sync' && args[0] !== 'check') return false;
  const targetDir = getCommandTarget(args, cwd);
  return fs.existsSync(path.join(targetDir, '.ai-spec', 'ai-spec.lock.json')) ||
    fs.existsSync(path.join(targetDir, '.agents', 'registry.index.json'));
}

(async () => {
  try {
    if (args.length > 0 && VERSION_FLAGS.has(args[0])) {
      const pkgPath = path.join(pkgRoot, 'package.json');
      const pkgContent = fs.readFileSync(pkgPath, 'utf-8');
      const pkg = JSON.parse(pkgContent);
      console.log(pkg.version);
      process.exit(0);
    }

    // 自举升级：仅在 update 命令、目标项目已装过 CLI 且 registry 上有更新版时触发。
    // 任何失败都会静默降级为继续跑当前 CLI，不影响主流程。
    if (args[0] === 'update') {
      try {
        const selfUpgrade = await import('./self-upgrade.js');
        const result = selfUpgrade.maybeSelfUpgradeForUpdate({
          pkgRoot,
          args,
          env,
          cwd: opts.cwd,
        });
        if (result && Array.isArray(result.args)) {
          args = result.args;
        }
        if (result && result.upgraded) {
          process.exit(typeof result.status === 'number' ? result.status : 0);
        }
      } catch (_error) {
        // 自举本身永远不能阻塞主流程
      }
    }

    if (env.AI_SPEC_SKIP_LAUNCHER_SYNC !== '1') {
      try {
        const runtimeLauncher = await import('./runtime-launcher.js');
        runtimeLauncher.ensureGlobalLauncher({
          pkgRoot,
          env,
        });
      } catch (_error) {
        // launcher sync is best-effort and must not block local execution
      }
    }

    if (args[0] === 'scan') {
      const scanCommand = await import('./scan.js');
      process.exit(await scanCommand.main(args.slice(1)));
    }

    if (shouldUseRecommendInit(args, opts.cwd)) {
      const initCommand = await import('./init-command.js');
      process.exit(await initCommand.main(args.slice(1)));
    }

    if (shouldUseIntegrityCommand(args, opts.cwd)) {
      const command = args[0] === 'sync' ? await import('./sync-command.js') : await import('./check-command.js');
      process.exit(await command.main(args.slice(1)));
    }

    if (args[0] === 'guard') {
      const guardCommand = await import('./guard-command.js');
      process.exit(await guardCommand.main(args.slice(1)));
    }

    if (args[0] === 'context') {
      const contextCommand = await import('./context-command.js');
      process.exit(await contextCommand.main(args.slice(1)));
    }

    if (args[0] === 'worktree') {
      const worktreeCommand = await import('./worktree-command.js');
      process.exit(await worktreeCommand.main(args.slice(1)));
    }

    if (args[0] === 'executor') {
      const executorCommand = await import('./executor-command.js');
      process.exit(await executorCommand.main(args.slice(1)));
    }

    if (args[0] === 'spec-start') {
      const specCommand = await import('./spec-command.js');
      process.exit(await specCommand.mainStart(args.slice(1)));
    }

    if (args[0] === 'spec-status') {
      const specCommand = await import('./spec-command.js');
      process.exit(await specCommand.mainStatus(args.slice(1)));
    }

    if (args[0] === 'spec-continue') {
      const specCommand = await import('./spec-command.js');
      process.exit(await specCommand.mainContinue(args.slice(1)));
    }

    if (args[0] === 'spec-list') {
      const specCommand = await import('./spec-command.js');
      process.exit(await specCommand.mainList(args.slice(1)));
    }

    if (args[0] === 'spec-detail') {
      const specCommand = await import('./spec-command.js');
      process.exit(await specCommand.mainSpecStatus(args.slice(1)));
    }

    if (args[0] === 'repair') {
      const repairCommand = await import('./repair-command.js');
      process.exit(await repairCommand.main(args.slice(1)));
    }

    if (args[0] === 'report') {
      const reportCommand = await import('./report-command.js');
      process.exit(await reportCommand.main(args.slice(1)));
    }

    if (args.length === 0 || INSTALL_COMMANDS.has(args[0])) {
      const installWorkflow = await import('./install-workflow.js');
      // 切面：遥测仅观测，不改变 main(args) 的返回值/副作用/异常。
      // 模块加载/运行失败均自动降级为透明 wrap，主流程零影响。
      let telemetry = { wrap: function (_c, fn) { return fn(); } };
      try {
        telemetry = await import('./telemetry.js');
      } catch (_error) {
        // 整个 telemetry 目录被移除或加载失败时，保持透明 wrap。
      }
      process.exit(await telemetry.wrap(args[0] || 'help', function () {
        return installWorkflow.main(args);
      }));
    }

    if (args[0] === 'runtime-state') {
      const runtimeState = await import('./runtime-state.js');
      process.exit(runtimeState.main(args.slice(1)));
    }

    if (args[0] === 'validate-registry') {
      const validateRegistry = await import('./validate-registry.js');
      process.exit(validateRegistry.main(args.slice(1)));
    }

    if (args[0] === 'manifest-export') {
      const manifestExport = await import('./manifest-export.js');
      process.exit(await manifestExport.main(args.slice(1)));
    }

    if (args[0] === 'ide') {
      const ideCommand = await import('./ide-command.js');
      process.exit(await ideCommand.main(args.slice(1)));
    }

    if (args[0] === 'hub') {
      // 切面接入：Hub 方案包能力独立在 hub-command 内部实现。
      // 加载或执行失败只影响 hub 子命令，不改变 init/sync/check 等旧主链。
      const hubCommand = await import('./hub-command.js');
      process.exit(await hubCommand.main(args.slice(1)));
    }

    if (args[0] === 'task-orchestrator-adapter') {
      throw new Error('task-orchestrator-adapter is a legacy internal fallback; use ai-spec-auto protocol-step / protocol-advance / protocol-update instead');
    }

    if (args[0] === 'task-orchestrator-extractor') {
      throw new Error('task-orchestrator-extractor is a legacy internal fallback; use ai-spec-auto protocol-step / protocol-advance / protocol-update instead');
    }

    if (args[0] === 'task-orchestrator-runner') {
      throw new Error('task-orchestrator-runner is an internal runtime module; call it from the AI host layer instead of ai-spec-auto CLI');
    }

    const runtimeBootstrap = await import('./runtime-bootstrap.js');
    const runtimeHandOff = await runtimeBootstrap.maybeHandOffToRuntime({
      pkgRoot,
      args,
      env,
      cwd: opts.cwd,
      stdio: opts.stdio,
    });
    if (runtimeHandOff.handedOff) {
      process.exit(runtimeHandOff.status);
    }

    if (args[0] === 'protocol-step') {
      await (await import('../internal/visual-hooks/inbox-consumer.js')).consumeInbox({ targetDir: opts.cwd, timeoutMs: 50 }).catch(() => {});
      const protocolWorkflow = await import('./protocol-workflow.js');
      process.exit(await protocolWorkflow.main('step', args.slice(1)));
    }

    if (args[0] === 'protocol-advance') {
      await (await import('../internal/visual-hooks/inbox-consumer.js')).consumeInbox({ targetDir: opts.cwd, timeoutMs: 50 }).catch(() => {});
      const protocolWorkflow = await import('./protocol-workflow.js');
      process.exit(await protocolWorkflow.main('advance', args.slice(1)));
    }

    if (args[0] === 'protocol-update') {
      await (await import('../internal/visual-hooks/inbox-consumer.js')).consumeInbox({ targetDir: opts.cwd, timeoutMs: 50 }).catch(() => {});
      const protocolWorkflow = await import('./protocol-workflow.js');
      process.exit(await protocolWorkflow.main('update', args.slice(1)));
    }

    if (args[0] === 'protocol-stop') {
      const protocolWorkflow = await import('./protocol-workflow.js');
      process.exit(await protocolWorkflow.main('stop', args.slice(1)));
    }

    if (args[0] === 'protocol-status') {
      await (await import('../internal/visual-hooks/inbox-consumer.js')).consumeInbox({ targetDir: opts.cwd, timeoutMs: 50 }).catch(() => {});
      const protocolWorkflow = await import('./protocol-workflow.js');
      process.exit(await protocolWorkflow.main('status', args.slice(1)));
    }

    if (args[0] === 'expert-dispatch') {
      const expertDispatch = await import('./expert-dispatch.js');
      process.exit(expertDispatch.main(args.slice(1)));
    }

    if (args[0] === 'expert-executor') {
      const expertExecutor = await import('./expert-executor.js');
      process.exit(await expertExecutor.main(args.slice(1)));
    }

    if (args[0] === 'demo-runtime-smoke') {
      const demoRuntimeSmoke = await import('./demo-runtime-smoke.js');
      process.exit(demoRuntimeSmoke.main(args.slice(1)));
    }

    if (args[0] === 'archive-change') {
      const archiveChange = await import('./archive-change.js');
      process.exit(await archiveChange.main(args.slice(1)));
    }

    if (args[0] === 'visual-bridge') {
      const visualBridge = await import('./visual-bridge.js');
      process.exit(await visualBridge.main(args.slice(1)));
    }

    if (args[0] === 'visual') {
      const visualCommand = await import('./visual-command.js');
      process.exit(await visualCommand.main(args.slice(1)));
    }

    throw new Error(`Unknown command: ${args[0]}`);
  } catch (e) {
    if (e && e.message && !e.cmd) {
      console.error(e.message);
    }
    process.exit(e.status || 1);
  }
})();
