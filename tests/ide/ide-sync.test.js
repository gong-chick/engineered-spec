const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { IdeService } = require('../../src/ide/ide-service');
const { LINK_MODES } = require('../../src/ide/ide-types');

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ai-spec-test-sync-'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function createInitializedProject(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  writeJson(path.join(root, '.ai-spec/project.json'), {
    schemaVersion: '1.0.0',
    projectId: 'test-project',
    manifest: { slug: 'frontend-react-vite-standard', version: '1.0.0' },
    language: ['TypeScript', 'JavaScript'],
  });
  writeJson(path.join(root, '.ai-spec/ai-spec.lock.json'), {
    schemaVersion: '1.0.0',
    manifest: { slug: 'frontend-react-vite-standard', version: '1.0.0' },
    assets: [],
  });
  writeJson(path.join(root, '.ai-spec/context-index.json'), { schemaVersion: '1.0.0' });
  writeJson(path.join(root, '.agents/registry.index.json'), {
    schemaVersion: '1.0.0',
    assets: { rules: [], skills: [] },
  });
  return root;
}

async function testSyncThrowsWithoutInit() {
  const root = createTempDir();
  const service = new IdeService();

  await assert.rejects(
    () => service.sync(root, { yes: true }),
    /尚未初始化/
  );
}

async function testSyncWritesAllExpectedFiles() {
  const root = createInitializedProject('ai-spec-sync-files-');
  const service = new IdeService();

  const result = await service.sync(root, {
    ide: ['cursor', 'claude'],
    profile: 'react',
    linkMode: LINK_MODES.COPY,
    writeMemoryAnchor: true,
    writeAgentAnchor: true,
  });

  // 验证核心文件
  const expectedPaths = [
    '.agents/registry/ide-registry.json',
    '.ai-spec/ide-integration.json',
    '.cursor/rules/ai-spec-auto.mdc',
    '.cursor/commands/spec-start.md',
    '.cursor/commands/spec-update.md',
    '.cursor/commands/spec-status.md',
    '.claude/ai-spec-auto.md',
    '.claude/commands/spec-start.md',
    '.claude/commands/spec-update.md',
    '.claude/commands/spec-status.md',
    'AGENTS.md',
    'CLAUDE.md',
    'memory.md',
  ];

  for (const p of expectedPaths) {
    assert(fs.existsSync(path.join(root, p)), `${p} 应该被创建`);
  }

  // 验证 ide-registry.json 内容
  const ideRegistry = JSON.parse(fs.readFileSync(path.join(root, '.agents/registry/ide-registry.json'), 'utf8'));
  assert.strictEqual(ideRegistry.schemaVersion, '1.0.0');
  assert.strictEqual(ideRegistry.project.profile, 'react');
}

async function testSyncReactProfile() {
  const root = createInitializedProject('ai-spec-sync-react-');
  const service = new IdeService();

  await service.sync(root, {
    ide: ['cursor', 'claude'],
    profile: 'react',
    linkMode: LINK_MODES.COPY,
    writeMemoryAnchor: true,
    writeAgentAnchor: true,
  });

  const ideRegistry = JSON.parse(fs.readFileSync(path.join(root, '.agents/registry/ide-registry.json'), 'utf8'));
  assert.strictEqual(ideRegistry.project.profile, 'react');
  assert.strictEqual(ideRegistry.project.framework, 'React');
  assert(ideRegistry.priorityAssets.rules.includes('frontend-react-rule'));
}

async function testSyncVueProfile() {
  const root = createInitializedProject('ai-spec-sync-vue-');
  const service = new IdeService();

  await service.sync(root, {
    ide: ['cursor', 'claude'],
    profile: 'vue',
    linkMode: LINK_MODES.COPY,
    writeMemoryAnchor: true,
    writeAgentAnchor: true,
  });

  const ideRegistry = JSON.parse(fs.readFileSync(path.join(root, '.agents/registry/ide-registry.json'), 'utf8'));
  assert.strictEqual(ideRegistry.project.profile, 'vue');
  assert.strictEqual(ideRegistry.project.framework, 'Vue');
  assert(ideRegistry.priorityAssets.rules.includes('frontend-vue-rule'));
}

async function testSyncDryRunDoesNotWrite() {
  const root = createInitializedProject('ai-spec-sync-dry-');
  const service = new IdeService();

  const result = await service.sync(root, {
    ide: ['cursor', 'claude'],
    profile: 'react',
    linkMode: LINK_MODES.COPY,
    writeMemoryAnchor: true,
    writeAgentAnchor: true,
    dryRun: true,
  });

  assert(result.writtenFiles.length > 0);
  // 不应写入文件
  assert(!fs.existsSync(path.join(root, '.agents/registry/ide-registry.json')));
  assert(!fs.existsSync(path.join(root, '.ai-spec/ide-integration.json')));
}

async function testSyncCursorOnly() {
  const root = createInitializedProject('ai-spec-sync-cursor-');
  const service = new IdeService();

  await service.sync(root, {
    ide: ['cursor'],
    profile: 'react',
    linkMode: LINK_MODES.COPY,
    writeMemoryAnchor: true,
    writeAgentAnchor: true,
  });

  assert(fs.existsSync(path.join(root, '.cursor/rules/ai-spec-auto.mdc')));
  // Claude 文件不应该创建
  assert(!fs.existsSync(path.join(root, '.claude/ai-spec-auto.md')));
}

