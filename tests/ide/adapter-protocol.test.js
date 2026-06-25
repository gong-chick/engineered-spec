const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  IDEAdapter,
  createAdapterInput,
  createAdapterOutput,
  createValidationResult,
  validateAdapterConsistency,
} = require('../../src/ide/adapters/adapter-protocol');
const { CursorAdapter } = require('../../src/ide/adapters/cursor-adapter');
const { ClaudeAdapter } = require('../../src/ide/adapters/claude-adapter');
const { CodexAdapter } = require('../../src/ide/adapters/codex-adapter');

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ai-spec-test-protocol-'));
}

// ============================================================
// P1.2.1 — IDEAdapter 接口
// ============================================================

async function testIdeAdapterBaseClass() {
  const base = new IDEAdapter();
  // adapterId 是 getter，基类抛出错误要求子类实现
  assert.throws(() => base.adapterId, /adapterId 必须由子类实现/);
  assert.strictEqual(typeof base.detect, 'function');
  assert.strictEqual(typeof base.generateFiles, 'function');
  assert.strictEqual(typeof base.validate, 'function');
  assert.strictEqual(typeof base.diff, 'function');
  assert.strictEqual(typeof base.rollback, 'function');
  assert.strictEqual(typeof base.write, 'function');
  assert.strictEqual(typeof base.check, 'function');
}

async function testIdeAdapterRequiresSubclass() {
  const base = new IDEAdapter();
  assert.throws(() => base.adapterId, /adapterId 必须由子类实现/);
  assert.throws(() => base.generateFiles(), /generateFiles 必须由子类实现/);
}

// ============================================================
// P1.2.2 — AdapterInput
// ============================================================

async function testCreateAdapterInput() {
  const input = createAdapterInput('/tmp/test');
  assert.strictEqual(input.rootDir, '/tmp/test');
  assert.strictEqual(input.profile, 'auto');
  assert.strictEqual(input.projectConfig, null);
  assert.strictEqual(input.manifest, null);
  assert.deepStrictEqual(input.options, {});
}

async function testCreateAdapterInputWithOverrides() {
  const input = createAdapterInput('/tmp/test', {
    profile: 'react',
    projectConfig: { version: '0.1.0' },
  });
  assert.strictEqual(input.profile, 'react');
  assert.deepStrictEqual(input.projectConfig, { version: '0.1.0' });
}

// ============================================================
// P1.2.3 — AdapterOutput
// ============================================================

async function testCreateAdapterOutput() {
  const files = [
    { relativePath: '.cursor/rules/test.mdc', content: 'test', type: 'rule' },
  ];
  const output = createAdapterOutput('cursor', files);
  assert.strictEqual(output.adapterId, 'cursor');
  assert.deepStrictEqual(output.files, files);
  assert(Array.isArray(output.warnings));
  assert.strictEqual(output.warnings.length, 0);
  assert(typeof output.generatedAt === 'string');
}

async function testCreateAdapterOutputWithWarnings() {
  const output = createAdapterOutput('cursor', [], ['警告信息']);
  assert.strictEqual(output.warnings.length, 1);
  assert.strictEqual(output.warnings[0], '警告信息');
}

// ============================================================
// P1.2.4 — ValidationResult
// ============================================================

async function testCreateValidationResultOk() {
  const result = createValidationResult([]);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.errorCount, 0);
  assert.strictEqual(result.warningCount, 0);
}

async function testCreateValidationResultWithError() {
  const result = createValidationResult([
    { severity: 'error', path: 'test', message: '错误' },
  ]);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.errorCount, 1);
}

async function testCreateValidationResultWarningOnly() {
  const result = createValidationResult([
    { severity: 'warning', path: 'test', message: '警告' },
  ]);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.warningCount, 1);
}

// ============================================================
// P1.2.5 — Codex 协议预留
// ============================================================

