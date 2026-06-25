const IDE_SCHEMA_VERSION = '1.0.0';

const IDE_TYPES = Object.freeze({
  CURSOR: 'cursor',
  CLAUDE: 'claude',
  CODEX: 'codex',
});

const LINK_MODES = Object.freeze({
  AUTO: 'auto',
  COPY: 'copy',
  SYMLINK: 'symlink',
});

const PROFILES = Object.freeze({
  AUTO: 'auto',
  REACT: 'react',
  VUE: 'vue',
});

const SYNC_ACTIONS = Object.freeze({
  CREATE: 'create',
  UPDATE: 'update',
  SKIP: 'skip',
  DELETE: 'delete',
});

/** doctor 检查时需要的所有文件清单 */
const DOCTOR_CHECKLIST = [
  { path: '.ai-spec/project.json', category: '项目配置', required: true },
  { path: '.ai-spec/ai-spec.lock.json', category: '锁定文件', required: true },
  { path: '.ai-spec/context-index.json', category: '上下文索引', required: true },
  { path: '.agents/registry.index.json', category: '资产注册表', required: true },
  { path: '.agents/registry/ide-registry.json', category: 'IDE 注册表', required: true },
  { path: '.ai-spec/ide-integration.json', category: 'IDE 集成状态', required: true },
  { path: '.cursor/rules/ai-spec-auto.mdc', category: 'Cursor 指针', required: false },
  { path: '.cursor/commands/spec-start.md', category: 'Cursor 命令', required: false },
  { path: '.cursor/commands/spec-update.md', category: 'Cursor 命令', required: false },
  { path: '.cursor/commands/spec-status.md', category: 'Cursor 命令', required: false },
  { path: '.claude/ai-spec-auto.md', category: 'Claude 指针', required: false },
  { path: '.claude/commands/spec-start.md', category: 'Claude 命令', required: false },
  { path: '.claude/commands/spec-update.md', category: 'Claude 命令', required: false },
  { path: '.claude/commands/spec-status.md', category: 'Claude 命令', required: false },
];

/** IDE sync 生成的文件清单（仅 AI 管理文件） */
const SYNC_FILE_TEMPLATES = {
  cursor: [
    { path: '.cursor/rules/ai-spec-auto.mdc', type: 'pointer-rule' },
    { path: '.cursor/commands/spec-start.md', type: 'command' },
    { path: '.cursor/commands/spec-update.md', type: 'command' },
    { path: '.cursor/commands/spec-status.md', type: 'command' },
  ],
  claude: [
    { path: '.claude/ai-spec-auto.md', type: 'pointer-entry' },
    { path: '.claude/commands/spec-start.md', type: 'command' },
    { path: '.claude/commands/spec-update.md', type: 'command' },
    { path: '.claude/commands/spec-status.md', type: 'command' },
  ],
};

/** React profile 优先级资产 */
const REACT_PRIORITY_ASSETS = {
  rules: ['frontend-common-rule', 'frontend-react-rule'],
  skills: ['frontend-implementer', 'component-refactor', 'route-change', 'state-management', 'unit-test-writer'],
  commands: ['project-init', 'spec-start', 'spec-update', 'spec-status', 'spec-continue'],
};

/** Vue profile 优先级资产 */
const VUE_PRIORITY_ASSETS = {
  rules: ['frontend-common-rule', 'frontend-vue-rule'],
  skills: ['frontend-implementer', 'vue-component-implementer', 'vite-build-checker', 'unit-test-writer'],
  commands: ['project-init', 'spec-start', 'spec-update', 'spec-status', 'spec-continue'],
};

function getPriorityAssets(profile) {
  if (profile === PROFILES.REACT) return REACT_PRIORITY_ASSETS;
  if (profile === PROFILES.VUE) return VUE_PRIORITY_ASSETS;
  // auto: 默认使用 React 资产（前端常见）
  return REACT_PRIORITY_ASSETS;
}

module.exports = {
  IDE_SCHEMA_VERSION,
  IDE_TYPES,
  LINK_MODES,
  PROFILES,
  SYNC_ACTIONS,
  DOCTOR_CHECKLIST,
  SYNC_FILE_TEMPLATES,
  REACT_PRIORITY_ASSETS,
  VUE_PRIORITY_ASSETS,
  getPriorityAssets,
};
