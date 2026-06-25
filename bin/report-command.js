const fs = require('fs');
const path = require('path');
const { RunService } = require('../src/run/run-service');
const { RunStore, writeJson } = require('../src/run/run-store');

function parseArgs(argv) {
  const options = { runId: '', target: '.', format: 'json' };
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--format') {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) throw new Error('缺少 --format 参数值');
      options.format = value;
      index += 1;
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }
  options.runId = positional[0] || '';
  options.target = positional[1] || '.';
  return options;
}

function printUsage() {
  console.log(`ai-spec-auto report <runId> [目录] [--format json|md]

说明：
  生成 Evidence Report，包含 run 的完整执行记录。`);
}

function loadRunEvents(rootDir, runId) {
  const runsDir = new RunStore().getRunsDir(rootDir);
  const eventsPath = path.join(runsDir, runId, 'events.ndjson');
  if (!fs.existsSync(eventsPath)) return [];
  try {
    return fs.readFileSync(eventsPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try { return JSON.parse(line); } catch (_e) { return null; }
      })
      .filter(Boolean);
  } catch (_e) {
    return [];
  }
}

function loadRepairHistory(rootDir, runId) {
  const runsDir = new RunStore().getRunsDir(rootDir);
  const repairPath = path.join(runsDir, runId, 'repair-history.json');
  if (!fs.existsSync(repairPath)) return { repairs: [] };
  try {
    return JSON.parse(fs.readFileSync(repairPath, 'utf8'));
  } catch (_e) {
    return { repairs: [] };
  }
}

function buildEvidenceReport(rootDir, run) {
  const now = new Date().toISOString();
  const configPath = path.join(rootDir, '.ai-spec', 'config.json');
  let projectId = '';
  if (fs.existsSync(configPath)) {
    try {
      projectId = JSON.parse(fs.readFileSync(configPath, 'utf8')).projectId || '';
    } catch (_e) { /* ignore */ }
  }

  const events = loadRunEvents(rootDir, run.runId);
  const repairHistory = loadRepairHistory(rootDir, run.runId);

  // 从 run 的 executor 中获取变更文件
  const changedFiles = run.executor?.lastResult?.changedFiles || [];

  // 从 events 中提取 hook 和 test 结果
  const hookResults = events
    .filter((e) => e.type && e.type.includes('hook'))
    .map((e) => ({ hookId: e.type, status: e.detail?.status || 'unknown', message: e.message }));

  const testResults = events
    .filter((e) => e.type && e.type.includes('test'))
    .map((e) => ({ testId: e.type, status: e.detail?.status || 'unknown', message: e.message }));

  const finalStatus = run.state === 'completed' ? '通过'
    : run.state === 'suspended' ? '阻塞'
    : run.incidents?.length > 0 ? '失败'
    : '待执行';

  return {
    runId: run.runId,
    projectId,
    taskId: run.runId,
    specId: run.runId,
    requirement: run.requirement?.summary || '',
    state: run.state,
    changedFiles,
    testResults,
    hookResults,
    repairResults: repairHistory.repairs || [],
    reviewResults: [],
    finalStatus,
    events: events.map((e) => ({
      type: e.type,
      message: e.message,
      createdAt: e.createdAt,
    })),
    incidents: run.incidents || [],
    generatedAt: now,
  };
}

function buildMarkdownReport(report) {
  const lines = [
    '# Evidence Report',
    '',
    `| 字段 | 值 |`,
    `|------|-----|`,
    `| runId | ${report.runId} |`,
    `| projectId | ${report.projectId} |`,
    `| specId | ${report.specId} |`,
    `| 需求 | ${report.requirement} |`,
    `| 状态 | ${report.state} |`,
    `| 最终结论 | ${report.finalStatus} |`,
    `| 生成时间 | ${report.generatedAt} |`,
    '',
    `## 变更文件`,
    '',
  ];

  if (report.changedFiles.length === 0) {
    lines.push('（无变更文件）');
  } else {
    for (const f of report.changedFiles) {
      lines.push(`- ${f}`);
    }
  }

  lines.push('');
  lines.push('## Hook 结果');
  lines.push('');
  if (report.hookResults.length === 0) {
    lines.push('（无 Hook 结果）');
  } else {
    lines.push('| Hook | 状态 | 消息 |');
    lines.push('|------|------|------|');
    for (const h of report.hookResults) {
      lines.push(`| ${h.hookId} | ${h.status} | ${h.message || '-'} |`);
    }
  }

  lines.push('');
  lines.push('## 测试结果');
  lines.push('');
  if (report.testResults.length === 0) {
    lines.push('（无测试结果）');
  } else {
    lines.push('| 测试 | 状态 | 消息 |');
    lines.push('|------|------|------|');
    for (const t of report.testResults) {
      lines.push(`| ${t.testId} | ${t.status} | ${t.message || '-'} |`);
    }
  }

  lines.push('');
  lines.push('## 修复记录');
  lines.push('');
  if (report.repairResults.length === 0) {
    lines.push('（无修复记录）');
  } else {
    for (const r of report.repairResults) {
      lines.push(`- 修复 #${r.attemptNumber}：${r.status}（${r.reason || '-'}）`);
    }
  }

  lines.push('');
  lines.push('## 事件时间线');
  lines.push('');
  for (const e of report.events) {
    lines.push(`- [${e.createdAt || '-'}] ${e.type}：${e.message}`);
  }

  return lines.join('\n');
}

async function main(argv) {
  const options = parseArgs(argv);
  if (options.help || !options.runId) {
    printUsage();
    return options.help ? 0 : 1;
  }

  const rootDir = path.resolve(process.cwd(), options.target);

  let run;
  try {
    run = new RunService().loadRun(rootDir, options.runId);
  } catch (e) {
    console.log(`错误：未找到 run ${options.runId}`);
    return 1;
  }

  const report = buildEvidenceReport(rootDir, run);

  // 保存到 reports/ai-spec/{runId}/
  const reportDir = path.join(rootDir, 'reports', 'ai-spec', run.runId);
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  // JSON 格式
  const jsonPath = path.join(reportDir, 'evidence-report.json');
  writeJson(jsonPath, report);

  // Markdown 格式
  const mdPath = path.join(reportDir, 'summary.md');
  fs.writeFileSync(mdPath, buildMarkdownReport(report), 'utf8');

  console.log('Evidence Report 已生成：');
  console.log(`- JSON：${jsonPath}`);
  console.log(`- Markdown：${mdPath}`);
  console.log(`- 最终状态：${report.finalStatus}`);
  console.log(`- 变更文件：${report.changedFiles.length} 个`);
  console.log(`- Hook 结果：${report.hookResults.length} 个`);
  console.log(`- 测试结果：${report.testResults.length} 个`);
  console.log(`- 修复记录：${report.repairResults.length} 次`);
  return 0;
}

module.exports = {
  main,
  parseArgs,
  buildEvidenceReport,
};
