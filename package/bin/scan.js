const path = require('path');
const { TechScannerEngine } = require('../src/scanner/engine');

function parseArgs(argv) {
  const options = {
    target: '.',
    explain: false,
    json: false,
  };

  for (const arg of argv) {
    if (arg === '--explain') {
      options.explain = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (!arg.startsWith('-')) {
      options.target = arg;
    } else {
      throw new Error(`未知 scan 参数：${arg}`);
    }
  }

  return options;
}

function printUsage() {
  console.log(`ai-spec-auto scan <目录> [--explain] [--json]

说明：
  只读扫描目标项目，输出 WorkspaceTopology（工作区拓扑）和技术栈识别结果。

示例：
  ai-spec-auto scan .
  ai-spec-auto scan . --explain
  ai-spec-auto scan . --json`);
}

function formatPrimary(primary) {
  if (!primary) return '未识别';
  return `${primary.framework}（置信度 ${primary.confidence}，推荐 Manifest：${primary.manifestSlug}）`;
}

function printHuman(result, options) {
  console.log('扫描完成');
  console.log(`目标目录：${result.workspace.rootDir}`);
  console.log(`工作区类型：${result.workspace.type}`);
  if (result.workspace.packageManager) {
    console.log(`包管理器：${result.workspace.packageManager}`);
  }
  console.log(`包数量：${result.packages.length}`);

  for (const pkg of result.packages) {
    const primary = pkg.primary;
    console.log('');
    console.log(`包：${pkg.path}${pkg.name ? `（${pkg.name}）` : ''}`);
    console.log(`识别结果：${formatPrimary(primary)}`);
    if (primary) {
      console.log(`推荐 Manifest：${pkg.recommendedManifest}`);
      console.log(`标签：${pkg.tags.join('、')}`);
    }
    if (options.explain) {
      const reasons = pkg.reasons || [];
      console.log(`识别原因：${reasons.length > 0 ? reasons.join('；') : '暂无'}`);
      if (pkg.candidates.length > 1) {
        console.log('候选结果：');
        for (const candidate of pkg.candidates) {
          console.log(`  - ${candidate.framework}：置信度 ${candidate.confidence}，Manifest ${candidate.manifestSlug}`);
        }
      }
    }
  }
}

async function main(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    printUsage();
    return 0;
  }

  const targetDir = path.resolve(process.cwd(), options.target);
  const result = await new TechScannerEngine().scan(targetDir);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHuman(result, options);
  }
  return 0;
}

module.exports = {
  main,
  parseArgs,
};
