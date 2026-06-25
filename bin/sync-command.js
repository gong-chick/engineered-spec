const path = require('path');
const { SyncService } = require('../src/sync/sync-service');

function parseArgs(argv) {
  const options = { target: '.', hubUrl: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--hub-url') {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) throw new Error('缺少 --hub-url 参数值');
      options.hubUrl = value;
      index += 1;
    } else if (!arg.startsWith('-')) {
      options.target = arg;
    } else {
      throw new Error(`未知 sync 参数：${arg}`);
    }
  }
  return options;
}

function printUsage() {
  console.log(`ai-spec-auto sync <目录>

说明：
  根据 .ai-spec/ai-spec.lock.json 将远程资产同步到本地全局缓存。`);
}

function printReport(report) {
  console.log('同步完成：');
  for (const message of report.messages || []) {
    console.log(`- ${message}`);
  }
  console.log(`- 资产总数：${report.total}`);
  console.log(`- Agent Profile 总数：${report.agentProfilesTotal || 0}`);
  console.log(`- 缓存命中：${report.cacheHits}`);
  console.log(`- Agent Profile 缓存命中：${report.agentProfileCacheHits || 0}`);
  console.log(`- 已下载：${report.downloaded}`);
  console.log(`- Agent Profile 已下载：${report.agentProfilesDownloaded || 0}`);
}

async function main(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    printUsage();
    return 0;
  }
  const targetDir = path.resolve(process.cwd(), options.target);
  const report = await new SyncService().sync(targetDir, { hubUrl: options.hubUrl });
  printReport(report);
  return 0;
}

module.exports = {
  main,
  parseArgs,
};