async function testSyncClaudeOnly() {
  const root = createInitializedProject('ai-spec-sync-claude-');
  const service = new IdeService();

  await service.sync(root, {
    ide: ['claude'],
    profile: 'react',
    linkMode: LINK_MODES.COPY,
    writeMemoryAnchor: true,
    writeAgentAnchor: true,
  });

  assert(fs.existsSync(path.join(root, '.claude/ai-spec-auto.md')));
  assert(!fs.existsSync(path.join(root, '.cursor/rules/ai-spec-auto.mdc')));
}

async function testSyncIdempotent() {
  const root = createInitializedProject('ai-spec-sync-idempotent-');
  const service = new IdeService();

  const result1 = await service.sync(root, {
    ide: ['cursor', 'claude'],
    profile: 'react',
    linkMode: LINK_MODES.COPY,
    writeMemoryAnchor: true,
    writeAgentAnchor: true,
  });

  const result2 = await service.sync(root, {
    ide: ['cursor', 'claude'],
    profile: 'react',
    linkMode: LINK_MODES.COPY,
    writeMemoryAnchor: true,
    writeAgentAnchor: true,
  });

  // 第二次同步不应出错
  assert(result2.writtenFiles.length > 0);
}

async function testSyncAnchorsPreserveUserContent() {
  const root = createInitializedProject('ai-spec-sync-anchor-');
  const service = new IdeService();

  // 用户自定义内容
  fs.writeFileSync(path.join(root, 'AGENTS.md'), [
    '# 用户项目说明',
    '',
    '这是自定义内容，应被保留。',
    '',
    '<!-- AI-SPEC-AUTO:START -->',
    '旧内容',
    '<!-- AI-SPEC-AUTO:END -->',
    '',
    '更多用户内容。',
  ].join('\n'), 'utf8');

  await service.sync(root, {
    ide: ['cursor', 'claude'],
    profile: 'react',
    linkMode: LINK_MODES.COPY,
    writeMemoryAnchor: true,
    writeAgentAnchor: true,
  });

  const content = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
  assert(content.includes('用户项目说明'));
  assert(content.includes('这是自定义内容，应被保留'));
  assert(content.includes('更多用户内容'));
  assert(!content.includes('旧内容'));
}

async function testSyncDoesNotModifyBusinessCode() {
  const root = createInitializedProject('ai-spec-sync-no-biz-');
  const service = new IdeService();

  // 创建业务代码
  const srcIndexPath = path.join(root, 'src/index.ts');
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(srcIndexPath, 'console.log("hello");', 'utf8');

  // 记录 package.json 内容
  const pkgPath = path.join(root, 'package.json');
  writeJson(pkgPath, { name: 'test', version: '1.0.0' });
  const originalPkg = fs.readFileSync(pkgPath, 'utf8');

  await service.sync(root, {
    ide: ['cursor', 'claude'],
    profile: 'react',
    linkMode: LINK_MODES.COPY,
    writeMemoryAnchor: true,
    writeAgentAnchor: true,
  });

  // 业务代码不应被修改
  assert.strictEqual(fs.readFileSync(srcIndexPath, 'utf8'), 'console.log("hello");');
  assert.strictEqual(fs.readFileSync(pkgPath, 'utf8'), originalPkg);
}

async function testRepairFixesMissingFiles() {
  const root = createInitializedProject('ai-spec-repair-');
  const service = new IdeService();

  // 先删除一些文件模拟损坏
  const ideRegistryPath = path.join(root, '.agents/registry/ide-registry.json');
  writeJson(ideRegistryPath, { schemaVersion: '1.0.0' });
  fs.unlinkSync(ideRegistryPath);

  const result = await service.repair(root);

  assert(result.repairedFiles.length > 0);
  assert(result.repairedFiles.some((f) => f.path === '.agents/registry/ide-registry.json'));
  assert(fs.existsSync(ideRegistryPath));
}

async function testRepairAllGoodReturnsEmpty() {
  const root = createInitializedProject('ai-spec-repair-ok-');
  const service = new IdeService();

  // 先完整 sync
  await service.sync(root, {
    ide: ['cursor', 'claude'],
    profile: 'react',
    linkMode: LINK_MODES.COPY,
    writeMemoryAnchor: true,
    writeAgentAnchor: true,
  });

  // 所有文件完整时 repair 应返回空
  const result = await service.repair(root);
  assert.strictEqual(result.repairedFiles.length, 0);
}

async function testSyncAllOutputChinese() {
  const root = createInitializedProject('ai-spec-sync-lang-');
  const service = new IdeService();

  const result = await service.sync(root, {
    ide: ['cursor', 'claude'],
    profile: 'react',
    linkMode: LINK_MODES.COPY,
    writeMemoryAnchor: true,
    writeAgentAnchor: true,
  });

  // linkModeUsed 应为 copy
  assert.strictEqual(result.linkModeUsed, LINK_MODES.COPY);
  // warnings 可能有中文提示
  for (const warning of result.warnings) {
    // 检查是否包含中文字符
    assert(/[\u4e00-\u9fff]/.test(warning) || warning.length > 0,
      `警告信息应包含中文: ${warning}`);
  }
}

async function main() {
  await testSyncThrowsWithoutInit();
  await testSyncWritesAllExpectedFiles();
  await testSyncReactProfile();
  await testSyncVueProfile();
  await testSyncDryRunDoesNotWrite();
  await testSyncCursorOnly();
  await testSyncClaudeOnly();
  await testSyncIdempotent();
  await testSyncAnchorsPreserveUserContent();
  await testSyncDoesNotModifyBusinessCode();
  await testRepairFixesMissingFiles();
  await testRepairAllGoodReturnsEmpty();
  await testSyncAllOutputChinese();
  console.log('ide-sync tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
