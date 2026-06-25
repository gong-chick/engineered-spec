const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { TechScannerEngine } = require('../../src/scanner/engine');
const { CursorAdapter } = require('../../src/ide/adapters/cursor-adapter');
const { ClaudeAdapter } = require('../../src/ide/adapters/claude-adapter');
const { validateAdapterConsistency } = require('../../src/ide/adapters/adapter-protocol');

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

// ============================================================
// 测试项目模板
// ============================================================

const PROJECT_TEMPLATES = {
  react: {
    name: 'react-vite-app',
    pkg: {
      name: 'react-vite-app',
      version: '1.0.0',
      dependencies: {
        react: '^18.2.0',
        'react-dom': '^18.2.0',
      },
      devDependencies: {
        vite: '^5.0.0',
        '@vitejs/plugin-react': '^4.0.0',
        vitest: '^1.0.0',
      },
    },
    extraFiles: {
      'vite.config.ts': 'export default { plugins: [] }',
      'src/main.tsx': 'import React from "react"',
    },
  },
  vue: {
    name: 'vue-vite-app',
    pkg: {
      name: 'vue-vite-app',
      version: '1.0.0',
      dependencies: {
        vue: '^3.4.0',
      },
      devDependencies: {
        vite: '^5.0.0',
        '@vitejs/plugin-vue': '^5.0.0',
        vitest: '^1.0.0',
      },
    },
    extraFiles: {
      'vite.config.ts': 'export default { plugins: [] }',
      'src/main.ts': 'import { createApp } from "vue"',
    },
  },
  nestjs: {
    name: 'nestjs-api',
    pkg: {
      name: 'nestjs-api',
      version: '1.0.0',
      dependencies: {
        '@nestjs/common': '^10.0.0',
        '@nestjs/core': '^10.0.0',
      },
      devDependencies: {
        '@nestjs/cli': '^10.0.0',
        jest: '^29.0.0',
      },
    },
    extraFiles: {
      'nest-cli.json': '{"collection": "@nestjs/schematics"}',
      'src/main.ts': 'import { NestFactory } from "@nestjs/core"',
      'src/app.module.ts': 'import { Module } from "@nestjs/common"',
    },
  },
};

function createTestProject(templateKey) {
  const template = PROJECT_TEMPLATES[templateKey];
  const root = createWorkspace(`ai-spec-p15-${templateKey}-`);
  writeJson(path.join(root, 'package.json'), template.pkg);
  for (const [relativePath, content] of Object.entries(template.extraFiles)) {
    writeText(path.join(root, relativePath), content);
  }
  return root;
}

// ============================================================
// P1.5.1 — React 项目验证
// ============================================================

async function testReactDetection() {
  const root = createTestProject('react');
  const scanner = new TechScannerEngine();
  const result = await scanner.scan(root);

  assert(result.packages.length >= 1, 'React 项目应至少检测到 1 个包');
  const pkg = result.packages[0];
  assert(pkg.primary, 'React 项目应有 primary 检测结果');
  assert.strictEqual(pkg.primary.framework, 'react-vite');
  assert(pkg.confidence >= 80, 'React 项目检测置信度应 >= 80');
  assert(pkg.tags.includes('react'), '应包含 react 标签');
}

async function testReactCursorAdapter() {
  const root = createTestProject('react');
  const adapter = new CursorAdapter();
  const input = { rootDir: root, profile: 'react' };
  const output = adapter.generateFiles(input);

  assert.strictEqual(output.adapterId, 'cursor');
  assert(output.files.length >= 6, 'React CursorAdapter 应生成至少 6 个文件');
  assert(output.files.some((f) => f.relativePath.includes('rules')));
  assert(output.files.some((f) => f.content.includes('React')));
}

