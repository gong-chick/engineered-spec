const path = require('path');
const { readProjectState } = require('../src/project/project-files');
const { RunService } = require('../src/run/run-service');
const { EscapeHatch } = require('../src/state-machine/escape-hatch');
const { StageRunner } = require('../src/state-machine/stage-runner');
const { VisualReporter } = require('../src/visual/visual-reporter');
const { SpecWriter } = require('../src/spec/spec-writer');

function parseStartArgs(argv) {
  const options = {
    requirement: '',
    target: '.',
    dryRun: false,
    noWorktree: false,
    visualUrl: '',
  };
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--no-worktree') {
      options.noWorktree = true;
    } else if (arg === '--dirty-strategy') {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) throw new Error('缺少 --dirty-strategy 参数值');
      options.dirtyStrategy = value;
      index += 1;
    } else if (arg === '--run-id') {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) throw new Error('缺少 --run-id 参数值');
      options.runId = value;
      index += 1;
    } else if (arg === '--visual-url') {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) throw new Error('缺少 --visual-url 参数值');
      options.visualUrl = value;
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    } else {
      throw new Error(`未知 spec-start 参数：${arg}`);
    }
  }
  options.requirement = positional[0] || '';
  options.target = positional[1] || '.';
  return options;
}

function parseRunCommandArgs(argv) {
  const options = {
    runId: '',
    target: '.',
    execute: false,
    dryRun: false,
    executor: null,
    visualUrl: '',
    hubUrl: '',
  };
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--execute') {
      options.execute = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--executor') {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) throw new Error('缺少 --executor 参数值');
      options.executor = value;
      index += 1;
    } else if (arg === '--visual-url') {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) throw new Error('缺少 --visual-url 参数值');
      options.visualUrl = value;
      index += 1;
    } else if (arg === '--hub-url') {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) throw new Error('缺少 --hub-url 参数值');
      options.hubUrl = value;
      index += 1;
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    } else {
      throw new Error(`未知 spec-continue 参数：${arg}`);
    }
  }
  options.runId = positional[0] || '';
  options.target = positional[1] || '.';
  return options;
}

function printStartUsage() {
  console.log(`ai-spec-auto spec-start "<需求描述>" [目录] [--dry-run] [--no-worktree] [--visual-url http://localhost:3001]

说明：
  创建本地 run，并按状态机推进到 human_review。当前不会调用任何执行器。`);
}

function assertInitialized(rootDir) {
  const state = readProjectState(rootDir);
  if (!state.project || !state.lock) {
    throw new Error('当前项目尚未完成 init，请先执行 ai-spec-auto init . --recommend --dry-run');
  }
}

function printRunSummary(prefix, run) {
  console.log(`${prefix}：`);
  console.log(`- runId：${run.runId}`);
  console.log(`- 当前状态：${run.state}`);
  console.log(`- 需求摘要：${run.requirement.summary}`);
  console.log(`- branch：${run.branch.branchName || '未创建'}`);
  console.log(`- worktree：${run.branch.worktreePath || '未创建'}`);
}

function getNextSuggestion(run) {
  if (run.state === 'human_review') return '如需进入执行器阶段，请执行 spec-continue <runId> --execute；dry-run 可先验证执行器选择和任务文件。';
  if (run.state === 'suspended') return '请先处理 incident，再执行 spec-continue。';
  if (run.state === 'initialized') return '可执行 spec-continue 继续状态机。';
  if (run.state === 'completed') return '可归档该 run。';
  return '请查看 run.json 的 events 和 incidents。';
}

