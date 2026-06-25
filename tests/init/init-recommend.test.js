const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.join(__dirname, '..', '..');
const { InitPlanBuilder } = require('../../src/init/init-plan');

function createWorkspace(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function createNextProject(prefix) {
  const root = createWorkspace(prefix);
  writeJson(path.join(root, 'package.json'), {
    name: 'next-init-demo',
    scripts: { dev: 'next dev' },
    dependencies: {
      next: '^16.0.0',
      react: '^19.0.0',
      'react-dom': '^19.0.0',
    },
    devDependencies: {
      typescript: '^5.0.0',
    },
  });
  writeText(path.join(root, 'src/app/layout.tsx'), 'export default function Layout({ children }) { return children; }\n');
  return root;
}

function createSpecNamedNextProject(prefix) {
  const root = createNextProject(prefix);
  const packageJsonPath = path.join(root, 'package.json');
  const packageJson = readJson(packageJsonPath);
  packageJson.name = 'ai-spec-v1-1-smoke';
  writeJson(packageJsonPath, packageJson);
  return root;
}

function createCliToolProject(prefix) {
  const root = createWorkspace(prefix);
  writeJson(path.join(root, 'package.json'), {
    name: 'br-ai-spec-auto-cli',
    bin: {
      'ai-spec-auto': './bin/cli.js',
    },
    dependencies: {
      next: '^16.0.0',
      react: '^19.0.0',
      'react-dom': '^19.0.0',
    },
  });
  writeText(path.join(root, 'bin/cli.js'), '#!/usr/bin/env node\nconsole.log("cli");\n');
  return root;
}

function createUnknownProject(prefix) {
  const root = createWorkspace(prefix);
  writeJson(path.join(root, 'package.json'), {
    name: 'plain-library',
  });
  return root;
}

function createPnpmWorkspace(prefix) {
  const root = createWorkspace(prefix);
  writeJson(path.join(root, 'package.json'), {
    name: 'workspace-root',
    packageManager: 'pnpm@10.0.0',
  });
  writeText(path.join(root, 'pnpm-workspace.yaml'), 'packages:\n  - "apps/*"\n');
  writeJson(path.join(root, 'apps/web/package.json'), {
    name: '@demo/web',
    dependencies: {
      next: '^16.0.0',
      react: '^19.0.0',
      'react-dom': '^19.0.0',
    },
  });
  writeText(path.join(root, 'apps/web/src/app/layout.tsx'), 'export default function Layout({ children }) { return children; }\n');
  return root;
}

function runCli(args, options = {}) {
  return spawnSync('node', ['./bin/cli.js', ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      AI_SPEC_SKIP_LAUNCHER_SYNC: '1',
    },
    ...options,
  });
}

function assertNoInitFiles(root) {
  for (const relativePath of [
    '.ai-spec',
    '.agents/registry.index.json',
    '.codex/instructions.md',
    '.cursor/rules/ai-spec-auto.mdc',
    'CLAUDE.md',
    'memory.md',
  ]) {
    assert(!fs.existsSync(path.join(root, relativePath)), `${relativePath} 不应被写入`);
  }
}

function assertManagedPointerOnly(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  assert(content.includes('<!-- AI-SPEC-AUTO:START -->'));
  assert(content.includes('<!-- AI-SPEC-AUTO:END -->'));
  assert(content.includes('.ai-spec/project.json'));
  assert(content.includes('.ai-spec/policy.json'));
  assert(content.includes('.ai-spec/context-index.json'));
  assert(content.includes('.agents/registry.index.json'));
  assert(content.includes('ai-spec-auto scan . --explain'));
  assert(content.includes('ai-spec-auto init . --recommend --dry-run'));
  assert(!content.includes('spring-boot-starter-web'), '指针文件不应包含资产或源码正文');
}

function createFakeScanResult(primary) {
  return {
    workspace: {
      rootDir: '/tmp/fake',
      type: 'single-project',
    },
    packages: [
      {
        packageId: 'root',
        name: 'fake-app',
        path: '.',
        primary,
        candidates: primary ? [primary] : [],
        tags: primary?.tags || [],
        confidence: primary?.confidence || 0,
        reasons: primary?.reasons || [],
      },
    ],
  };
}

