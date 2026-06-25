const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.join(__dirname, '..', '..');
const { ConfigLoader } = require('../../src/config/config-loader');
const { TechScannerEngine } = require('../../src/scanner/engine');
const { DetectorRegistry } = require('../../src/scanner/detectors/detector-registry');
const { NextJsDetector } = require('../../src/scanner/detectors/nextjs-detector');
const { ReactViteDetector } = require('../../src/scanner/detectors/react-vite-detector');
const { VueViteDetector } = require('../../src/scanner/detectors/vue-vite-detector');
const { SpringBootDetector } = require('../../src/scanner/detectors/springboot-detector');

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

function createPackageProject(prefix, pkg, extraFiles = {}) {
  const root = createWorkspace(prefix);
  writeJson(path.join(root, 'package.json'), pkg);
  for (const [relativePath, content] of Object.entries(extraFiles)) {
    writeText(path.join(root, relativePath), content);
  }
  return root;
}

function assertPrimary(result, expected) {
  assert.strictEqual(result.packages.length, 1);
  const pkg = result.packages[0];
  assert(pkg.primary, '应保留 primary 检测结果');
  assert.strictEqual(pkg.primary.framework, expected.framework);
  assert.strictEqual(pkg.primary.manifestSlug, expected.manifestSlug);
  assert.strictEqual(pkg.recommendedManifest, expected.manifestSlug);
  assert(pkg.confidence >= expected.minConfidence);
  assert(Array.isArray(pkg.tags));
  assert(pkg.tags.includes(expected.tag));
  assert(Array.isArray(pkg.reasons));
  assert(pkg.reasons.length > 0);
  assert(Array.isArray(pkg.candidates), '应保留 candidates');
}

async function testNextJsDetection() {
  const root = createPackageProject('ai-spec-nextjs-', {
    scripts: { dev: 'next dev' },
    dependencies: {
      next: '16.2.4',
      react: '19.2.4',
      'react-dom': '19.2.4',
    },
    devDependencies: {
      typescript: '^5.0.0',
    },
  }, {
    'src/app/layout.tsx': 'export default function Layout({ children }) { return children; }\n',
  });

  const result = await new TechScannerEngine().scan(root);
  assertPrimary(result, {
    framework: 'nextjs',
    manifestSlug: 'frontend-nextjs-standard',
    minConfidence: 80,
    tag: 'nextjs',
  });
}

async function testReactViteDetection() {
  const root = createPackageProject('ai-spec-react-vite-', {
    scripts: { dev: 'vite' },
    dependencies: {
      react: '^18.2.0',
      'react-dom': '^18.2.0',
    },
    devDependencies: {
      vite: '^5.0.0',
      '@vitejs/plugin-react': '^4.0.0',
      typescript: '^5.0.0',
    },
  }, {
    'src/main.tsx': 'import React from "react";\n',
    'vite.config.ts': 'import react from "@vitejs/plugin-react";\n',
  });

  const result = await new TechScannerEngine().scan(root);
  assertPrimary(result, {
    framework: 'react-vite',
    manifestSlug: 'frontend-react-vite-standard',
    minConfidence: 80,
    tag: 'react',
  });
}

async function testReactWebpackDetection() {
  const root = createPackageProject('ai-spec-react-webpack-', {
    scripts: {
      start: 'node scripts/start.js',
      build: 'node scripts/build.js',
    },
    dependencies: {
      react: '^18.3.1',
      'react-dom': '^18.3.1',
    },
    devDependencies: {
      webpack: '^5.64.4',
      'webpack-dev-server': '^4.6.0',
      'babel-preset-react-app': '^10.0.0',
      typescript: '^4.3.3',
    },
  }, {
    'config/webpack.config.js': 'module.exports = {};\n',
    'src/index.tsx': 'import React from "react";\n',
    'src/App.tsx': 'export default function App() { return null; }\n',
  });

  const result = await new TechScannerEngine().scan(root);
  assertPrimary(result, {
    framework: 'react-webpack',
    manifestSlug: 'frontend-react-standard',
    minConfidence: 80,
    tag: 'react',
  });
}

async function testVueViteDetection() {
  const root = createPackageProject('ai-spec-vue-vite-', {
    scripts: { dev: 'vite' },
    dependencies: {
      vue: '^3.4.0',
    },
    devDependencies: {
      vite: '^5.0.0',
      '@vitejs/plugin-vue': '^5.0.0',
      typescript: '^5.0.0',
    },
  }, {
    'src/main.ts': 'import { createApp } from "vue";\n',
    'vite.config.ts': 'import vue from "@vitejs/plugin-vue";\n',
  });

  const result = await new TechScannerEngine().scan(root);
  assertPrimary(result, {
    framework: 'vue-vite',
    manifestSlug: 'frontend-vue-vite-standard',
    minConfidence: 80,
    tag: 'vue',
  });
}

