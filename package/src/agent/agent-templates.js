/**
 * Agent Templates — 预定义 Agent Profile 模板
 *
 * 提供 4 个标准 Agent 角色模板，可直接使用或作为自定义基础。
 */

const { AGENT_ROLES, ESCALATION_POLICIES, MEMORY_ACCESS_LEVELS } = require('./agent-types');

/**
 * architect-reviewer — 架构审查者
 * 负责架构边界审查、设计决策评估、技术方案评审
 */
const architectReviewer = Object.freeze({
  agentId: 'architect-reviewer',
  name: '架构审查者',
  role: AGENT_ROLES.ARCHITECT_REVIEWER,
  version: '1.0.0',
  description: '负责架构边界审查、设计决策评估、技术方案评审',
  responsibilities: [
    '审查代码变更是否符合架构边界',
    '评估技术方案的合理性和可扩展性',
    '检查模块间依赖关系是否合理',
    '验证设计模式的正确使用',
  ],
  allowedTools: ['Read', 'Grep', 'Glob', 'Agent'],
  deniedTools: ['Write', 'Edit', 'Bash'],
  allowedFileScopes: ['src/**', 'docs/**', 'tests/**'],
  deniedFileScopes: ['**/secrets/**', '**/.env*'],
  memoryAccess: MEMORY_ACCESS_LEVELS.READ,
  maxIterations: 5,
  escalationPolicy: ESCALATION_POLICIES.BLOCK,
  timeout: 300000,
  tags: ['review', 'architecture', 'readonly'],
});

/**
 * frontend-implementer — 前端实现者
 * 负责前端代码实现、组件开发、样式编写
 */
const frontendImplementer = Object.freeze({
  agentId: 'frontend-implementer',
  name: '前端实现者',
  role: AGENT_ROLES.FRONTEND_IMPLEMENTER,
  version: '1.0.0',
  description: '负责前端代码实现、组件开发、样式编写',
  responsibilities: [
    '按照 Spec 实现前端代码',
    '编写符合项目规范的组件',
    '实现页面路由和状态管理',
    '编写前端单元测试',
  ],
  allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  deniedTools: [],
  allowedFileScopes: ['src/**', 'tests/**', 'public/**'],
  deniedFileScopes: ['**/secrets/**', '**/.env*', 'src/server/**'],
  memoryAccess: MEMORY_ACCESS_LEVELS.READ_WRITE,
  maxIterations: 15,
  escalationPolicy: ESCALATION_POLICIES.RETRY,
  timeout: 600000,
  tags: ['implement', 'frontend', 'readwrite'],
});

/**
 * test-reviewer — 测试审查者
 * 负责测试覆盖审查、测试质量评估、测试策略建议
 */
const testReviewer = Object.freeze({
  agentId: 'test-reviewer',
  name: '测试审查者',
  role: AGENT_ROLES.TEST_REVIEWER,
  version: '1.0.0',
  description: '负责测试覆盖审查、测试质量评估、测试策略建议',
  responsibilities: [
    '审查测试覆盖率是否达标',
    '评估测试用例的质量和完整性',
    '检查测试隔离性和可重复性',
    '建议缺失的测试场景',
  ],
  allowedTools: ['Read', 'Grep', 'Glob', 'Bash', 'Agent'],
  deniedTools: ['Write', 'Edit'],
  allowedFileScopes: ['tests/**', 'src/**', '**/*.test.*', '**/*.spec.*'],
  deniedFileScopes: ['**/secrets/**', '**/.env*'],
  memoryAccess: MEMORY_ACCESS_LEVELS.READ,
  maxIterations: 5,
  escalationPolicy: ESCALATION_POLICIES.BLOCK,
  timeout: 300000,
  tags: ['review', 'test', 'readonly'],
});

/**
 * security-reviewer — 安全审查者
 * 负责安全风险审查、敏感信息检查、安全合规验证
 */
const securityReviewer = Object.freeze({
  agentId: 'security-reviewer',
  name: '安全审查者',
  role: AGENT_ROLES.SECURITY_REVIEWER,
  version: '1.0.0',
  description: '负责安全风险审查、敏感信息检查、安全合规验证',
  responsibilities: [
    '检查代码中的安全漏洞',
    '验证输入校验和输出转义',
    '检查敏感信息是否硬编码',
    '审查认证和授权逻辑',
  ],
  allowedTools: ['Read', 'Grep', 'Glob', 'Agent'],
  deniedTools: ['Write', 'Edit', 'Bash'],
  allowedFileScopes: ['src/**', 'tests/**', 'docs/**', '**/*.json', '**/*.yml', '**/*.yaml'],
  deniedFileScopes: ['**/secrets/**', '**/.env*', '**/node_modules/**'],
  memoryAccess: MEMORY_ACCESS_LEVELS.READ,
  maxIterations: 5,
  escalationPolicy: ESCALATION_POLICIES.BLOCK,
  timeout: 300000,
  tags: ['review', 'security', 'readonly'],
});

// ============================================================
// 模板注册表
// ============================================================

/** 所有预定义模板 */
const AGENT_TEMPLATES = Object.freeze({
  'architect-reviewer': architectReviewer,
  'frontend-implementer': frontendImplementer,
  'test-reviewer': testReviewer,
  'security-reviewer': securityReviewer,
});

/** 所有模板 ID 列表 */
const TEMPLATE_IDS = Object.keys(AGENT_TEMPLATES);

/**
 * 根据模板 ID 获取模板
 * @param {string} templateId
 * @returns {Object|null}
 */
function getTemplate(templateId) {
  return AGENT_TEMPLATES[templateId] || null;
}

/**
 * 列出所有可用模板
 * @returns {Array<{ id: string, name: string, role: string, description: string }>}
 */
function listTemplates() {
  return TEMPLATE_IDS.map((id) => {
    const tpl = AGENT_TEMPLATES[id];
    return { id, name: tpl.name, role: tpl.role, description: tpl.description };
  });
}

module.exports = {
  architectReviewer,
  frontendImplementer,
  testReviewer,
  securityReviewer,
  AGENT_TEMPLATES,
  TEMPLATE_IDS,
  getTemplate,
  listTemplates,
};