async function testCodexAdapterConformsToProtocol() {
  const adapter = new CodexAdapter();
  assert(adapter instanceof IDEAdapter);
  assert.strictEqual(adapter.adapterId, 'codex');

  const detectResult = adapter.detect({ rootDir: '/tmp' });
  assert.strictEqual(detectResult.applicable, false);

  const output = adapter.generateFiles({});
  assert.strictEqual(output.adapterId, 'codex');
  assert(Array.isArray(output.files));
  assert.strictEqual(output.files.length, 0);
  assert(output.warnings.length > 0);

  const validResult = adapter.validate('/tmp');
  assert.strictEqual(validResult.ok, true);

  const diffResult = adapter.diff('/tmp');
  assert(Array.isArray(diffResult));
  assert.strictEqual(diffResult.length, 0);

  const rollbackResult = adapter.rollback('/tmp');
  assert(Array.isArray(rollbackResult.deletedFiles));
  assert(Array.isArray(rollbackResult.errors));
}

// ============================================================
// P1.2.6 — 适配输出一致性校验
// ============================================================

async function testConsistencyValidatorHappyPath() {
  const cursorOutput = createAdapterOutput('cursor', [
    { relativePath: '.cursor/rules/entry.mdc', content: '', type: 'pointer-rule' },
    { relativePath: '.cursor/commands/spec-start.md', content: '', type: 'command' },
  ]);
  const claudeOutput = createAdapterOutput('claude', [
    { relativePath: '.claude/ai-spec-auto.md', content: '', type: 'pointer-entry' },
    { relativePath: '.claude/commands/spec-start.md', content: '', type: 'command' },
  ]);

  const result = validateAdapterConsistency([cursorOutput, claudeOutput]);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.errorCount, 0);
}

async function testConsistencyValidatorMissingSpecStart() {
  const cursorOutput = createAdapterOutput('cursor', [
    { relativePath: '.cursor/rules/entry.mdc', content: '', type: 'pointer-rule' },
  ]);

  const result = validateAdapterConsistency([cursorOutput]);
  assert.strictEqual(result.ok, false);
  assert(result.issues.some((i) => i.rule === 'core-command-coverage'));
}

async function testConsistencyValidatorNoEntryFile() {
  const output = createAdapterOutput('test', [
    { relativePath: 'test/commands/spec-start.md', content: '', type: 'command' },
  ]);

  const result = validateAdapterConsistency([output]);
  assert(result.issues.some((i) => i.rule === 'entry-file-exists'));
}

async function testConsistencyValidatorEmpty() {
  const result = validateAdapterConsistency([]);
  assert(result.issues.some((i) => i.rule === 'non-empty'));
}

// ============================================================
// 适配器继承 IDEAdapter
// ============================================================

async function testCursorAdapterExtendsIDEAdapter() {
  const adapter = new CursorAdapter();
  assert(adapter instanceof IDEAdapter);
  assert.strictEqual(adapter.adapterId, 'cursor');
}

async function testClaudeAdapterExtendsIDEAdapter() {
  const adapter = new ClaudeAdapter();
  assert(adapter instanceof IDEAdapter);
  assert.strictEqual(adapter.adapterId, 'claude');
}

async function testCursorAdapterDetect() {
  const root = createTempDir();
  fs.mkdirSync(path.join(root, '.ai-spec'), { recursive: true });

  const adapter = new CursorAdapter();
  const result = adapter.detect({ rootDir: root });
  assert.strictEqual(result.applicable, true);
}

async function testCursorAdapterValidate() {
  const root = createTempDir();
  const adapter = new CursorAdapter();
  adapter.write(root, { profile: 'react' });

  const result = adapter.validate(root, { profile: 'react' });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.errorCount, 0);
}

async function testCursorAdapterValidateMissing() {
  const root = createTempDir();
  const adapter = new CursorAdapter();

  const result = adapter.validate(root);
  assert.strictEqual(result.ok, false);
  assert(result.errorCount > 0);
}

async function testCursorAdapterDiff() {
  const root = createTempDir();
  const adapter = new CursorAdapter();
  adapter.write(root, { profile: 'react' });

  const diff = adapter.diff(root, { profile: 'react' });
  assert(diff.every((d) => d.status === 'same'));
}