async function testReactClaudeAdapter() {
  const root = createTestProject('react');
  const adapter = new ClaudeAdapter();
  const input = { rootDir: root, profile: 'react' };
  const output = adapter.generateFiles(input);

  assert.strictEqual(output.adapterId, 'claude');
  assert(output.files.length >= 10, 'React ClaudeAdapter 应生成至少 10 个文件');
  assert(output.files.some((f) => f.relativePath.includes('ai-spec-auto.md')));
  assert(output.files.some((f) => f.relativePath.includes('commands')));
  assert(output.files.some((f) => f.relativePath.includes('agents')));
}

// ============================================================
// P1.5.2 — Vue 项目验证
// ============================================================

async function testVueDetection() {
  const root = createTestProject('vue');
  const scanner = new TechScannerEngine();
  const result = await scanner.scan(root);

  assert(result.packages.length >= 1, 'Vue 项目应至少检测到 1 个包');
  const pkg = result.packages[0];
  assert(pkg.primary, 'Vue 项目应有 primary 检测结果');
  assert.strictEqual(pkg.primary.framework, 'vue-vite');
  assert(pkg.confidence >= 80, 'Vue 项目检测置信度应 >= 80');
  assert(pkg.tags.includes('vue'), '应包含 vue 标签');
}

async function testVueCursorAdapter() {
  const root = createTestProject('vue');
  const adapter = new CursorAdapter();
  const input = { rootDir: root, profile: 'vue' };
  const output = adapter.generateFiles(input);

  assert.strictEqual(output.adapterId, 'cursor');
  assert(output.files.length >= 6, 'Vue CursorAdapter 应生成至少 6 个文件');
  assert(output.files.some((f) => f.content.includes('Vue')));
}

async function testVueClaudeAdapter() {
  const root = createTestProject('vue');
  const adapter = new ClaudeAdapter();
  const input = { rootDir: root, profile: 'vue' };
  const output = adapter.generateFiles(input);

  assert.strictEqual(output.adapterId, 'claude');
  assert(output.files.length >= 10, 'Vue ClaudeAdapter 应生成至少 10 个文件');
}

// ============================================================
// P1.5.3 — NestJS 项目验证
// ============================================================

async function testNestJsDetection() {
  const root = createTestProject('nestjs');
  const scanner = new TechScannerEngine();
  const result = await scanner.scan(root);

  assert(result.packages.length >= 1, 'NestJS 项目应至少检测到 1 个包');
  const pkg = result.packages[0];
  assert(pkg.primary, 'NestJS 项目应有 primary 检测结果');
  assert.strictEqual(pkg.primary.framework, 'nestjs');
  assert(pkg.confidence >= 60, 'NestJS 项目检测置信度应 >= 60');
}

async function testNestJsCursorAdapter() {
  const root = createTestProject('nestjs');
  const adapter = new CursorAdapter();
  const input = { rootDir: root, profile: 'auto' };
  const output = adapter.generateFiles(input);

  assert.strictEqual(output.adapterId, 'cursor');
  assert(output.files.length >= 6, 'NestJS CursorAdapter 应生成至少 6 个文件');
}

async function testNestJsClaudeAdapter() {
  const root = createTestProject('nestjs');
  const adapter = new ClaudeAdapter();
  const input = { rootDir: root, profile: 'auto' };
  const output = adapter.generateFiles(input);

  assert.strictEqual(output.adapterId, 'claude');
  assert(output.files.length >= 10, 'NestJS ClaudeAdapter 应生成至少 10 个文件');
}

// ============================================================
// P1.5.4 — 跨适配器一致性与兼容矩阵
// ============================================================

async function testCrossAdapterConsistency() {
  const root = createTestProject('react');
  const cursorAdapter = new CursorAdapter();
  const claudeAdapter = new ClaudeAdapter();

  const cursorOutput = cursorAdapter.generateFiles({ rootDir: root, profile: 'react' });
  const claudeOutput = claudeAdapter.generateFiles({ rootDir: root, profile: 'react' });

  const validation = validateAdapterConsistency([cursorOutput, claudeOutput]);
  assert.strictEqual(validation.ok, true, `一致性校验应通过: ${validation.issues.join(', ')}`);
}

