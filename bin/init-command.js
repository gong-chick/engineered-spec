const path = require('path');
const { InitApplier } = require('../src/init/init-applier');
const { InitService } = require('../src/init/init-service');

function parseArgs(argv) {
  const options = {
    target: '.',
    recommend: false,
    dryRun: false,
    manifest: null,
    yes: false,
    json: false,
    hubUrl: '',
    visualUrl: '',
    fallbackToLocal: undefined,
    workspaceRoot: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--recommend') {
      options.recommend = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--manifest') {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) {
        throw new Error('缺少 --manifest 参数值');
      }
      options.manifest = value;
      index += 1;
    } else if (arg === '--yes' || arg === '-y') {
      options.yes = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--hub-url') {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) {
        throw new Error('缺少 --hub-url 参数值');
      }
      options.hubUrl = value;
      index += 1;
    } else if (arg === '--visual-url') {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) {
        throw new Error('缺少 --visual-url 参数值');
      }
      options.visualUrl = value;
      index += 1;
    } else if (arg === '--no-hub-fallback') {
      options.fallbackToLocal = false;
    } else if (arg === '--workspace-root') {
      options.workspaceRoot = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (!arg.startsWith('-')) {
      options.target = arg;
    } else {
      throw new Error(`未知 init 参数：${arg}`);
    }
  }

  return options;
}

function printUsage() {
  console.log(`ai-spec-auto init <目录> --recommend [--dry-run] [--yes] [--json] [--workspace-root]

说明：
  根据扫描结果生成 InitPlan（初始化计划），并在确认后写入 .ai-spec 与索引指针文件。

选项：
  --workspace-root         Monorepo 下仅在根目录初始化，忽略子包
  --manifest <slug>        手动指定 Manifest slug
  --recommend              启用扫描推荐模式
  --dry-run                仅预览计划，不写入文件
  --yes / -y               跳过确认，直接执行
  --json                   以 JSON 格式输出

示例：
  ai-spec-auto init . --recommend --dry-run
  ai-spec-auto init . --recommend --yes
  ai-spec-auto init . --recommend --yes --workspace-root
  ai-spec-auto init . --recommend --yes --visual-url http://localhost:3001
  ai-spec-auto init . --manifest backend-java-springboot-standard --yes`);
}

function printPlan(plan) {
  console.log('InitPlan 生成完成');
  console.log(`目标目录：${plan.workspace.rootDir}`);
  console.log(`工作区类型：${plan.workspace.type}`);
  console.log(`包数量：${plan.packages.length}`);
  console.log('');
  console.log('推荐 Manifest：');
  for (const pkg of plan.packages) {
    console.log(`  - ${pkg.path}`);
    console.log(`    项目类型：${pkg.projectKind}`);
    console.log(`    primary detector：${pkg.primary?.detector || '无'}`);
    console.log(`    confidence：${pkg.techProfile.confidence}`);
    console.log(`    推荐来源：${pkg.recommendationSource === 'hub' ? 'Hub' : pkg.recommendationSource === 'manual' ? '手动指定' : pkg.recommendationSource === 'local' ? '本地' : '无'}`);
    if (pkg.recommendedManifest) {
      const autoText = pkg.recommendedManifest.requiresConfirmation ? '否，需要人工确认' : '是';
      console.log(`    是否自动推荐 Manifest：${autoText}`);
      console.log(`    推荐 Manifest：${pkg.recommendedManifest.slug}@${pkg.recommendedManifest.version}（分数 ${pkg.recommendedManifest.score}）`);
      console.log(`    推荐原因：${pkg.recommendedManifest.reasons.join('；') || '暂无'}`);
    } else {
      console.log('    是否自动推荐 Manifest：否');
      console.log('    未自动推荐 Manifest：');
      console.log(`    原因：${(pkg.warnings || []).join('；') || '当前项目未识别到明确业务技术栈。'}`);
      console.log('    建议：如需安装规范，请后续使用 --manifest 手动指定。');
    }
  }
  if (plan.warnings.length > 0) {
    console.log('');
    console.log('警告：');
    for (const warning of plan.warnings) {
      console.log(`  - ${warning}`);
    }
  }
  console.log('');
  console.log('将要写入的文件：');
  for (const file of plan.filesToWrite) {
    const actionText = file.action === 'create' ? '创建' : file.action === 'update' ? '更新' : '跳过';
    console.log(`  - ${file.path}：${actionText}，${file.description}`);
  }
  console.log('');
  console.log('dry-run 不会写入文件。');
  console.log('确认后可执行：ai-spec-auto init . --recommend --yes');
}

function printApplyResult(result) {
  console.log('初始化写入完成');
  console.log(`项目 ID：${result.projectId}`);
  if (result.workspaceId) {
    console.log(`工作区 ID：${result.workspaceId}`);
  }
  console.log('已写入文件：');
  for (const file of result.writtenFiles) {
    const actionText = file.action === 'create' ? '创建' : '更新';
    console.log(`  - ${file.path}：${actionText}`);
  }
}

async function main(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    printUsage();
    return 0;
  }
  if (!options.recommend && !options.manifest) {
    throw new Error('当前 init 新链路必须显式传入 --recommend 或 --manifest');
  }

  const targetDir = path.resolve(process.cwd(), options.target);
  const plan = await new InitService().createPlan(targetDir, {
    manualManifestSlug: options.manifest,
    hubUrl: options.hubUrl,
    fallbackToLocal: options.fallbackToLocal,
    workspaceRoot: options.workspaceRoot,
  });

  if (options.dryRun || !options.yes) {
    if (options.json) {
      console.log(JSON.stringify(plan, null, 2));
    } else {
      printPlan(plan);
      if (!options.dryRun) {
        console.log('当前命令未写入文件；请确认后追加 --yes 执行写入。');
      }
    }
    return 0;
  }

  const result = await new InitApplier().apply(targetDir, plan, {
    hubUrl: options.hubUrl,
    visualUrl: options.visualUrl,
  });
  if (options.json) {
    console.log(JSON.stringify({ plan, result }, null, 2));
  } else {
    printApplyResult(result);
    for (const warning of result.warnings || []) {
      console.log(`警告：${warning}`);
    }
  }
  return 0;
}

module.exports = {
  main,
  parseArgs,
  printPlan,
};