async function testDryRunDoesNotWriteFilesAndPrintsPlan() {
  const root = createNextProject('ai-spec-init-dry-run-');
  const result = runCli(['init', root, '--recommend', '--dry-run']);

  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  assert(result.stdout.includes('InitPlan'), result.stdout);
  assert(result.stdout.includes('将要写入的文件'), result.stdout);
  assert(result.stdout.includes('frontend-react-nextjs-standard'), result.stdout);
  assert(result.stdout.includes('推荐原因'), result.stdout);
  assertNoInitFiles(root);
}

async function testCliToolProjectDoesNotAutoRecommendNextManifest() {
  const root = createCliToolProject('ai-spec-init-cli-tool-');
  const result = runCli(['init', root, '--recommend', '--dry-run', '--json']);

  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  const pkg = payload.packages[0];
  assert.strictEqual(pkg.projectKind, 'cli-tool');
  assert.strictEqual(pkg.recommendedManifest, null);
  assert(pkg.warnings.some((warning) => warning.includes('cli-tool')));
  assertNoInitFiles(root);
}

async function testCliToolDryRunExplainsNoRecommendation() {
  const root = createCliToolProject('ai-spec-init-cli-tool-output-');
  const result = runCli(['init', root, '--recommend', '--dry-run']);

  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  assert(result.stdout.includes('项目类型：cli-tool'), result.stdout);
  assert(result.stdout.includes('未自动推荐 Manifest'), result.stdout);
  assert(result.stdout.includes('当前项目被识别为 cli-tool'), result.stdout);
  assert(result.stdout.includes('dry-run 不会写入文件'), result.stdout);
  assertNoInitFiles(root);
}

async function testSpecNamedApplicationKeepsApplicationKind() {
  const root = createSpecNamedNextProject('ai-spec-init-spec-named-app-');
  const result = runCli(['init', root, '--recommend', '--dry-run', '--json']);

  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  const pkg = payload.packages[0];
  assert.strictEqual(pkg.projectKind, 'application');
  assert.strictEqual(pkg.recommendedManifest.slug, 'frontend-react-nextjs-standard');
  assert(!pkg.warnings.some((warning) => warning.includes('cli-tool')));
  assertNoInitFiles(root);
}

async function testUnknownProjectDoesNotRecommendManifest() {
  const root = createUnknownProject('ai-spec-init-unknown-');
  const result = runCli(['init', root, '--recommend', '--dry-run', '--json']);

  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.strictEqual(payload.packages[0].projectKind, 'unknown');
  assert.strictEqual(payload.packages[0].recommendedManifest, null);
  assert(payload.packages[0].warnings.some((warning) => warning.includes('未识别到明确技术栈')));
  assertNoInitFiles(root);
}

async function testConfidenceGateRules() {
  const builder = new InitPlanBuilder();
  const low = builder.build(createFakeScanResult({
    detector: 'FakeDetector',
    framework: 'react-vite',
    language: ['JavaScript'],
    buildTool: 'Vite',
    confidence: 55,
    tags: ['frontend', 'react', 'vite'],
    reasons: ['低置信度测试'],
    manifestSlug: 'frontend-react-vite-standard',
  }));
  assert.strictEqual(low.packages[0].recommendedManifest, null);

  const medium = builder.build(createFakeScanResult({
    detector: 'FakeDetector',
    framework: 'spring-boot',
    language: ['Java'],
    buildTool: 'Maven',
    confidence: 70,
    tags: ['backend', 'java', 'spring-boot'],
    reasons: ['中置信度测试'],
    manifestSlug: 'backend-java-springboot-standard',
  }));
  assert.strictEqual(medium.packages[0].recommendedManifest.slug, 'backend-java-springboot-standard');
  assert.strictEqual(medium.packages[0].recommendedManifest.requiresConfirmation, true);

  const high = builder.build(createFakeScanResult({
    detector: 'FakeDetector',
    framework: 'spring-boot',
    language: ['Java'],
    buildTool: 'Maven',
    confidence: 85,
    tags: ['backend', 'java', 'spring-boot'],
    reasons: ['高置信度测试'],
    manifestSlug: 'backend-java-springboot-standard',
  }));
  assert.strictEqual(high.packages[0].recommendedManifest.slug, 'backend-java-springboot-standard');
  assert.strictEqual(high.packages[0].recommendedManifest.requiresConfirmation, false);
}

