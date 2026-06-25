const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { CursorAdapter, buildCursorRuleContent, buildCommandContent } = require('../../src/ide/adapters/cursor-adapter');

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ai-spec-test-cursor-'));
}

async function testBuildCursorRuleContent() {
  const content = buildCursorRuleContent();
  assert(content.includes('ai-spec-auto'));
  assert(content.includes('ide-registry.json'));
  assert(content.includes('registry.index.json'));
  assert(content.includes('context-index.json'));
  assert(content.includes('ai-spec.lock.json'));
  assert(content.includes('alwaysApply: true'));
}

async function testBuildCommandContent() {
  const specStart = buildCommandContent('spec-start', 'react');
  assert(specStart.includes('/spec-start'));
  assert(specStart.includes('React'));
  assert(specStart.includes('.agents/registry/ide-registry.json'));
  assert(specStart.includes('所有输出使用中文'));

  const specUpdate = buildCommandContent('spec-update', 'vue');
  assert(specUpdate.includes('/spec-update'));
  assert(specUpdate.includes('current-run.json'));
  assert(specUpdate.includes('所有输出使用中文'));

  const specStatus = buildCommandContent('spec-status', 'react');
  assert(specStatus.includes('/spec-status'));
  assert(specStatus.includes('current-run.json'));

  const unknown = buildCommandContent('unknown', 'react');
  assert.strictEqual(unknown, '');
}

async function testGenerateFiles() {
  const adapter = new CursorAdapter();
  const output = adapter.generateFiles({ profile: 'react' });

  assert.strictEqual(output.adapterId, 'cursor');
  assert(Array.isArray(output.files));
  assert(output.files.length === 9);
  assert(output.files[0].relativePath === '.cursor/rules/ai-spec-auto.mdc');
  assert(output.files[1].relativePath === '.cursor/rules/00-project-overview.mdc');
  assert(output.files[6].relativePath === '.cursor/commands/spec-start.md');
  assert(output.files[7].relativePath === '.cursor/commands/spec-update.md');
  assert(output.files[8].relativePath === '.cursor/commands/spec-status.md');
}

async function testWrite() {
  const root = createTempDir();
  const adapter = new CursorAdapter();

  const results = adapter.write(root, { profile: 'react' });
  assert.strictEqual(results.length, 9);

  for (const result of results) {
    assert.strictEqual(result.action, 'create');
    const filePath = path.join(root, result.path);
    assert(fs.existsSync(filePath), `${result.path} 应该被创建`);
  }

  // 验证 .cursor/rules/ai-spec-auto.mdc 内容
  const ruleContent = fs.readFileSync(path.join(root, '.cursor/rules/ai-spec-auto.mdc'), 'utf8');
  assert(ruleContent.includes('alwaysApply: true'));
  assert(ruleContent.includes('ai-spec-auto'));
}

async function testWriteDryRun() {
  const root = createTempDir();
  const adapter = new CursorAdapter();

  const results = adapter.write(root, { profile: 'react', dryRun: true });
  assert.strictEqual(results.length, 9);

  // dry-run 不创建文件
  for (const result of results) {
    assert.strictEqual(result.action, 'create');
    assert(!fs.existsSync(path.join(root, result.path)));
  }
}

async function testWriteUpdate() {
  const root = createTempDir();
  const adapter = new CursorAdapter();

  // 先创建
  adapter.write(root, { profile: 'react' });

  // 再写入（应该 update）
  const results = adapter.write(root, { profile: 'react' });
  for (const result of results) {
    assert.strictEqual(result.action, 'update');
  }
}

async function testCheck() {
  const root = createTempDir();
  const adapter = new CursorAdapter();

  // 写入前检查
  const beforeCheck = adapter.check(root);
  for (const item of beforeCheck) {
    assert.strictEqual(item.exists, false);
  }

  // 写入后检查
  adapter.write(root, { profile: 'react' });
  const afterCheck = adapter.check(root);
  for (const item of afterCheck) {
    assert.strictEqual(item.exists, true);
  }
}

async function main() {
  await testBuildCursorRuleContent();
  await testBuildCommandContent();
  await testGenerateFiles();
  await testWrite();
  await testWriteDryRun();
  await testWriteUpdate();
  await testCheck();
  console.log('cursor-adapter tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
