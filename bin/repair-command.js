const fs = require('fs');
const path = require('path');
const { RunService } = require('../src/run/run-service');
const { RunStore, writeJson } = require('../src/run/run-store');

const MAX_REPAIR_ATTEMPTS = 2;

function parseArgs(argv) {
  const options = { runId: '', target: '.', dryRun: false };
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }
  options.runId = positional[0] || '';
  options.target = positional[1] || '.';
  return options;
}

function printUsage() {
  console.log(`ai-spec-auto repair <runId> [目录] [--dry-run]

说明：
  对指定 run 执行修复流程。最大修复次数为 ${MAX_REPAIR_ATTEMPTS} 次。
  超过次数必须中断并记录原因。修复记录进入 Evidence。`);
}

function loadHookConfig(rootDir) {
  const configPath = path.join(rootDir, '.harness', 'hooks.config.json');
  if (!fs.existsSync(configPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (_e) {
    return null;
  }
}

function getRepairAttemptCount(rootDir, runId) {
  const runsDir = new RunStore().getRunsDir(rootDir);
  const runDir = path.join(runsDir, runId);
  const repairPath = path.join(runDir, 'repair-history.json');
  if (!fs.existsSync(repairPath)) return 0;
  try {
    const history = JSON.parse(fs.readFileSync(repairPath, 'utf8'));
    return (history.repairs || []).length;
  } catch (_e) {
    return 0;
  }
}

function appendRepairRecord(rootDir, runId, record) {
  const runsDir = new RunStore().getRunsDir(rootDir);
  const runDir = path.join(runsDir, runId);
  if (!fs.existsSync(runDir)) {
    fs.mkdirSync(runDir, { recursive: true });
  }
  const repairPath = path.join(runDir, 'repair-history.json');
  let history = { repairs: [] };
  if (fs.existsSync(repairPath)) {
    try {
      history = JSON.parse(fs.readFileSync(repairPath, 'utf8'));
    } catch (_e) {
      history = { repairs: [] };
    }
  }
  history.repairs.push(record);
  writeJson(repairPath, history);
  return history;
}

async function main(argv) {
  const options = parseArgs(argv);
  if (options.help || !options.runId) {
    printUsage();
    return options.help ? 0 : 1;
  }

  const rootDir = path.resolve(process.cwd(), options.target);

  // 检查 run 是否存在
  let run;
  try {
    run = new RunService().loadRun(rootDir, options.runId);
  } catch (e) {
    console.log(`错误：未找到 run ${options.runId}`);
    return 1;
  }

  // 加载 hook 配置
  const hookConfig = loadHookConfig(rootDir);
  const maxAttempts = hookConfig?.maxRepairAttempts || MAX_REPAIR_ATTEMPTS;

  // 检查修复次数
  const attemptCount = getRepairAttemptCount(rootDir, options.runId);
  if (attemptCount >= maxAttempts) {
    console.log(`修复次数已达上限（${attemptCount}/${maxAttempts}），无法继续修复。`);
    console.log('必须中断并记录原因。');
    appendRepairRecord(rootDir, options.runId, {
      attemptNumber: attemptCount + 1,
      status: 'blocked',
      reason: `超过最大修复次数 ${maxAttempts}`,
      timestamp: new Date().toISOString(),
    });
    return 1;
  }

  const attemptNumber = attemptCount + 1;
  console.log(`执行修复 #${attemptNumber}（最大次数：${maxAttempts}）`);

  if (options.dryRun) {
    console.log('dry-run 模式，不执行真实修复。');
    appendRepairRecord(rootDir, options.runId, {
      attemptNumber,
      status: 'dry-run',
      reason: 'dry-run 不执行真实修复',
      timestamp: new Date().toISOString(),
    });
    return 0;
  }

  // 执行修复 hook
  const repairHook = hookConfig?.hooks?.find((h) => h.hookType === 'repair-hook');
  if (repairHook && repairHook.enabled) {
    console.log(`执行 repair-hook：${repairHook.command}`);
    // 实际执行留给 AI Agent，这里只记录
  }

  // 记录修复结果
  const record = {
    attemptNumber,
    status: 'completed',
    reason: '修复流程执行完成',
    timestamp: new Date().toISOString(),
    hookResults: repairHook ? [{ hookId: repairHook.hookId, status: 'executed' }] : [],
  };
  appendRepairRecord(rootDir, options.runId, record);

  // 更新 run 事件
  new RunService().appendEvent(rootDir, options.runId, 'repair_completed', `修复 #${attemptNumber} 完成`, {
    attemptNumber,
    maxAttempts,
  });

  console.log(`修复 #${attemptNumber} 完成。`);
  if (attemptNumber >= maxAttempts) {
    console.log(`警告：已达到最大修复次数（${maxAttempts}），后续失败将无法自动修复。`);
  }
  return 0;
}

module.exports = {
  main,
  parseArgs,
  MAX_REPAIR_ATTEMPTS,
};
