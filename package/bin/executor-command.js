const path = require('path');
const { ExecutorRegistry } = require('../src/executor/executor-registry');

function parseArgs(argv) {
  const options = {
    command: argv[0] || 'help',
    target: '.',
    executor: null,
    help: false,
  };
  const positional = [];
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--executor') {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) throw new Error('缺少 --executor 参数值');
      options.executor = value;
      index += 1;
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    } else {
      throw new Error(`未知 executor 参数：${arg}`);
    }
  }
  options.target = positional[0] || '.';
  return options;
}

function printUsage() {
  console.log(`ai-spec-auto executor list
ai-spec-auto executor check [目录] [--executor codex|cursor|claude-code]

说明：
  list 仅列出已注册执行器。
  check 仅检查本地执行器命令或配置是否可用，不执行真实 AI 编码。`);
}

async function main(argv = []) {
  const options = parseArgs(argv);
  if (options.help || options.command === 'help') {
    printUsage();
    return options.help ? 0 : 1;
  }

  const registry = new ExecutorRegistry();
  if (options.command === 'list') {
    console.log('已注册执行器：');
    for (const item of registry.list()) {
      console.log(`- ${item.name}（${item.displayName}）：${(item.capabilities || []).join(', ') || '无能力声明'}`);
    }
    return 0;
  }

  if (options.command === 'check') {
    const rootDir = path.resolve(process.cwd(), options.target);
    const providers = options.executor
      ? [registry.get(options.executor)].filter(Boolean)
      : registry.list().map((item) => item.provider);
    if (options.executor && providers.length === 0) {
      console.log(`执行器未注册：${options.executor}`);
      return 1;
    }
    console.log('执行器可用性检查：');
    let hasError = false;
    for (const provider of providers) {
      const result = await provider.checkAvailability({
        projectRoot: rootDir,
        worktreePath: null,
        env: process.env,
      });
      if (result.available) {
        console.log(`- ${provider.name}：可用${result.version ? `（版本：${result.version}）` : ''}`);
      } else {
        hasError = true;
        console.log(`- ${provider.name}：不可用`);
        console.log(`  原因：${result.reason || '未知'}`);
        console.log(`  建议：${result.fixSuggestion || '请检查本地安装。'}`);
      }
    }
    return hasError && options.executor ? 1 : 0;
  }

  console.log(`未知 executor 子命令：${options.command}`);
  printUsage();
  return 1;
}

module.exports = {
  main,
  parseArgs,
};
