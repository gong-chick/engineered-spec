const path = require('path');
const { CheckService } = require('../src/check/check-service');

function parseArgs(argv) {
  const options = { command: argv[0], target: '.' };
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (!arg.startsWith('-')) {
      options.target = arg;
    } else {
      throw new Error(`未知 guard 参数：${arg}`);
    }
  }
  return options;
}

function printUsage() {
  console.log(`ai-spec-auto guard assets [目录]

说明：
  用于 Git hook / CI 的资产完整性检查，不联网下载、不自动修复。`);
}

async function main(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    printUsage();
    return 0;
  }
  if (options.command !== 'assets') {
    throw new Error('当前仅支持 guard assets');
  }
  const targetDir = path.resolve(process.cwd(), options.target);
  const result = new CheckService().check(targetDir, { strictCache: true });
  if (result.errors.length > 0) {
    console.log(`资产完整性检查失败：错误 ${result.errors.length}，警告 ${result.warnings.length}`);
    for (const item of result.errors) {
      console.log(`- [${item.code}] ${item.message}`);
    }
    console.log('如需下载或恢复资产，请先执行 ai-spec-auto sync .');
    return 1;
  }
  console.log(`资产完整性检查通过：警告 ${result.warnings.length}`);
  return 0;
}

module.exports = {
  main,
  parseArgs,
};