async function testDryRunJsonOutputsInitPlan() {
  const root = createNextProject('ai-spec-init-dry-run-json-');
  const result = runCli(['init', root, '--recommend', '--dry-run', '--json']);

  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert(payload.workspace);
  assert(Array.isArray(payload.packages));
  assert(Array.isArray(payload.filesToWrite));
  assert.strictEqual(payload.packages[0].recommendedManifest.slug, 'frontend-react-nextjs-standard');
  assert.strictEqual(payload.requiresConfirmation, true);
  assertNoInitFiles(root);
}

async function testRecommendYesWithNullManifestDoesNotWriteWrongManifest() {
  const root = createCliToolProject('ai-spec-init-no-manifest-');
  const result = runCli(['init', root, '--recommend', '--yes']);

  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  const project = readJson(path.join(root, '.ai-spec/project.json'));
  const lock = readJson(path.join(root, '.ai-spec/ai-spec.lock.json'));
  const registry = readJson(path.join(root, '.agents/registry.index.json'));
  assert.strictEqual(project.manifest, null);
  assert.strictEqual(lock.manifest, null);
  assert.strictEqual(registry.manifest, null);
  assert(!JSON.stringify(project).includes('frontend-react-nextjs-standard'));
  assert(!JSON.stringify(lock).includes('frontend-react-nextjs-standard'));
  assert(!JSON.stringify(registry).includes('frontend-react-nextjs-standard'));
}

async function testExplicitManifestCanWriteSpecifiedManifest() {
  const root = createCliToolProject('ai-spec-init-explicit-manifest-');
  const result = runCli(['init', root, '--manifest', 'backend-java-springboot-standard', '--yes']);

  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  const project = readJson(path.join(root, '.ai-spec/project.json'));
  assert.strictEqual(project.manifest.slug, 'backend-java-springboot-standard');
  assert(project.warnings.some((warning) => warning.includes('手动指定')));
}

async function testRecommendYesWritesCoreFiles() {
  const root = createNextProject('ai-spec-init-yes-');
  const result = runCli(['init', root, '--recommend', '--yes']);

  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  assert(result.stdout.includes('初始化写入完成'), result.stdout);

  const project = readJson(path.join(root, '.ai-spec/project.json'));
  assert.strictEqual(project.schemaVersion, '1.0.0');
  assert(project.projectId);
  assert.notStrictEqual(project.projectId, 'next-init-demo');
  assert.strictEqual(project.relativePath, '.');
  assert.strictEqual(project.manifest.slug, 'frontend-react-nextjs-standard');
  assert.strictEqual(project.manifest.version, '1.0.0');
  assert(project.manifest.checksum);
  assert(!JSON.stringify(project).includes(root), 'project.json 不应写入绝对路径');

  const policy = readJson(path.join(root, '.ai-spec/policy.json'));
  assert.strictEqual(policy.execution.mode, 'local-assisted');
  assert.strictEqual(policy.branchPolicy.dirtyStrategy, 'block');
  assert.strictEqual(policy.privacyPolicy.uploadSourceCode, false);
  assert.strictEqual(policy.privacyPolicy.uploadRawPrompt, false);
  assert.strictEqual(policy.privacyPolicy.uploadRawResponse, false);

  const lock = readJson(path.join(root, '.ai-spec/ai-spec.lock.json'));
  assert.strictEqual(lock.schemaVersion, '1.0.0');
  assert.strictEqual(lock.projectId, project.projectId);
  assert(lock.manifest.checksum);
  assert(Array.isArray(lock.assets));
  assert(Array.isArray(lock.overlays));
  assert(Array.isArray(lock.sharedContracts));
  assert(!JSON.stringify(lock).includes(root), 'lock 文件不应写入绝对路径');

  const registry = readJson(path.join(root, '.agents/registry.index.json'));
  assert.strictEqual(registry.source, 'local-init');
  assert.strictEqual(registry.manifest.slug, 'frontend-react-nextjs-standard');
  assert(Array.isArray(registry.assets.rules));
  assert(Array.isArray(registry.assets.skills));
  assert(Array.isArray(registry.assets.agentProfiles));
  assert(!JSON.stringify(registry).includes('content'), 'registry.index.json 不应包含完整 content');
  assert(!JSON.stringify(registry).includes(root), 'registry.index.json 不应写入绝对路径');

  const contextIndex = readJson(path.join(root, '.ai-spec/context-index.json'));
  assert.strictEqual(contextIndex.contextStrategy, 'progressive');
  const stages = contextIndex.stageLoadRules.map((item) => item.stage);
  assert(stages.includes('planning'));
  assert(stages.includes('implementation'));
  assert(stages.includes('verification'));
  assert(stages.includes('diagnosing'));
  assert.strictEqual(contextIndex.levels.L3.loadByRegistry, true);

  for (const relativePath of [
    '.codex/instructions.md',
    '.cursor/rules/ai-spec-auto.mdc',
    'CLAUDE.md',
    'memory.md',
  ]) {
    assertManagedPointerOnly(path.join(root, relativePath));
  }
}

