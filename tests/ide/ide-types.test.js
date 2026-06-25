const assert = require('assert');
const {
  IDE_SCHEMA_VERSION,
  IDE_TYPES,
  LINK_MODES,
  PROFILES,
  SYNC_ACTIONS,
  DOCTOR_CHECKLIST,
  SYNC_FILE_TEMPLATES,
  getPriorityAssets,
} = require('../../src/ide/ide-types');

async function testConstants() {
  assert.strictEqual(IDE_SCHEMA_VERSION, '1.0.0');
  assert.strictEqual(IDE_TYPES.CURSOR, 'cursor');
  assert.strictEqual(IDE_TYPES.CLAUDE, 'claude');
  assert.strictEqual(LINK_MODES.AUTO, 'auto');
  assert.strictEqual(LINK_MODES.COPY, 'copy');
  assert.strictEqual(LINK_MODES.SYMLINK, 'symlink');
  assert.strictEqual(PROFILES.AUTO, 'auto');
  assert.strictEqual(PROFILES.REACT, 'react');
  assert.strictEqual(PROFILES.VUE, 'vue');
  assert.strictEqual(SYNC_ACTIONS.CREATE, 'create');
  assert.strictEqual(SYNC_ACTIONS.UPDATE, 'update');
  assert.strictEqual(SYNC_ACTIONS.SKIP, 'skip');
}

async function testDoctorChecklist() {
  assert(Array.isArray(DOCTOR_CHECKLIST));
  assert(DOCTOR_CHECKLIST.length > 0);
  for (const item of DOCTOR_CHECKLIST) {
    assert(typeof item.path === 'string');
    assert(typeof item.category === 'string');
    assert(typeof item.required === 'boolean');
  }
  // 验证必要文件
  const requiredPaths = DOCTOR_CHECKLIST.filter((item) => item.required).map((item) => item.path);
  assert(requiredPaths.includes('.ai-spec/project.json'));
  assert(requiredPaths.includes('.agents/registry/ide-registry.json'));
}

async function testSyncFileTemplates() {
  assert(Array.isArray(SYNC_FILE_TEMPLATES.cursor));
  assert(Array.isArray(SYNC_FILE_TEMPLATES.claude));
  assert(SYNC_FILE_TEMPLATES.cursor.length > 0);
  assert(SYNC_FILE_TEMPLATES.claude.length > 0);
  for (const file of SYNC_FILE_TEMPLATES.cursor) {
    assert(file.path.startsWith('.cursor/'));
  }
  for (const file of SYNC_FILE_TEMPLATES.claude) {
    assert(file.path.startsWith('.claude/'));
  }
}

async function testGetPriorityAssets() {
  const reactAssets = getPriorityAssets(PROFILES.REACT);
  assert(reactAssets.rules.includes('frontend-react-rule'));
  assert(reactAssets.skills.includes('component-refactor'));

  const vueAssets = getPriorityAssets(PROFILES.VUE);
  assert(vueAssets.rules.includes('frontend-vue-rule'));
  assert(vueAssets.skills.includes('vue-component-implementer'));

  // auto 默认返回 React 资产
  const autoAssets = getPriorityAssets(PROFILES.AUTO);
  assert(autoAssets.rules.includes('frontend-react-rule'));
}

async function main() {
  await testConstants();
  await testDoctorChecklist();
  await testSyncFileTemplates();
  await testGetPriorityAssets();
  console.log('ide-types tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