async function mainStart(argv) {
  const options = parseStartArgs(argv);
  if (options.help || !options.requirement) {
    printStartUsage();
    return options.help ? 0 : 1;
  }
  const rootDir = path.resolve(process.cwd(), options.target);
  assertInitialized(rootDir);

  const runService = new RunService({ visualOptions: { visualUrl: options.visualUrl } });
  let run = runService.createRun({
    rootDir,
    requirement: options.requirement,
    runId: options.runId,
    worktreeEnabled: !options.noWorktree,
    branchEnabled: !options.noWorktree,
  });

  // 生成 Spec 目录结构和模板文件
  const specWriter = new SpecWriter();
  const specResult = specWriter.write(rootDir, {
    requirement: options.requirement,
    specId: run.runId,
  });

  if (options.dryRun) {
    runService.appendEvent(rootDir, run.runId, 'dry_run', 'dry-run 不会创建 branch / worktree，也不会调用执行器');
    run = runService.loadRun(rootDir, run.runId);
    await new VisualReporter().reportRunEvent(rootDir, run, { type: 'dry_run', detail: {} }, {
      visualUrl: options.visualUrl,
      type: 'spec_started',
      eventId: `${run.runId}:spec_started:dry-run`,
      payload: { requirementSummary: run.requirement.summary, dryRun: true },
    });
    printRunSummary('spec-start dry-run 完成', run);
    console.log('说明：dry-run 不会创建 branch / worktree，不会执行真实 AI 编码。');
    return 0;
  }

  try {
    run = await new StageRunner({ runService }).runToHumanReview({
      rootDir,
      runId: run.runId,
      options: {
        noWorktree: options.noWorktree,
        dirtyStrategy: options.dirtyStrategy,
        visualUrl: options.visualUrl,
      },
    });
    printRunSummary('spec-start 完成', run);
    console.log('说明：执行器尚未接入，当前停在 human_review。');
    return 0;
  } catch (error) {
    const current = runService.loadRun(rootDir, run.runId);
    await new EscapeHatch({ runService, visualOptions: { visualUrl: options.visualUrl } }).handle({
      rootDir,
      run: current,
      failure: {
        stage: current.stage,
        code: error.code || 'SPEC_START_FAILED',
        message: error.message,
      },
    });
    console.log(`spec-start 失败，已生成 incident：${error.message}`);
    return 1;
  }
}

async function mainStatus(argv) {
  const options = parseRunCommandArgs(argv);
  if (options.help || !options.runId) {
    console.log('ai-spec-auto spec-status <runId> [目录]');
    return options.help ? 0 : 1;
  }
  const rootDir = path.resolve(process.cwd(), options.target);
  const run = new RunService().loadRun(rootDir, options.runId);
  printRunSummary('spec-status', run);
  console.log(`- incidents：${(run.incidents || []).length}`);
  console.log(`- 下一步建议：${getNextSuggestion(run)}`);
  return 0;
}

async function mainContinue(argv) {
  const options = parseRunCommandArgs(argv);
  if (options.help || !options.runId) {
    console.log('ai-spec-auto spec-continue <runId> [目录] [--execute] [--executor codex|cursor|claude-code] [--dry-run] [--visual-url http://localhost:3001] [--hub-url http://localhost:3000]');
    return options.help ? 0 : 1;
  }
  const rootDir = path.resolve(process.cwd(), options.target);
  const runService = new RunService({ visualOptions: { visualUrl: options.visualUrl } });
  const run = runService.loadRun(rootDir, options.runId);
  if (run.state === 'human_review') {
    if (!options.execute) {
      console.log('执行器尚未接入，无法继续执行编码。');
      console.log('当前 run 正在等待人工确认；如需进入执行器阶段，请添加 --execute。');
      return 0;
    }
    const next = await new StageRunner({ runService }).runExecuting({
      rootDir,
      run,
      options: {
        executor: options.executor,
        dryRun: options.dryRun,
        visualUrl: options.visualUrl,
        hubUrl: options.hubUrl,
      },
    });
    const latestAfterExecute = runService.loadRun(rootDir, run.runId);
    await new VisualReporter().reportRunEvent(rootDir, latestAfterExecute, { type: 'executor_completed', detail: {} }, {
      visualUrl: options.visualUrl,
      type: latestAfterExecute.executor.status === 'failed' || latestAfterExecute.executor.status === 'timeout' ? 'executor_failed' : 'executor_completed',
      eventId: `${run.runId}:executor:${latestAfterExecute.executor.status || 'unknown'}`,
      executor: latestAfterExecute.executor.type || '',
      payload: {
        status: latestAfterExecute.executor.status || '',
        changedFiles: latestAfterExecute.executor.lastResult?.changedFiles || [],
      },
    });
    printRunSummary(options.dryRun ? 'spec-continue 执行器 dry-run 完成' : 'spec-continue 执行器阶段完成', next);
    const latest = runService.loadRun(rootDir, run.runId);
    console.log(`- executor：${latest.executor.type || '未选择'}`);
    console.log(`- executor 状态：${latest.executor.status || '未知'}`);
    console.log(`- 说明：${options.dryRun ? 'dry-run 只验证 Provider 选择和 prepare，不调用真实外部命令。' : '未执行 push / merge / PR。'}`);
    return 0;
  }
  if (run.state === 'suspended') {
    console.log('当前 run 已 suspended，请先处理 incident 后再继续。');
    return 0;
  }
  if (run.state === 'initialized') {
    const next = await new StageRunner({ runService }).runToHumanReview({ rootDir, runId: run.runId, options: { noWorktree: true, visualUrl: options.visualUrl } });
    if (options.execute) {
      const executed = await new StageRunner({ runService }).runExecuting({
        rootDir,
        run: next,
        options: {
          executor: options.executor,
          dryRun: options.dryRun,
          visualUrl: options.visualUrl,
          hubUrl: options.hubUrl,
        },
      });
      const latestAfterExecute = runService.loadRun(rootDir, run.runId);
      await new VisualReporter().reportRunEvent(rootDir, latestAfterExecute, { type: 'executor_completed', detail: {} }, {
        visualUrl: options.visualUrl,
        type: latestAfterExecute.executor.status === 'failed' || latestAfterExecute.executor.status === 'timeout' ? 'executor_failed' : 'executor_completed',
        eventId: `${run.runId}:executor:${latestAfterExecute.executor.status || 'unknown'}`,
        executor: latestAfterExecute.executor.type || '',
        payload: {
          status: latestAfterExecute.executor.status || '',
          changedFiles: latestAfterExecute.executor.lastResult?.changedFiles || [],
        },
      });
      printRunSummary(options.dryRun ? 'spec-continue 执行器 dry-run 完成' : 'spec-continue 执行器阶段完成', executed);
      return 0;
    }
    printRunSummary('spec-continue 完成', next);
    return 0;
  }
  console.log(`当前状态 ${run.state} 暂不支持继续，未执行真实 AI 编码。`);
  return 0;
}