async function testSpringBootDetection() {
  const root = createWorkspace('ai-spec-springboot-');
  writeText(path.join(root, 'pom.xml'), `
<project>
  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.2.0</version>
  </parent>
  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
  </dependencies>
</project>
`);
  writeText(path.join(root, 'src/main/java/com/example/Application.java'), 'package com.example;\n');

  const result = await new TechScannerEngine().scan(root);
  assertPrimary(result, {
    framework: 'spring-boot',
    manifestSlug: 'backend-java-springboot-standard',
    minConfidence: 80,
    tag: 'spring-boot',
  });
}

async function testDetectorRegistryKeepsCandidates() {
  const facts = {
    packageId: 'pkg_demo',
    relativePath: '.',
    rootDir: '/tmp/demo',
    manifestFiles: ['package.json'],
    dependencies: {
      next: { version: '16.0.0', source: 'local' },
      react: { version: '19.0.0', source: 'local' },
      vite: { version: '5.0.0', source: 'local' },
    },
    devDependencies: {},
    scripts: { dev: 'next dev' },
    keyPaths: ['src/app/layout.tsx', 'vite.config.ts'],
  };
  const registry = new DetectorRegistry([
    new ReactViteDetector(),
    new NextJsDetector(),
  ]);

  const detection = registry.detect(facts);
  assert(detection.primary, '应返回 primary');
  assert.strictEqual(detection.primary.framework, 'nextjs');
  assert(detection.candidates.length >= 2, '应保留所有候选结果');
  assert(detection.candidates.some((item) => item.framework === 'react-vite'));
}

async function testWorkspaceTopologyShapeIsStable() {
  const root = createPackageProject('ai-spec-topology-', {
    name: 'topology-demo',
    packageManager: 'pnpm@10.0.0',
    dependencies: { next: '^16.0.0', react: '^19.0.0' },
  }, {
    'src/app/layout.tsx': 'export default function Layout({ children }) { return children; }\n',
  });
  const result = await new TechScannerEngine().scan(root);
  assert.deepStrictEqual(Object.keys(result).sort(), ['packages', 'workspace']);
  assert.strictEqual(result.workspace.rootDir, root);
  assert.strictEqual(result.workspace.type, 'single-project');
  assert.strictEqual(result.workspace.packageManager, 'pnpm');
  assert(result.workspace.rootDependencies.next);
  assert.deepStrictEqual(Object.keys(result.packages[0]).sort(), [
    'buildTool',
    'candidates',
    'componentLibraries',
    'confidence',
    'language',
    'name',
    'packageId',
    'packageManager',
    'path',
    'primary',
    'reasons',
    'recommendedManifest',
    'tags',
    'testTools',
  ]);
}

async function testPnpmWorkspaceDetection() {
  const root = createWorkspace('ai-spec-pnpm-workspace-');
  writeJson(path.join(root, 'package.json'), {
    name: 'workspace-root',
    packageManager: 'pnpm@10.0.0',
    dependencies: { react: '^19.0.0' },
  });
  writeText(path.join(root, 'pnpm-workspace.yaml'), 'packages:\n  - "apps/*"\n');
  writeJson(path.join(root, 'apps/web/package.json'), {
    name: '@demo/web',
    dependencies: { next: '^16.0.0' },
  });
  writeText(path.join(root, 'apps/web/src/app/layout.tsx'), 'export default function Layout() {}\n');

  const result = await new TechScannerEngine().scan(root);
  assert.strictEqual(result.workspace.type, 'pnpm-workspace');
  assert.strictEqual(result.workspace.packageManager, 'pnpm');
  assert.strictEqual(result.packages.length, 1);
  assert.strictEqual(result.packages[0].name, '@demo/web');
  assert.strictEqual(result.packages[0].path, 'apps/web');
  assert.strictEqual(result.packages[0].primary.framework, 'nextjs');
}

async function testPackageJsonWorkspaceDetection() {
  const root = createWorkspace('ai-spec-package-workspace-');
  writeJson(path.join(root, 'package.json'), {
    name: 'workspace-root',
    workspaces: ['packages/*'],
    dependencies: { vite: '^5.0.0' },
  });
  writeJson(path.join(root, 'packages/app/package.json'), {
    name: '@demo/app',
    dependencies: { vue: '^3.4.0' },
  });
  writeText(path.join(root, 'packages/app/src/main.ts'), 'import { createApp } from "vue";\n');

  const result = await new TechScannerEngine().scan(root);
  assert.strictEqual(result.workspace.type, 'package-json-workspace');
  assert.strictEqual(result.packages.length, 1);
  assert.strictEqual(result.packages[0].primary.framework, 'vue-vite');
}

