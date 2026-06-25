const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ClaudeAdapter, buildClaudeEntryContent, buildClaudeCommandContent } = require('../../src/ide/adapters/claude-adapter');

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ai-spec-test-claude-'));
}

async function testBuildClaudeEntryContent() {
  const content = buildClaudeEntryContent();
  assert(content.includes('ai-spec-auto'));
  assert(content.includes('ide-registry.json'));
  assert(content.includes('registry.index.json'));
  assert(content.includes('context-index.json'));
  assert(content.includes('ai-spec.lock.json'));
  assert(content.includes('所有提示和错误输出必须使用中文'));
}

async function testBuildClaudeCommandContent() {
  const specStart = buildClaudeCommandContent('spec-start', 'react');
  assert(specStart.includes('/spec-start'));
  assert(specStart.includes('React'));
  assert(specStart.includes('所有输出使用中文'));

  const specUpdate = buildClaudeCommandContent('spec-update', 'vue');
  assert(specUpdate.includes('/spec-update'));
  assert(specUpdate.includes('current-run.json'));
  assert(specUpdate.includes('所有输出使用中文'));

  const specStatus = buildClaudeCommandContent('spec-status', 'react');
  assert(specStatus.includes('/spec-status'));
  assert(specStatus.includes('current-run.json'));

  const unknown = buildClaudeCommandContent('unknown', 'react');
  assert.strictEqual(unknown, '');
}

async function testGenerateFiles() {
  const adapter = new ClaudeAdapter();
  const output = adapter.generateFiles({ profile: 'vue' });

  assert.strictEqual(output.adapterId, 'claude');
  assert(Array.isArray(output.files));
  assert(output.files.length === 12);
  assert(output.files[0].relativePath === '.claude/ai-spec-auto.md');
  assert(output.files[1].relativePath === '.claude/commands/spec-start.md');
  assert(output.files[2].relativePath === '.claude/commands/spec-update.md');
  assert(output.files[3].relativePath === '.claude/commands/spec-status.md');
  assert(output.files[4].relativePath === '.claude/commands/spec-implement.md');
}

async function testWrite() {
  const root = createTempDir();
  const adapter = new ClaudeAdapter();

  const results = adapter.write(root, { profile: 'react' });
  assert.strictEqual(results.length, 12);

  for (const result of results) {
    assert.strictEqual(result.action, 'create');
    const filePath = path.join(root, result.path);
    assert(fs.existsSync(filePath), `${result.path} 应该被创建`);
  }

  // 验证 .claude/ai-spec-auto.md 内容
  const entryContent = fs.readFileSync(path.join(root, '.claude/ai-spec-auto.md'), 'utf8');
  assert(entryContent.includes('AI 开发协作者'));
  assert(entryContent.includes('必读索引'));
}

async function testWriteDryRun() {
  const root = createTempDir();
  const adapter = new ClaudeAdapter();

  const results = adapter.write(root, { profile: 'vue', dryRun: true });
  assert.strictEqual(results.length, 12);

  for (const result of results) {
    assert.strictEqual(result.action, 'create');
    assert(!fs.existsSync(path.join(root, result.path)));
  }
}

async function testWriteUpdate() {
  const root = createTempDir();
  const adapter = new ClaudeAdapter();

  adapter.write(root, { profile: 'react' });
  const results = adapter.write(root, { profile: 'react' });
  for (const result of results) {
    assert.strictEqual(result.action, 'update');
  }
}

async function testCheck() {
  const root = createTempDir();
  const adapter = new ClaudeAdapter();

  const beforeCheck = adapter.check(root);
  for (const item of beforeCheck) {
    assert.strictEqual(item.exists, false);
  }

  adapter.write(root, { profile: 'react' });
  const afterCheck = adapter.check(root);
  for (const item of afterCheck) {
    assert.strictEqual(item.exists, true);
  }
}

async function main() {
  await testBuildClaudeEntryContent();
  await testBuildClaudeCommandContent();
  await testGenerateFiles();
  await testWrite();
  await testWriteDryRun();
  await testWriteUpdate();
  await testCheck();
  console.log('claude-adapter tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
