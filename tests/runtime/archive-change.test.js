const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { archiveChange } = require('../../bin/archive-change');

function writeFile(targetDir, relPath, content) {
  const filePath = path.join(targetDir, relPath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${content}\n`, 'utf8');
}

function main() {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-spec-auto-archive-test-'));
  writeFile(targetDir, 'openspec/specs/ui/spec.md', [
    '## 新增需求',
    '',
    '### 需求：已有规范',
    '',
    '系统必须保留已有规范内容。',
  ].join('\n'));
  writeFile(targetDir, 'openspec/specs/api/spec.md', [
    '## 新增需求',
    '',
    '### 需求：已有接口规范',
    '',
    '系统必须保留已有 API 规范内容。',
  ].join('\n'));
  writeFile(targetDir, 'openspec/changes/add-demo-page/proposal.md', '# Proposal');
  writeFile(targetDir, 'openspec/changes/add-demo-page/design.md', '# Design');
  writeFile(targetDir, 'openspec/changes/add-demo-page/tasks.md', [
    '# Tasks',
    '',
    '- [x] step one',
    '- [ ] step two',
  ].join('\n'));
  writeFile(targetDir, 'openspec/changes/add-demo-page/checklist.md', '# Checklist');
  writeFile(targetDir, 'openspec/changes/add-demo-page/iterations.md', '# Iterations');
  writeFile(targetDir, 'openspec/changes/add-demo-page/specs/ui/spec.md', [
    '## 新增需求',
    '',
    '### 需求：新增演示页',
    '',
    '系统必须新增一个演示页。',
  ].join('\n'));
  writeFile(targetDir, 'openspec/changes/add-demo-page/specs/api/spec.md', [
    '## 新增需求',
    '',
    '### 需求：演示页数据来源',
    '',
    '系统必须明确演示页使用本地 mock 数据，不请求真实接口。',
  ].join('\n'));

  const result = archiveChange({
    target: targetDir,
    changeId: 'add-demo-page',
    now: new Date('2026-04-08T10:00:00.000Z'),
  });

  assert.strictEqual(result.status, 'success');
  assert.strictEqual(result.archived_to, 'openspec/changes/archive/2026-04-08-add-demo-page');
  assert.ok(fs.existsSync(path.join(targetDir, 'openspec/specs/ui/spec.md')));
  assert.ok(fs.existsSync(path.join(targetDir, 'openspec/specs/api/spec.md')));
  assert.ok(fs.existsSync(path.join(targetDir, result.archived_to, 'proposal.md')));
  assert.strictEqual(result.task_completion.completed, 1);
  assert.strictEqual(result.task_completion.total, 2);

  const mergedSpec = fs.readFileSync(path.join(targetDir, 'openspec/specs/ui/spec.md'), 'utf8');
  assert.ok(mergedSpec.includes('已有规范'));
  assert.ok(mergedSpec.includes('新增演示页'));
  const mergedApiSpec = fs.readFileSync(path.join(targetDir, 'openspec/specs/api/spec.md'), 'utf8');
  assert.ok(mergedApiSpec.includes('已有接口规范'));
  assert.ok(mergedApiSpec.includes('本地 mock 数据'));

  const targetDirWithRuntime = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-spec-auto-archive-runtime-test-'));
  writeFile(targetDirWithRuntime, '.ai-spec/current-run.json', JSON.stringify({
    schema_version: 1,
    kind: 'run-state',
    run_id: 'run_20260408_100000_test',
    status: 'running',
    current_role: 'archive-change',
    pending_gate: null,
    task: {
      change_id: 'archive-runtime-demo',
    },
    flow: {
      id: 'prd-to-delivery',
    },
    artifacts: {
      proposal: 'openspec/changes/archive-runtime-demo/proposal.md',
      specs: 'openspec/changes/archive-runtime-demo/specs/',
      design: 'openspec/changes/archive-runtime-demo/design.md',
      tasks: 'openspec/changes/archive-runtime-demo/tasks.md',
      checklist: 'openspec/changes/archive-runtime-demo/checklist.md',
      iterations: 'openspec/changes/archive-runtime-demo/iterations.md',
      additional: [
        'openspec/changes/archive-runtime-demo/specs/',
        'openspec/changes/archive-runtime-demo/notes.md',
      ],
    },
    events: [],
    timestamps: {
      created_at: '2026-04-08T10:00:00.000Z',
      updated_at: '2026-04-08T10:00:00.000Z',
    },
  }, null, 2));
  writeFile(targetDirWithRuntime, '.ai-spec/internal/current-dispatch.json', JSON.stringify({
    kind: 'expert-dispatch',
    run_id: 'run_20260408_100000_test',
    role: {
      id: 'archive-change',
    },
  }, null, 2));
  writeFile(targetDirWithRuntime, 'openspec/changes/archive-runtime-demo/proposal.md', '# Proposal');
  writeFile(targetDirWithRuntime, 'openspec/changes/archive-runtime-demo/design.md', '# Design');
  writeFile(targetDirWithRuntime, 'openspec/changes/archive-runtime-demo/tasks.md', '- [x] done');
  writeFile(targetDirWithRuntime, 'openspec/changes/archive-runtime-demo/checklist.md', '# Checklist');
  writeFile(targetDirWithRuntime, 'openspec/changes/archive-runtime-demo/iterations.md', '# Iterations');
  writeFile(targetDirWithRuntime, 'openspec/changes/archive-runtime-demo/specs/ui/spec.md', '# Spec');

  const runtimeResult = archiveChange({
    target: targetDirWithRuntime,
    changeId: 'archive-runtime-demo',
    completeRun: true,
    now: new Date('2026-04-08T11:00:00.000Z'),
  });

  assert.strictEqual(runtimeResult.runtime_transition.state.status, 'success');
  assert.strictEqual(runtimeResult.runtime_transition.state.current_role, 'archive-change');
  assert.ok(runtimeResult.runtime_transition.state.artifacts.proposal.includes('openspec/changes/archive/'));
  assert.ok(!runtimeResult.runtime_transition.state.artifacts.additional.includes('openspec/changes/archive-runtime-demo/specs'));
  assert.ok(runtimeResult.runtime_transition.state.artifacts.additional.includes('openspec/changes/archive/2026-04-08-archive-runtime-demo/notes.md'));
  assert.ok(!fs.existsSync(path.join(targetDirWithRuntime, '.ai-spec', 'internal', 'current-dispatch.json')));

  console.log('archive-change test passed: spec merge and change archive complete');
}

main();