async function testMavenMultiModuleDetection() {
  const root = createWorkspace('ai-spec-maven-multi-');
  writeText(path.join(root, 'pom.xml'), `
<project>
  <packaging>pom</packaging>
  <modules>
    <module>service-a</module>
  </modules>
</project>
`);
  writeText(path.join(root, 'service-a/pom.xml'), `
<project>
  <dependencies>
    <dependency>
      <groupId>org.springframework</groupId>
      <artifactId>spring-webmvc</artifactId>
    </dependency>
  </dependencies>
</project>
`);

  const result = await new TechScannerEngine().scan(root);
  assert.strictEqual(result.workspace.type, 'maven-multi-module');
  assert.strictEqual(result.packages.length, 1);
  assert.strictEqual(result.packages[0].path, 'service-a');
  assert.strictEqual(result.packages[0].primary.framework, 'spring-mvc');
}

async function testGradleMultiModuleDetection() {
  const root = createWorkspace('ai-spec-gradle-multi-');
  writeText(path.join(root, 'settings.gradle'), "include 'api'\n");
  writeText(path.join(root, 'api/build.gradle'), `
plugins {
  id 'org.springframework.boot' version '3.2.0'
}
dependencies {
  implementation 'org.springframework.cloud:spring-cloud-starter-gateway'
}
`);

  const result = await new TechScannerEngine().scan(root);
  assert.strictEqual(result.workspace.type, 'gradle-multi-module');
  assert.strictEqual(result.packages.length, 1);
  assert.strictEqual(result.packages[0].primary.framework, 'spring-cloud');
}

async function testFastApiDetection() {
  const root = createWorkspace('ai-spec-fastapi-');
  writeText(path.join(root, 'requirements.txt'), 'fastapi==0.110.0\nuvicorn==0.27.0\n');
  writeText(path.join(root, 'pyproject.toml'), '[project]\nname = "api"\n');

  const result = await new TechScannerEngine().scan(root);
  assert.strictEqual(result.packages[0].primary.framework, 'fastapi');
  assert.strictEqual(result.packages[0].recommendedManifest, 'backend-python-fastapi-standard');
}

async function testFallbackMultiProjectWorkspaceAndNestDetection() {
  const root = createWorkspace('ai-spec-fallback-fullstack-');
  writeJson(path.join(root, 'front/package.json'), {
    name: 'front',
    dependencies: {
      react: '^18.3.1',
      'react-dom': '^18.3.1',
    },
    devDependencies: {
      vite: '^5.0.0',
      '@vitejs/plugin-react': '^4.0.0',
    },
  });
  writeText(path.join(root, 'front/vite.config.ts'), 'export default {};\n');
  writeText(path.join(root, 'front/src/main.tsx'), 'import React from "react";\n');
  writeJson(path.join(root, 'serve/package.json'), {
    name: 'serve',
    scripts: { start: 'nest start' },
    dependencies: {
      '@nestjs/common': '^10.0.0',
      '@nestjs/core': '^10.0.0',
      '@nestjs/platform-express': '^10.0.0',
    },
    devDependencies: {
      '@nestjs/cli': '^10.0.0',
      typescript: '^5.0.0',
    },
  });
  writeText(path.join(root, 'serve/nest-cli.json'), '{}\n');
  writeText(path.join(root, 'serve/src/main.ts'), 'async function bootstrap() {}\n');
  writeText(path.join(root, 'serve/src/app.module.ts'), 'export class AppModule {}\n');

  const result = await new TechScannerEngine().scan(root);
  assert.strictEqual(result.workspace.type, 'multi-project-workspace');
  assert.strictEqual(result.packages.length, 2);
  const serve = result.packages.find((pkg) => pkg.path === 'serve');
  assert(serve.primary, '应识别 NestJS 后端');
  assert.strictEqual(serve.primary.framework, 'nestjs');
  assert.strictEqual(serve.recommendedManifest, 'backend-node-nestjs-standard');
}

