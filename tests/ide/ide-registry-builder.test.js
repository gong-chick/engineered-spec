const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { IdeRegistryBuilder } = require('../../src/ide/registry/ide-registry-builder');
const { PROFILES } = require('../../src/ide/ide-types');

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ai-spec-test-registry-'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function testBuildGeneratesCorrectSchema() {
  const root = createTempDir();

  // 写入 project.json（React 项目）
  writeJson(path.join(root, '.ai-spec/project.json'), {
    schemaVersion: '1.0.0',
    projectId: 'test-project',
    manifest: { slug: 'frontend-react-vite-standard', version: '1.0.0' },
    language: ['TypeScript', 'JavaScript'],
  });

  // 写入 lock 文件
  writeJson(path.join(root, '.ai-spec/ai-spec.lock.json'), {
    schemaVersion: '1.0.0',
    manifest: { slug: 'frontend-react-vite-standard', version: '1.0.0' },
  });

  // 写入 registry index
  writeJson(path.join(root, '.agents/registry.index.json'), {
    assets: { rules: [], skills: [], agentProfiles: [] },
  });

  const builder = new IdeRegistryBuilder();
  const { registry, warnings } = builder.build(root, { profile: PROFILES.REACT });

  assert.strictEqual(registry.schemaVersion, '1.0.0');
  assert.strictEqual(registry.generatedBy, 'ai-spec-auto');
  assert(registry.updatedAt);
  assert.strictEqual(registry.project.profile, PROFILES.REACT);
  assert.strictEqual(registry.project.framework, 'React');
  assert(registry.project.language.includes('TypeScript'));
  assert.strictEqual(registry.indexes.assetRegistry, '.agents/registry.index.json');
  assert.strictEqual(registry.indexes.contextIndex, '.ai-spec/context-index.json');
  assert.strictEqual(registry.privacy.sourceCodeIncluded, false);
  assert.strictEqual(registry.privacy.absolutePathIncluded, false);
  assert.strictEqual(warnings.length, 0);
}

async function testBuildDetectsProfileFromManifest() {
  const root = createTempDir();

  writeJson(path.join(root, '.ai-spec/project.json'), {
    schemaVersion: '1.0.0',
    projectId: 'vue-test',
    manifest: { slug: 'frontend-vue-vite-standard', version: '1.0.0' },
  });

  writeJson(path.join(root, '.ai-spec/ai-spec.lock.json'), {});
  writeJson(path.join(root, '.agents/registry.index.json'), {});

  const builder = new IdeRegistryBuilder();
  const { registry } = builder.build(root);

  // 自动检测为 Vue profile
  assert.strictEqual(registry.project.profile, PROFILES.VUE);
  assert.strictEqual(registry.project.framework, 'Vue');
}

async function testBuildDetectsReactFromManifest() {
  const root = createTempDir();

  writeJson(path.join(root, '.ai-spec/project.json'), {
    schemaVersion: '1.0.0',
    projectId: 'react-test',
    manifest: { slug: 'frontend-react-nextjs-standard', version: '1.0.0' },
  });

  writeJson(path.join(root, '.ai-spec/ai-spec.lock.json'), {});
  writeJson(path.join(root, '.agents/registry.index.json'), {});

  const builder = new IdeRegistryBuilder();
  const { registry } = builder.build(root);

  assert.strictEqual(registry.project.profile, PROFILES.REACT);
  assert.strictEqual(registry.project.framework, 'React');
}

async function testBuildVuePriorityAssets() {
  const root = createTempDir();

  writeJson(path.join(root, '.ai-spec/project.json'), {
    schemaVersion: '1.0.0',
    projectId: 'vue-test',
    manifest: { slug: 'frontend-vue-vite-standard', version: '1.0.0' },
  });

  writeJson(path.join(root, '.ai-spec/ai-spec.lock.json'), {});
  writeJson(path.join(root, '.agents/registry.index.json'), {});

  const builder = new IdeRegistryBuilder();
  const { registry } = builder.build(root, { profile: PROFILES.VUE });

  assert(registry.priorityAssets.rules.includes('frontend-vue-rule'));
  assert(registry.priorityAssets.skills.includes('vue-component-implementer'));
}

async function testBuildReactPriorityAssets() {
  const root = createTempDir();

  writeJson(path.join(root, '.ai-spec/project.json'), {
    schemaVersion: '1.0.0',
    projectId: 'react-test',
    manifest: { slug: 'frontend-react-vite-standard', version: '1.0.0' },
  });

  writeJson(path.join(root, '.ai-spec/ai-spec.lock.json'), {});
  writeJson(path.join(root, '.agents/registry.index.json'), {});

  const builder = new IdeRegistryBuilder();
  const { registry } = builder.build(root, { profile: PROFILES.REACT });

  assert(registry.priorityAssets.rules.includes('frontend-react-rule'));
  assert(registry.priorityAssets.skills.includes('component-refactor'));
}