async function testCursorAdapterDiffMissing() {
  const root = createTempDir();
  const adapter = new CursorAdapter();

  const diff = adapter.diff(root);
  assert(diff.every((d) => d.status === 'missing'));
}

async function testCursorAdapterRollback() {
  const root = createTempDir();
  const adapter = new CursorAdapter();
  adapter.write(root, { profile: 'react' });

  const result = adapter.rollback(root);
  assert(result.deletedFiles.length > 0);
  assert.strictEqual(result.errors.length, 0);

  // 验证文件已删除
  for (const file of result.deletedFiles) {
    assert(!fs.existsSync(path.join(root, file)), `${file} 应该被删除`);
  }
}

async function testClaudeAdapterValidate() {
  const root = createTempDir();
  const adapter = new ClaudeAdapter();
  adapter.write(root, { profile: 'react' });

  const result = adapter.validate(root, { profile: 'react' });
  assert.strictEqual(result.ok, true);
}

async function testClaudeAdapterRollback() {
  const root = createTempDir();
  const adapter = new ClaudeAdapter();
  adapter.write(root, { profile: 'react' });

  const result = adapter.rollback(root);
  assert(result.deletedFiles.length === 12);
  assert.strictEqual(result.errors.length, 0);
}

// ============================================================
// barrel 导出
// ============================================================

async function testIndexExports() {
  const exports = require('../../src/ide/adapters/index');
  assert.strictEqual(typeof exports.IDEAdapter, 'function');
  assert.strictEqual(typeof exports.CursorAdapter, 'function');
  assert.strictEqual(typeof exports.ClaudeAdapter, 'function');
  assert.strictEqual(typeof exports.CodexAdapter, 'function');
  assert.strictEqual(typeof exports.createAdapterInput, 'function');
  assert.strictEqual(typeof exports.createAdapterOutput, 'function');
  assert.strictEqual(typeof exports.createValidationResult, 'function');
  assert.strictEqual(typeof exports.validateAdapterConsistency, 'function');
  assert.strictEqual(typeof exports.buildCursorRuleContent, 'function');
  assert.strictEqual(typeof exports.buildCommandContent, 'function');
  assert.strictEqual(typeof exports.buildClaudeEntryContent, 'function');
  assert.strictEqual(typeof exports.buildClaudeCommandContent, 'function');
}

// ============================================================
// main
// ============================================================

async function main() {
  // P1.2.1 — IDEAdapter 接口
  await testIdeAdapterBaseClass();
  await testIdeAdapterRequiresSubclass();

  // P1.2.2 — AdapterInput
  await testCreateAdapterInput();
  await testCreateAdapterInputWithOverrides();

  // P1.2.3 — AdapterOutput
  await testCreateAdapterOutput();
  await testCreateAdapterOutputWithWarnings();

  // P1.2.4 — ValidationResult
  await testCreateValidationResultOk();
  await testCreateValidationResultWithError();
  await testCreateValidationResultWarningOnly();

  // P1.2.5 — Codex 协议预留
  await testCodexAdapterConformsToProtocol();

  // P1.2.6 — 适配输出一致性校验
  await testConsistencyValidatorHappyPath();
  await testConsistencyValidatorMissingSpecStart();
  await testConsistencyValidatorNoEntryFile();
  await testConsistencyValidatorEmpty();

  // 适配器继承验证
  await testCursorAdapterExtendsIDEAdapter();
  await testClaudeAdapterExtendsIDEAdapter();
  await testCursorAdapterDetect();
  await testCursorAdapterValidate();
  await testCursorAdapterValidateMissing();
  await testCursorAdapterDiff();
  await testCursorAdapterDiffMissing();
  await testCursorAdapterRollback();
  await testClaudeAdapterValidate();
  await testClaudeAdapterRollback();

  // barrel 导出
  await testIndexExports();

  console.log('adapter-protocol tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
