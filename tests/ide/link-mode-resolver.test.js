const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { LinkModeResolver } = require('../../src/ide/links/link-mode-resolver');
const { LINK_MODES, SYNC_ACTIONS } = require('../../src/ide/ide-types');

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ai-spec-test-link-'));
}

async function testCopyModeCreatesFile() {
  const root = createTempDir();
  const resolver = new LinkModeResolver();

  const content = '# Test file\nContent here.\n';
  const result = resolver.write(root, '.cursor/test-file.md', content, {
    mode: LINK_MODES.COPY,
  });

  assert.strictEqual(result.path, '.cursor/test-file.md');
  assert.strictEqual(result.action, SYNC_ACTIONS.CREATE);
  assert.strictEqual(result.modeUsed, LINK_MODES.COPY);
  assert(fs.existsSync(path.join(root, '.cursor/test-file.md')));

  const fileContent = fs.readFileSync(path.join(root, '.cursor/test-file.md'), 'utf8');
  assert(fileContent.includes('Test file'));
}

async function testCopyModeUpdatesExistingFile() {
  const root = createTempDir();
  const resolver = new LinkModeResolver();

  // 创建已有文件
  const dirPath = path.join(root, '.cursor');
  fs.mkdirSync(dirPath, { recursive: true });
  fs.writeFileSync(path.join(root, '.cursor/test-file.md'), 'Old content', 'utf8');

  const result = resolver.write(root, '.cursor/test-file.md', 'New content', {
    mode: LINK_MODES.COPY,
  });

  assert.strictEqual(result.action, SYNC_ACTIONS.UPDATE);
  assert.strictEqual(result.modeUsed, LINK_MODES.COPY);
}

async function testSymlinkModeSingleFileFailsWithoutSource() {
  const root = createTempDir();
  const resolver = new LinkModeResolver();

  // 单文件无 symlink 源，symlink 模式应报错
  assert.throws(() => {
    resolver.write(root, '.cursor/rules/test.mdc', '# Content', {
      mode: LINK_MODES.SYMLINK,
    });
  }, /symlink/);
}

async function testAutoModeFallsBackToCopy() {
  const root = createTempDir();
  const resolver = new LinkModeResolver();

  const result = resolver.write(root, '.cursor/rules/test.mdc', '# Content', {
    mode: LINK_MODES.AUTO,
  });

  // 单文件应该自动降级为 copy
  assert.strictEqual(result.modeUsed, LINK_MODES.COPY);
  assert(fs.existsSync(path.join(root, '.cursor/rules/test.mdc')));
  assert(result.warnings.length > 0);
  assert(result.warnings[0].includes('降级'));
}

async function testCopyWritesContentCorrectly() {
  const root = createTempDir();
  const resolver = new LinkModeResolver();

  const content = [
    '---',
    'description: Test',
    'alwaysApply: true',
    '---',
    '',
    '# Test Content',
    'Line 1',
    'Line 2',
  ].join('\n');

  resolver.write(root, '.cursor/rules/ai-spec-auto.mdc', content, { mode: LINK_MODES.COPY });
  const fileContent = fs.readFileSync(path.join(root, '.cursor/rules/ai-spec-auto.mdc'), 'utf8');
  assert(fileContent.includes('# Test Content'));
  assert(fileContent.includes('alwaysApply: true'));
}

async function testNestedDirectoryCreatedAutomatically() {
  const root = createTempDir();
  const resolver = new LinkModeResolver();

  resolver.write(root, '.cursor/commands/spec-start.md', '# Command', { mode: LINK_MODES.COPY });
  assert(fs.existsSync(path.join(root, '.cursor/commands/spec-start.md')));
}

async function testDryRunDoesNotWrite() {
  const root = createTempDir();
  const resolver = new LinkModeResolver();

  const result = resolver.write(root, '.cursor/rules/test.mdc', '# Content', {
    mode: LINK_MODES.COPY,
    dryRun: true,
  });

  assert.strictEqual(result.action, SYNC_ACTIONS.CREATE);
  assert(!fs.existsSync(path.join(root, '.cursor/rules/test.mdc')));
}

async function testRecommendMode() {
  const mode = LinkModeResolver.recommendMode();
  // macOS/Linux 推荐 auto
  assert.ok(mode === LINK_MODES.AUTO || mode === LINK_MODES.COPY);
}

async function main() {
  await testCopyModeCreatesFile();
  await testCopyModeUpdatesExistingFile();
  await testSymlinkModeSingleFileFailsWithoutSource();
  await testAutoModeFallsBackToCopy();
  await testCopyWritesContentCorrectly();
  await testNestedDirectoryCreatedAutomatically();
  await testDryRunDoesNotWrite();
  await testRecommendMode();
  console.log('link-mode-resolver tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
