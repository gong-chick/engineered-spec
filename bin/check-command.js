const path = require('path');
const { CheckService } = require('../src/check/check-service');

function parseArgs(argv) {
  const options = { target: '.' };
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (!arg.startsWith('-')) {
      options.target = arg;
    } else {
      throw new Error(`未知 check 参数：${arg}`);
    }
  }
  return options;
}

function printUsage() {
  console.log(`ai-spec-auto check <目录>

说明：
  检查项目资产完整性、lock / registry / context-index 一致性和隐私配置。`);
}

function printIssues(title, issues) {
  if (issues.length === 0) return;
  console.log(title);
  for (const item of issues) {
    console.log(`- [${item.code}] ${item.message}`);
    if (item.suggestion) {
      console.log(`  建议：${item.suggestion}`);
    }
  }
}

function printReport(result) {
  console.log('检查完成：');
  console.log(`- 错误：${result.summary.errors}`);
  console.log(`- 警告：${result.summary.warnings}`);
  console.log(`- 信息：${result.summary.infos}`);
  printIssues('错误详情：', result.errors);
  printIssues('警告详情：', result.warnings);
  printIssues('信息详情：', result.infos);
}

async function main(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    printUsage();
    return 0;
  }
  const targetDir = path.resolve(process.cwd(), options.target);
  const result = new CheckService().check(targetDir, { strictCache: false });
  printReport(result);
  return result.errors.length > 0 ? 1 : 0;
}

module.exports = {
  main,
  parseArgs,
  printReport,
};