async function testAllProjectsAdapterConsistency() {
  for (const templateKey of ['react', 'vue', 'nestjs']) {
    const root = createTestProject(templateKey);
    const cursorAdapter = new CursorAdapter();
    const claudeAdapter = new ClaudeAdapter();

    const cursorOutput = cursorAdapter.generateFiles({ rootDir: root, profile: 'auto' });
    const claudeOutput = claudeAdapter.generateFiles({ rootDir: root, profile: 'auto' });

    const validation = validateAdapterConsistency([cursorOutput, claudeOutput]);
    assert.strictEqual(
      validation.ok,
      true,
      `${templateKey} 项目一致性校验应通过: ${validation.issues.join(', ')}`,
    );
  }
}

async function testAutoProfileDetection() {
  // 验证 profile='auto' 时各项目仍能正确生成文件
  for (const templateKey of ['react', 'vue', 'nestjs']) {
    const root = createTestProject(templateKey);
    const adapter = new CursorAdapter();
    const output = adapter.generateFiles({ rootDir: root, profile: 'auto' });

    assert(output.files.length >= 6, `${templateKey} auto-profile 应生成至少 6 个文件`);
    assert(output.generatedAt, `${templateKey} 应有 generatedAt 时间戳`);
  }
}

// ============================================================
// 兼容矩阵生成
// ============================================================

async function testCompatibilityMatrix() {
  const scanner = new TechScannerEngine();
  const matrix = [];

  for (const [templateKey, template] of Object.entries(PROJECT_TEMPLATES)) {
    const root = createTestProject(templateKey);
    const scanResult = await scanner.scan(root);
    const pkg = scanResult.packages[0];

    const cursorAdapter = new CursorAdapter();
    const claudeAdapter = new ClaudeAdapter();
    const cursorOutput = cursorAdapter.generateFiles({ rootDir: root, profile: 'auto' });
    const claudeOutput = claudeAdapter.generateFiles({ rootDir: root, profile: 'auto' });
    const consistency = validateAdapterConsistency([cursorOutput, claudeOutput]);

    matrix.push({
      projectType: templateKey,
      projectName: template.name,
      detectedFramework: pkg.primary ? pkg.primary.framework : 'unknown',
      confidence: pkg.confidence,
      cursorFiles: cursorOutput.files.length,
      claudeFiles: claudeOutput.files.length,
      consistencyOk: consistency.ok,
      cursorWarnings: cursorOutput.warnings.length,
      claudeWarnings: claudeOutput.warnings.length,
    });
  }

  // 验证所有项目类型都被正确检测和适配
  assert.strictEqual(matrix.length, 3, '应有 3 种项目类型的兼容矩阵');
  for (const entry of matrix) {
    assert(entry.detectedFramework !== 'unknown', `${entry.projectType} 应被正确检测`);
    assert(entry.cursorFiles >= 6, `${entry.projectType} Cursor 应生成 >= 6 文件`);
    assert(entry.claudeFiles >= 10, `${entry.projectType} Claude 应生成 >= 10 文件`);
    assert(entry.consistencyOk, `${entry.projectType} 跨适配器一致性应通过`);
  }
}

// ============================================================
// main
// ============================================================

async function main() {
  // P1.5.1 — React
  await testReactDetection();
  await testReactCursorAdapter();
  await testReactClaudeAdapter();

  // P1.5.2 — Vue
  await testVueDetection();
  await testVueCursorAdapter();
  await testVueClaudeAdapter();

  // P1.5.3 — NestJS
  await testNestJsDetection();
  await testNestJsCursorAdapter();
  await testNestJsClaudeAdapter();

  // P1.5.4 — 兼容矩阵
  await testCrossAdapterConsistency();
  await testAllProjectsAdapterConsistency();
  await testAutoProfileDetection();
  await testCompatibilityMatrix();

  console.log('multi-project-validation tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
