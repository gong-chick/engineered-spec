const path = require('path');
const { buildContext } = require('../src/context/context-builder');

function parseArgs(argv) {
  const options = {
    target: '.',
    stage: 'planning',
    json: false,
    explain: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--explain') {
      options.explain = true;
    } else if (arg === '--stage') {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) {
        throw new Error('缺少 --stage 参数值');
      }
      options.stage = value;
      index += 1;
    } else if (!arg.startsWith('-')) {
      options.target = arg;
    } else {
      throw new Error(`未知 context 参数：${arg}`);
    }
  }
  return options;
}

function printUsage() {
  console.log(`ai-spec-auto context <目录> --stage <阶段> [--json]

说明：
  按 .ai-spec/context-index.json 渐进式构建只读 ContextBundle。

示例：
  ai-spec-auto context . --stage planning --json
  ai-spec-auto context . --stage implementation --json`);
}

function printReport(bundle) {
  console.log('ContextBundle 构建完成：');
  console.log(`- 阶段：${bundle.stage}`);
  console.log(`- 项目：${bundle.project.projectName || bundle.project.projectId || '未命名'}`);
  console.log(`- 已加载资产：${bundle.loadedAssets.length}`);
  console.log(`- token 估算：${bundle.tokenEstimate.inputTokens}/${bundle.tokenEstimate.maxInputTokens}`);
  console.log(`- 警告：${bundle.warnings.length}`);
  console.log(`- 错误：${bundle.errors.length}`);
  if (bundle.loadedAssets.length > 0) {
    console.log('已加载资产列表：');
    for (const asset of bundle.loadedAssets) {
      console.log(`- ${asset.kind}:${asset.slug}@${asset.version} (${asset.checksum})`);
    }
  }
  if (bundle.warnings.length > 0) {
    console.log('警告详情：');
    for (const item of bundle.warnings) {
      console.log(`- [${item.code}] ${item.message}`);
    }
  }
  if (bundle.errors.length > 0) {
    console.log('错误详情：');
    for (const item of bundle.errors) {
      console.log(`- [${item.code}] ${item.message}`);
    }
  }
}

async function main(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    printUsage();
    return 0;
  }

  const bundle = await buildContext({
    rootDir: path.resolve(process.cwd(), options.target),
    stage: options.stage,
    options: {
      explain: options.explain,
    },
  });

  if (options.json) {
    console.log(JSON.stringify(bundle, null, 2));
  } else {
    printReport(bundle);
  }
  return bundle.errors.length > 0 ? 1 : 0;
}

module.exports = {
  main,
  parseArgs,
  printReport,
};
