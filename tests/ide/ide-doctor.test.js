const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { IdeService } = require('../../src/ide/ide-service');

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ai-spec-test-doctor-'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function testDoctorEmptyProject() {
  const root = createTempDir();
  const service = new IdeService();

  const result = service.doctor(root);

  assert.strictEqual(result.ok, false);
  assert(result.missingCount > 0);
  // 至少缺少 project.json（必要文件）
  const projectItem = result.items.find((item) => item.path === '.ai-spec/project.json');
  assert(projectItem);
  assert.strictEqual(projectItem.exists, false);
  assert.strictEqual(projectItem.required, true);

  // 应该有修复建议
  assert(result.suggestions.length > 0);
  assert(result.suggestions.some((s) => s.includes('project.json')));
}

async function testDoctorAllFilesPresent() {
  const root = createTempDir();
  const service = new IdeService();

  // 创建所有必要文件
  writeJson(path.join(root, '.ai-spec/project.json'), { schemaVersion: '1.0.0', projectId: 'test' });
  writeJson(path.join(root, '.ai-spec/ai-spec.lock.json'), { schemaVersion: '1.0.0' });
  writeJson(path.join(root, '.ai-spec/context-index.json'), { schemaVersion: '1.0.0' });
  writeJson(path.join(root, '.agents/registry.index.json'), { schemaVersion: '1.0.0' });
  writeJson(path.join(root, '.agents/registry/ide-registry.json'), { schemaVersion: '1.0.0' });
  writeJson(path.join(root, '.ai-spec/ide-integration.json'), { schemaVersion: '1.0.0' });

  // 创建 Cursor 文件
  fs.mkdirSync(path.join(root, '.cursor/rules'), { recursive: true });
  fs.writeFileSync(path.join(root, '.cursor/rules/ai-spec-auto.mdc'), '# Cursor', 'utf8');

  // 创建 Claude 文件
  fs.mkdirSync(path.join(root, '.claude/commands'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude/ai-spec-auto.md'), '# Claude', 'utf8');

  const result = service.doctor(root);

  // 必要文件都存在
  assert.strictEqual(result.missingCount, 0);
  for (const item of result.items) {
    if (item.required) {
      assert.strictEqual(item.exists, true, `${item.path} 应该存在`);
    }
  }
}

async function testDoctorDetectsMissingAnchor() {
  const root = createTempDir();
  const service = new IdeService();

  // 创建必要文件
  writeJson(path.join(root, '.ai-spec/project.json'), { schemaVersion: '1.0.0', projectId: 'test' });
  writeJson(path.join(root, '.ai-spec/ai-spec.lock.json'), { schemaVersion: '1.0.0' });
  writeJson(path.join(root, '.ai-spec/context-index.json'), { schemaVersion: '1.0.0' });
  writeJson(path.join(root, '.agents/registry.index.json'), { schemaVersion: '1.0.0' });
  writeJson(path.join(root, '.agents/registry/ide-registry.json'), { schemaVersion: '1.0.0' });
  writeJson(path.join(root, '.ai-spec/ide-integration.json'), { schemaVersion: '1.0.0' });

  // 创建 AGENTS.md 但没有锚点
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Just a note\n', 'utf8');

  const result = service.doctor(root);
  assert(result.suggestions.some((s) => s.includes('AGENTS.md')));
  assert(result.suggestions.some((s) => s.includes('锚点')));
}

async function testDoctorDetectsOptionalFilesMissing() {
  const root = createTempDir();
  const service = new IdeService();

  // 只创建必要文件，不创建 Cursor/Claude 文件
  writeJson(path.join(root, '.ai-spec/project.json'), { schemaVersion: '1.0.0', projectId: 'test' });
  writeJson(path.join(root, '.ai-spec/ai-spec.lock.json'), { schemaVersion: '1.0.0' });
  writeJson(path.join(root, '.ai-spec/context-index.json'), { schemaVersion: '1.0.0' });
  writeJson(path.join(root, '.agents/registry.index.json'), { schemaVersion: '1.0.0' });
  writeJson(path.join(root, '.agents/registry/ide-registry.json'), { schemaVersion: '1.0.0' });
  writeJson(path.join(root, '.ai-spec/ide-integration.json'), { schemaVersion: '1.0.0' });

  const result = service.doctor(root);

  // 必要文件完整
  assert.strictEqual(result.missingCount, 0);

  // 可选文件缺失会有建议
  const cursorMissing = result.items.find((item) => item.path === '.cursor/rules/ai-spec-auto.mdc' && !item.exists);
  assert(cursorMissing);
}

async function testDoctorAllItemsHaveCategory() {
  const root = createTempDir();
  const service = new IdeService();

  writeJson(path.join(root, '.ai-spec/project.json'), { schemaVersion: '1.0.0', projectId: 'test' });

  const result = service.doctor(root);

  for (const item of result.items) {
    assert(typeof item.path === 'string');
    assert(typeof item.exists === 'boolean');
    assert(typeof item.category === 'string');
    assert(typeof item.required === 'boolean');
  }
}

async function main() {
  await testDoctorEmptyProject();
  await testDoctorAllFilesPresent();
  await testDoctorDetectsMissingAnchor();
  await testDoctorDetectsOptionalFilesMissing();
  await testDoctorAllItemsHaveCategory();
  console.log('ide-doctor tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