async function testRecommendYesWritesWorkspaceConfigForWorkspace() {
  const root = createPnpmWorkspace('ai-spec-init-workspace-');
  const result = runCli(['init', root, '--recommend', '--yes']);

  assert.strictEqual(result.status, 0, result.stderr || result.stdout);

  const workspace = readJson(path.join(root, '.ai-spec/workspace.json'));
  assert.strictEqual(workspace.schemaVersion, '1.0.0');
  assert.strictEqual(workspace.root, '.');
  assert.strictEqual(workspace.type, 'monorepo');
  assert.strictEqual(workspace.packages.length, 1);
  assert.strictEqual(workspace.packages[0].path, 'apps/web');
  assert.strictEqual(workspace.packages[0].manifest.slug, 'frontend-react-nextjs-standard');
  assert(!JSON.stringify(workspace).includes(root), 'workspace.json 不应写入绝对路径');
}

async function testExistingClaudeManagedBlockIsUpdatedOnly() {
  const root = createNextProject('ai-spec-init-claude-');
  writeText(path.join(root, 'CLAUDE.md'), [
    '# 用户自定义说明',
    '',
    '保留这一行。',
    '<!-- AI-SPEC-AUTO:START -->',
    '旧指针内容',
    '<!-- AI-SPEC-AUTO:END -->',
    '',
    '结尾也要保留。',
    '',
  ].join('\n'));

  const result = runCli(['init', root, '--recommend', '--yes']);
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);

  const content = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8');
  assert(content.includes('保留这一行。'));
  assert(content.includes('结尾也要保留。'));
  assert(!content.includes('旧指针内容'));
  assert(content.includes('.ai-spec/context-index.json'));
}

async function testExistingPolicyPreservesUserConfigAndForcesPrivacy() {
  const root = createNextProject('ai-spec-init-policy-');
  writeJson(path.join(root, '.ai-spec/policy.json'), {
    schemaVersion: '1.0.0',
    branchPolicy: {
      baseBranch: 'main',
      dirtyStrategy: 'warn',
    },
    privacyPolicy: {
      uploadSourceCode: true,
      uploadRawPrompt: true,
      uploadRawResponse: true,
      allowTestSummary: false,
    },
  });

  const result = runCli(['init', root, '--recommend', '--yes']);
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);

  const policy = readJson(path.join(root, '.ai-spec/policy.json'));
  assert.strictEqual(policy.branchPolicy.baseBranch, 'main');
  assert.strictEqual(policy.branchPolicy.dirtyStrategy, 'warn');
  assert.strictEqual(policy.privacyPolicy.allowTestSummary, false);
  assert.strictEqual(policy.privacyPolicy.uploadSourceCode, false);
  assert.strictEqual(policy.privacyPolicy.uploadRawPrompt, false);
  assert.strictEqual(policy.privacyPolicy.uploadRawResponse, false);
  assert.strictEqual(policy.privacyPolicy.uploadFileContent, false);
}

async function main() {
  await testDryRunDoesNotWriteFilesAndPrintsPlan();
  await testCliToolProjectDoesNotAutoRecommendNextManifest();
  await testCliToolDryRunExplainsNoRecommendation();
  await testSpecNamedApplicationKeepsApplicationKind();
  await testUnknownProjectDoesNotRecommendManifest();
  await testConfidenceGateRules();
  await testDryRunJsonOutputsInitPlan();
  await testRecommendYesWithNullManifestDoesNotWriteWrongManifest();
  await testExplicitManifestCanWriteSpecifiedManifest();
  await testRecommendYesWritesCoreFiles();
  await testRecommendYesWritesWorkspaceConfigForWorkspace();
  await testExistingClaudeManagedBlockIsUpdatedOnly();
  await testExistingPolicyPreservesUserConfigAndForcesPrivacy();
  console.log('init-recommend tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
