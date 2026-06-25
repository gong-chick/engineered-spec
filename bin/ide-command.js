const path = require('path');
const { IdeService } = require('../src/ide/ide-service');
const { IDE_TYPES, LINK_MODES, PROFILES } = require('../src/ide/ide-types');

const SUB_COMMANDS = new Set(['sync', 'doctor', 'repair']);

function parseArgs(argv) {
  const options = {
    subCommand: '',
    target: '.',
    ide: [],
    profile: PROFILES.AUTO,
    linkMode: LINK_MODES.AUTO,
    writeMemoryAnchor: true,
    writeAgentAnchor: true,
    dryRun: false,
    yes: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    if (SUB_COMMANDS.has(arg) && !options.subCommand) {
      options.subCommand = arg;
      continue;
    }

    if (arg === '--ide') {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) {
        throw new Error('缺少 --ide 参数值，支持 cursor、claude，多个用逗号分隔');
      }
      options.ide = value.split(',').map((item) => item.trim()).filter((item) => Object.values(IDE_TYPES).includes(item));
      if (options.ide.length === 0) {
        throw new Error(`无效的 --ide 值：${value}，支持 cursor、claude`);
      }
      index += 1;
    } else if (arg === '--profile') {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) {
        throw new Error('缺少 --profile 参数值，支持 auto、react、vue');
      }
      if (!Object.values(PROFILES).includes(value)) {
        throw new Error(`无效的 --profile 值：${value}，支持 auto、react、vue`);
      }
      options.profile = value;
      index += 1;
    } else if (arg === '--link-mode') {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) {
        throw new Error('缺少 --link-mode 参数值，支持 auto、copy、symlink');
      }
      if (!Object.values(LINK_MODES).includes(value)) {
        throw new Error(`无效的 --link-mode 值：${value}，支持 auto、copy、symlink`);
      }
      options.linkMode = value;
      index += 1;
    } else if (arg === '--write-memory-anchor') {
      options.writeMemoryAnchor = true;
    } else if (arg === '--no-write-memory-anchor') {
      options.writeMemoryAnchor = false;
    } else if (arg === '--write-agent-anchor') {
      options.writeAgentAnchor = true;
    } else if (arg === '--no-write-agent-anchor') {
      options.writeAgentAnchor = false;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--yes' || arg === '-y') {
      options.yes = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (!arg.startsWith('-')) {
      if (SUB_COMMANDS.has(arg)) {
        options.subCommand = arg;
      } else {
        options.target = arg;
      }
    } else {
      throw new Error(`未知参数：${arg}`);
    }
  }

  if (!options.subCommand && !options.help) {
    throw new Error('请指定子命令：sync、doctor 或 repair');
  }

  return options;
}

function printUsage() {
  console.log(`ai-spec-auto ide <子命令> <目录> [选项]

子命令：
  sync     同步 IDE 指针文件和锚点到目标项目
  doctor   检查 IDE 指针文件完整性
  repair   修复缺失的 IDE 指针文件

选项：
  --ide <cursor,claude>      目标 IDE（默认 cursor,claude）
  --profile <auto|react|vue>  技术栈 profile（默认 auto）
  --link-mode <auto|copy|symlink>  指针写入模式（默认 auto）
  --write-memory-anchor       写入 memory.md 锚点（默认启用）
  --no-write-memory-anchor    不写入 memory.md 锚点
  --write-agent-anchor        写入 AGENTS.md/CLAUDE.md 锚点（默认启用）
  --no-write-agent-anchor     不写入 AGENTS.md/CLAUDE.md 锚点
  --dry-run                   只输出计划，不写文件
  --yes                       确认执行写入
  --help, -h                  显示帮助信息

示例：
  ai-spec-auto ide sync . --ide cursor,claude --profile react --dry-run
  ai-spec-auto ide sync . --ide cursor,claude --profile vue --link-mode copy --yes
  ai-spec-auto ide doctor .
  ai-spec-auto ide repair . --yes`);
}

function printSyncResult(result) {
  console.log('');
  console.log('IDE 同步完成');
  console.log(`使用模式：${result.linkModeUsed}`);
  console.log('');
  console.log('已写入文件：');
  for (const file of result.writtenFiles) {
    const actionText = file.action === 'create' ? '创建' : '更新';
    console.log(`  - ${file.path}：${actionText}`);
  }
  if (result.skippedFiles.length > 0) {
    console.log('');
    console.log('跳过的文件：');
    for (const file of result.skippedFiles) {
      console.log(`  - ${file}`);
    }
  }
  if (result.warnings.length > 0) {
    console.log('');
    console.log('警告：');
    for (const warning of result.warnings) {
      console.log(`  - ${warning}`);
    }
  }
}

function printDoctorResult(result) {
  console.log('');
  if (result.ok) {
    console.log('IDE 指针文件检查通过，所有文件完整');
    return;
  }
  console.log(`IDE 指针文件检查发现问题，${result.missingCount} 个必要文件缺失`);
  console.log('');
  console.log('检查项：');
  for (const item of result.items) {
    const statusIcon = item.exists ? '✅' : '❌';
    const anchorInfo = item.hasAnchor !== undefined ? (item.hasAnchor ? ' [锚点完整]' : ' [锚点缺失]') : '';
    const requiredTag = item.required ? '（必要）' : '（可选）';
    console.log(`  ${statusIcon} ${item.path} [${item.category}]${requiredTag}${anchorInfo}`);
  }
  if (result.suggestions.length > 0) {
    console.log('');
    console.log('修复建议：');
    for (const suggestion of result.suggestions) {
      console.log(`  - ${suggestion}`);
    }
  }
}

function printRepairResult(result) {
  console.log('');
  if (result.repairedFiles.length === 0) {
    console.log('IDE 指针文件完整，无需修复');
    return;
  }
  console.log('IDE 修复完成');
  console.log('');
  console.log('已修复文件：');
  for (const file of result.repairedFiles) {
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

  const targetDir = path.resolve(process.cwd(), options.target);
  const service = new IdeService();

  if (options.subCommand === 'sync') {
    if (!options.dryRun && !options.yes) {
      console.log('请追加 --yes 确认写入，或使用 --dry-run 查看计划');
      // 先 dry-run 展示计划
      const plan = await service.sync(targetDir, { ...options, dryRun: true });
      printSyncResult(plan);
      return 0;
    }

    const result = await service.sync(targetDir, options);
    printSyncResult(result);
    return 0;
  }

  if (options.subCommand === 'doctor') {
    const result = service.doctor(targetDir);
    printDoctorResult(result);
    return 0;
  }

  if (options.subCommand === 'repair') {
    if (!options.dryRun && !options.yes) {
      // 先展示 doctor 结果
      const doctorResult = service.doctor(targetDir);
      printDoctorResult(doctorResult);
      console.log('');
      console.log('请追加 --yes 确认修复');
      return 0;
    }

    const result = await service.repair(targetDir, options);
    printRepairResult(result);
    return 0;
  }

  throw new Error(`未知子命令：${options.subCommand}`);
}

module.exports = {
  main,
  parseArgs,
  printSyncResult,
  printDoctorResult,
  printRepairResult,
};