async function testGoDetection() {
  const root = createWorkspace('ai-spec-go-');
  writeText(path.join(root, 'go.mod'), 'module example.com/demo\n\ngo 1.22\nrequire github.com/gin-gonic/gin v1.10.0\n');
  writeText(path.join(root, 'main.go'), 'package main\n');

  const result = await new TechScannerEngine().scan(root);
  assert.strictEqual(result.packages[0].primary.framework, 'go');
  assert.strictEqual(result.packages[0].recommendedManifest, 'backend-go-standard');
}

async function testCliScanJsonOutputShape() {
  const root = createPackageProject('ai-spec-cli-json-', {
    name: 'json-demo',
    dependencies: { vue: '^3.4.0' },
    devDependencies: { vite: '^5.0.0' },
  }, {
    'src/main.ts': 'import { createApp } from "vue";\n',
  });

  const result = spawnSync('node', ['./bin/cli.js', 'scan', root, '--json'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      AI_SPEC_SKIP_LAUNCHER_SYNC: '1',
    },
  });

  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.deepStrictEqual(Object.keys(payload).sort(), ['packages', 'workspace']);
  assert.strictEqual(payload.packages[0].name, 'json-demo');
  assert.strictEqual(payload.packages[0].primary.framework, 'vue-vite');
}

async function testScanIsReadOnly() {
  const root = createPackageProject('ai-spec-readonly-', {
    dependencies: { vue: '^3.4.0' },
    devDependencies: { vite: '^5.0.0' },
  });
  const originalWriteFile = fs.writeFile;
  const originalWriteFileSync = fs.writeFileSync;
  const originalMkdir = fs.mkdir;
  const originalMkdirSync = fs.mkdirSync;
  const writes = [];

  fs.writeFile = function (...args) {
    writes.push(['writeFile', args[0]]);
    return originalWriteFile.apply(this, args);
  };
  fs.writeFileSync = function (...args) {
    writes.push(['writeFileSync', args[0]]);
    return originalWriteFileSync.apply(this, args);
  };
  fs.mkdir = function (...args) {
    writes.push(['mkdir', args[0]]);
    return originalMkdir.apply(this, args);
  };
  fs.mkdirSync = function (...args) {
    writes.push(['mkdirSync', args[0]]);
    return originalMkdirSync.apply(this, args);
  };

  try {
    await new TechScannerEngine().scan(root);
  } finally {
    fs.writeFile = originalWriteFile;
    fs.writeFileSync = originalWriteFileSync;
    fs.mkdir = originalMkdir;
    fs.mkdirSync = originalMkdirSync;
  }

  assert.deepStrictEqual(writes, []);
}

async function testCliOptionsOverridePolicy() {
  const root = createWorkspace('ai-spec-config-');
  writeJson(path.join(root, '.ai-spec/policy.json'), {
    execution: {
      executor: 'cursor',
    },
    privacyPolicy: {
      uploadSourceCode: true,
    },
  });

  const loader = new ConfigLoader();
  const config = await loader.load({
    rootDir: root,
    cliOptions: {
      execution: {
        executor: 'codex',
      },
    },
  });

  assert.strictEqual(config.execution.executor, 'codex');
  assert.strictEqual(config.privacyPolicy.uploadSourceCode, false);
}

async function testCliScanCommandUsesChineseOutput() {
  const root = createPackageProject('ai-spec-cli-scan-', {
    dependencies: { next: '^16.0.0', react: '^19.0.0', 'react-dom': '^19.0.0' },
  }, {
    'src/app/page.tsx': 'export default function Page() { return null; }\n',
  });

  const result = spawnSync('node', ['./bin/cli.js', 'scan', root, '--explain'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      AI_SPEC_SKIP_LAUNCHER_SYNC: '1',
    },
  });

  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  assert(result.stdout.includes('扫描完成'), result.stdout);
  assert(result.stdout.includes('推荐 Manifest'), result.stdout);
  assert(result.stdout.includes('识别原因'), result.stdout);
}

async function main() {
  await testNextJsDetection();
  await testReactViteDetection();
  await testReactWebpackDetection();
  await testVueViteDetection();
  await testSpringBootDetection();
  await testDetectorRegistryKeepsCandidates();
  await testWorkspaceTopologyShapeIsStable();
  await testPnpmWorkspaceDetection();
  await testPackageJsonWorkspaceDetection();
  await testMavenMultiModuleDetection();
  await testGradleMultiModuleDetection();
  await testFastApiDetection();
  await testFallbackMultiProjectWorkspaceAndNestDetection();
  await testGoDetection();
  await testCliScanJsonOutputShape();
  await testScanIsReadOnly();
  await testCliOptionsOverridePolicy();
  await testCliScanCommandUsesChineseOutput();
  console.log('tech-scanner tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