async function testBuildExplicitProfileWins() {
  const root = createTempDir();

  // project.json 是 react，但显式指定 vue
  writeJson(path.join(root, '.ai-spec/project.json'), {
    schemaVersion: '1.0.0',
    projectId: 'test',
    manifest: { slug: 'frontend-react-vite-standard', version: '1.0.0' },
  });

  writeJson(path.join(root, '.ai-spec/ai-spec.lock.json'), {});
  writeJson(path.join(root, '.agents/registry.index.json'), {});

  const builder = new IdeRegistryBuilder();
  const { registry } = builder.build(root, { profile: PROFILES.VUE });

  // 显式指定覆盖自动检测
  assert.strictEqual(registry.project.profile, PROFILES.VUE);
}

async function testWriteRegistryFile() {
  const root = createTempDir();

  writeJson(path.join(root, '.ai-spec/project.json'), {
    schemaVersion: '1.0.0',
    projectId: 'test',
    manifest: { slug: 'frontend-react-vite-standard', version: '1.0.0' },
  });

  writeJson(path.join(root, '.ai-spec/ai-spec.lock.json'), {});
  writeJson(path.join(root, '.agents/registry.index.json'), {});

  const builder = new IdeRegistryBuilder();
  const result = builder.write(root, { profile: PROFILES.REACT });

  assert.strictEqual(result.path, '.agents/registry/ide-registry.json');
  assert.strictEqual(result.action, 'create');
  assert(fs.existsSync(path.join(root, '.agents/registry/ide-registry.json')));

  const written = JSON.parse(fs.readFileSync(path.join(root, '.agents/registry/ide-registry.json'), 'utf8'));
  assert.strictEqual(written.schemaVersion, '1.0.0');
  assert.strictEqual(written.project.profile, 'react');
}

async function testWriteIntegrationConfig() {
  const root = createTempDir();

  writeJson(path.join(root, '.ai-spec/project.json'), {
    schemaVersion: '1.0.0',
    projectId: 'test',
    manifest: { slug: 'frontend-react-vite-standard', version: '1.0.0' },
  });

  const builder = new IdeRegistryBuilder();
  const result = builder.writeIntegrationConfig(root, {
    profile: PROFILES.REACT,
    ide: ['cursor', 'claude'],
    linkMode: 'copy',
  });

  assert.strictEqual(result.path, '.ai-spec/ide-integration.json');
  assert.strictEqual(result.action, 'create');
  assert(fs.existsSync(path.join(root, '.ai-spec/ide-integration.json')));

  const written = JSON.parse(fs.readFileSync(path.join(root, '.ai-spec/ide-integration.json'), 'utf8'));
  assert.strictEqual(written.ide.cursor.enabled, true);
  assert.strictEqual(written.ide.claude.enabled, true);
  assert.strictEqual(written.linkMode, 'copy');
  assert(written.lastSyncAt);
}

async function testDryRunDoesNotWrite() {
  const root = createTempDir();

  writeJson(path.join(root, '.ai-spec/project.json'), {
    schemaVersion: '1.0.0',
    projectId: 'test',
    manifest: { slug: 'frontend-react-vite-standard', version: '1.0.0' },
  });

  writeJson(path.join(root, '.ai-spec/ai-spec.lock.json'), {});
  writeJson(path.join(root, '.agents/registry.index.json'), {});

  const builder = new IdeRegistryBuilder();
  const result = builder.write(root, { profile: PROFILES.REACT, dryRun: true });

  assert.strictEqual(result.action, 'create');
  assert(!fs.existsSync(path.join(root, '.agents/registry/ide-registry.json')));
}

async function testMissingProjectConfigWarns() {
  const root = createTempDir();
  const builder = new IdeRegistryBuilder();
  const { warnings } = builder.build(root);

  assert(warnings.length > 0);
  assert(warnings.some((warning) => warning.includes('project.json')));
}

async function main() {
  await testBuildGeneratesCorrectSchema();
  await testBuildDetectsProfileFromManifest();
  await testBuildDetectsReactFromManifest();
  await testBuildVuePriorityAssets();
  await testBuildReactPriorityAssets();
  await testBuildExplicitProfileWins();
  await testWriteRegistryFile();
  await testWriteIntegrationConfig();
  await testDryRunDoesNotWrite();
  await testMissingProjectConfigWarns();
  console.log('ide-registry-builder tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
