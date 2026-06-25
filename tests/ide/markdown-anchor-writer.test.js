const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { MarkdownAnchorWriter, buildAgentsMdBlock, buildClaudeMdBlock, buildMemoryMdBlock } = require('../../src/ide/anchors/markdown-anchor-writer');

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ai-spec-test-anchor-'));
}

async function testBuildBlocks() {
  const agentsBlock = buildAgentsMdBlock();
  assert(agentsBlock.includes('<!-- AI-SPEC-AUTO:START -->'));
  assert(agentsBlock.includes('<!-- AI-SPEC-AUTO:END -->'));
  assert(agentsBlock.includes('.ai-spec/project.json'));
  assert(agentsBlock.includes('.agents/registry.index.json'));
  assert(agentsBlock.includes('.ai-spec/context-index.json'));

  const claudeBlock = buildClaudeMdBlock();
  assert(claudeBlock.includes('/spec-start'));
  assert(claudeBlock.includes('/spec-continue'));
  assert(claudeBlock.includes('.agents/registry/ide-registry.json'));

  const memoryBlock = buildMemoryMdBlock();
  assert(memoryBlock.includes('记忆锚点'));
  assert(memoryBlock.includes('禁止写入'));
  assert(memoryBlock.includes('.ai-spec/ai-spec.lock.json'));
}

async function testWriteCreatesNewFile() {
  const root = createTempDir();
  const writer = new MarkdownAnchorWriter();

  const result = writer.write(root, 'AGENTS.md');
  assert.strictEqual(result.action, 'create');
  assert.strictEqual(result.path, 'AGENTS.md');

  const content = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
  assert(content.includes('AI-SPEC-AUTO:START'));
  assert(content.includes('AI-SPEC-AUTO:END'));
  assert(content.includes('.ai-spec/project.json'));
}

async function testWriteUpdatesExistingBlock() {
  const root = createTempDir();
  const writer = new MarkdownAnchorWriter();

  // 创建带锚点的文件
  const originalContent = [
    '# 用户自定义内容',
    '保留这一行。',
    '<!-- AI-SPEC-AUTO:START -->',
    '旧内容',
    '<!-- AI-SPEC-AUTO:END -->',
    '结尾内容',
  ].join('\n');
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), originalContent, 'utf8');

  const result = writer.write(root, 'CLAUDE.md');
  assert.strictEqual(result.action, 'update');

  const content = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8');
  assert(content.includes('用户自定义内容'));
  assert(content.includes('保留这一行'));
  assert(content.includes('结尾内容'));
  assert(!content.includes('旧内容'));
  assert(content.includes('/spec-start'));
}

async function testWritePreservesContentOutsideBlock() {
  const root = createTempDir();
  const writer = new MarkdownAnchorWriter();

  const originalContent = [
    '# 用户项目说明',
    '',
    '这是项目自定义说明。',
    '',
    '<!-- AI-SPEC-AUTO:START -->',
    '旧指针',
    '<!-- AI-SPEC-AUTO:END -->',
    '',
    '## 自定义章节',
    '更多用户内容。',
  ].join('\n');
  fs.writeFileSync(path.join(root, 'AGENTS.md'), originalContent, 'utf8');

  writer.write(root, 'AGENTS.md');

  const content = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
  assert(content.includes('用户项目说明'));
  assert(content.includes('这是项目自定义说明'));
  assert(content.includes('自定义章节'));
  assert(content.includes('更多用户内容'));
  assert(!content.includes('旧指针'));
}

async function testWriteDryRunDoesNotWrite() {
  const root = createTempDir();
  const writer = new MarkdownAnchorWriter();

  // 创建已有文件
  const originalContent = '<!-- AI-SPEC-AUTO:START -->\n旧内容\n<!-- AI-SPEC-AUTO:END -->\n';
  fs.writeFileSync(path.join(root, 'memory.md'), originalContent, 'utf8');

  const result = writer.write(root, 'memory.md', { dryRun: true });
  assert.strictEqual(result.action, 'update');

  // dry-run 不修改内容
  const content = fs.readFileSync(path.join(root, 'memory.md'), 'utf8');
  assert.strictEqual(content, originalContent);
}

async function testWriteIdempotent() {
  const root = createTempDir();
  const writer = new MarkdownAnchorWriter();

  // 第一次写入
  writer.write(root, 'AGENTS.md');
  const content1 = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');

  // 第二次写入
  writer.write(root, 'AGENTS.md');
  const content2 = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');

  // 幂等验证：两次写入结果相同
  assert.strictEqual(content1, content2);
}

async function testCheck() {
  const root = createTempDir();
  const writer = new MarkdownAnchorWriter();

  // 文件不存在
  const result1 = writer.check(root, 'memory.md');
  assert.strictEqual(result1.exists, false);
  assert.strictEqual(result1.hasAnchor, false);

  // 文件存在但没有锚点
  fs.writeFileSync(path.join(root, 'memory.md'), '# Just a note\n', 'utf8');
  const result2 = writer.check(root, 'memory.md');
  assert.strictEqual(result2.exists, true);
  assert.strictEqual(result2.hasAnchor, false);

  // 文件存在且有锚点
  writer.write(root, 'memory.md');
  const result3 = writer.check(root, 'memory.md');
  assert.strictEqual(result3.exists, true);
  assert.strictEqual(result3.hasAnchor, true);
}

async function testUnsupportedFileThrows() {
  const root = createTempDir();
  const writer = new MarkdownAnchorWriter();

  assert.throws(() => {
    writer.write(root, 'unknown.md');
  }, /不支持的文件/);
}

async function main() {
  await testBuildBlocks();
  await testWriteCreatesNewFile();
  await testWriteUpdatesExistingBlock();
  await testWritePreservesContentOutsideBlock();
  await testWriteDryRunDoesNotWrite();
  await testWriteIdempotent();
  await testCheck();
  await testUnsupportedFileThrows();
  console.log('markdown-anchor-writer tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