async function mainList(argv) {
  const options = { target: '.' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      console.log('ai-spec-auto spec-list [目录]\n\n说明：列出当前项目所有 Spec。');
      return 0;
    }
    if (!arg.startsWith('-')) {
      options.target = arg;
    }
  }
  const rootDir = path.resolve(process.cwd(), options.target);
  const specWriter = new SpecWriter();
  const result = specWriter.list(rootDir);
  if (result.specs.length === 0) {
    console.log('当前项目无 Spec，请先执行 spec-start 创建。');
    return 0;
  }
  console.log(`共 ${result.specs.length} 个 Spec：`);
  console.log('');
  console.log(`${'specId'.padEnd(40)} ${'状态'.padEnd(12)} ${'创建时间'.padEnd(26)} 标题`);
  console.log('-'.repeat(100));
  for (const spec of result.specs) {
    console.log(`${spec.specId.padEnd(40)} ${(spec.status || '-').padEnd(12)} ${(spec.createdAt || '-').slice(0, 19).padEnd(26)} ${spec.title || '-'}`);
  }
  return 0;
}

async function mainSpecStatus(argv) {
  const options = { specId: '', target: '.' };
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      console.log('ai-spec-auto spec-detail <specId> [目录]\n\n说明：查看指定 Spec 的详细状态。');
      return 0;
    }
    if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }
  options.specId = positional[0] || '';
  options.target = positional[1] || '.';
  if (!options.specId) {
    console.log('错误：缺少 specId 参数。');
    console.log('用法：ai-spec-auto spec-detail <specId> [目录]');
    return 1;
  }
  const rootDir = path.resolve(process.cwd(), options.target);
  const specWriter = new SpecWriter();
  const status = specWriter.getStatus(rootDir, options.specId);
  if (!status) {
    console.log(`未找到 Spec：${options.specId}`);
    return 1;
  }
  console.log('Spec 详情：');
  console.log(`- specId：${status.specId}`);
  console.log(`- 标题：${status.meta.title || '-'}`);
  console.log(`- 状态：${status.meta.status || '-'}`);
  console.log(`- 创建时间：${status.meta.createdAt || '-'}`);
  console.log(`- 更新时间：${status.meta.updatedAt || '-'}`);
  console.log(`- 目录：${status.specDir}`);
  console.log(`- 文件：${status.files.join(', ')}`);
  return 0;
}

module.exports = {
  mainContinue,
  mainList,
  mainSpecStatus,
  mainStart,
  mainStatus,
  parseRunCommandArgs,
  parseStartArgs,
};
