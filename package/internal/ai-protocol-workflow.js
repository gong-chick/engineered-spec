const fs = require('fs');
const path = require('path');
const runner = require('../bin/task-orchestrator-runner');
const { archiveChange } = require('../bin/archive-change');
const {
  inferDeliveryProfile,
  inferArtifactProfile,
  inferComplexity,
  inferRiskLevel,
  recordRunInputUpdate,
  bootstrapRunState,
  pauseRunState,
  approveRunState,
  resumeRunState,
  completeRunState,
} = require('../bin/runtime-state');
const {
  resolveRuntimePaths,
  getExistingPath,
  getExistingRelPath,
} = require('../bin/runtime-paths');
const {
  getRoleRuntimeConfig,
  getFlowRuntimeConfig,
  getRuleRuntimeConfig,
  getSkillRuntimeConfig,
  getRoleRuleIds,
  getRoleSkillPriority,
  resolveRuntimeProfileId,
} = require('../bin/runtime-registry');
const {
  getRuntimeTransition,
} = require('../bin/execution-semantics');
const {
  buildSuperpowersContract,
  loadSuperpowersState,
} = require('../bin/superpowers');
const {
  pushVisualRuntimeStateSnapshot,
  pushVisualRuntimeStateSnapshotNow,
  drainVisualRuntimeStatePushes,
} = require('./visual-hooks/runtime-state-pusher');

const PACKAGE_ROOT = path.resolve(__dirname, '..');
const START_INSTRUCTION_FILES = [
  '.agents/orchestration/task-orchestrator-run-plan-template.md',
];

const CONTINUE_INSTRUCTION_FILES = [];

const DISPATCH_INSTRUCTION_FILES = [];

const FALLBACK_RULE_SOURCE_CANDIDATES = {
  'project-overview': {
    vue: ['.agents/rules/01-项目概述.md', '.agents/rules/profiles/vue/01-项目概述.md'],
    react: ['.agents/rules/01-项目概述.md', '.agents/rules/profiles/react/01-项目概述.md'],
    default: ['.agents/rules/01-项目概述.md'],
  },
  'project-structure': {
    vue: ['.agents/rules/03-项目结构.md', '.agents/rules/profiles/vue/03-项目结构.md'],
    react: ['.agents/rules/03-项目结构.md', '.agents/rules/profiles/react/03-项目结构.md'],
    default: ['.agents/rules/03-项目结构.md'],
  },
  'component-standard': {
    vue: ['.agents/rules/04-组件规范.md', '.agents/rules/profiles/vue/04-组件规范.md'],
    react: ['.agents/rules/04-组件规范.md', '.agents/rules/profiles/react/04-组件规范.md'],
    default: ['.agents/rules/04-组件规范.md'],
  },
  'api-standard': {
    default: ['.agents/rules/05-API规范.md', '.agents/rules/common/05-API规范.md'],
  },
  'route-standard': {
    vue: ['.agents/rules/06-路由规范.md', '.agents/rules/profiles/vue/06-路由规范.md'],
    react: ['.agents/rules/06-路由规范.md', '.agents/rules/profiles/react/06-路由规范.md'],
    default: ['.agents/rules/06-路由规范.md'],
  },
  'store-standard': {
    vue: ['.agents/rules/07-状态管理.md', '.agents/rules/profiles/vue/07-状态管理.md'],
    react: ['.agents/rules/07-状态管理.md', '.agents/rules/profiles/react/07-状态管理.md'],
    default: ['.agents/rules/07-状态管理.md'],
  },
  'style-standard': {
    vue: ['.agents/rules/09-样式规范.md', '.agents/rules/profiles/vue/09-样式规范.md'],
    react: ['.agents/rules/09-样式规范.md', '.agents/rules/profiles/react/09-样式规范.md'],
    default: ['.agents/rules/09-样式规范.md'],
  },
  'coding-standard': {
    default: ['.agents/rules/02-编码规范.md', '.agents/rules/common/02-编码规范.md'],
  },
  'test-standard': {
    default: ['.agents/rules/11-测试规范.md', '.agents/rules/common/11-测试规范.md'],
  },
  'format-check-standard': {
    default: ['.agents/rules/13-代码格式化与检查.md', '.agents/rules/common/13-代码格式化与检查.md'],
  },
  'audit-report-standard': {
    default: ['.agents/rules/14-审计汇报规范.md', '.agents/rules/common/14-审计汇报规范.md'],
  },
};

const FALLBACK_ROLE_RULE_IDS = {
  'task-orchestrator': ['project-overview', 'project-structure', 'api-standard', 'route-standard', 'style-standard'],
  'requirement-analyst': ['project-overview', 'project-structure', 'api-standard', 'route-standard', 'style-standard'],
  'frontend-implementer': ['project-structure', 'component-standard', 'route-standard', 'api-standard', 'store-standard', 'style-standard'],
  'code-guardian': ['coding-standard', 'api-standard', 'route-standard', 'style-standard', 'test-standard', 'format-check-standard', 'audit-report-standard'],
  'archive-change': ['audit-report-standard'],
  'design-collaborator': ['project-structure', 'component-standard', 'route-standard', 'style-standard'],
  'api-contract-specialist': ['project-overview', 'api-standard', 'route-standard'],
  'unit-test-specialist': ['coding-standard', 'test-standard', 'audit-report-standard'],
  'verification-reviewer': ['test-standard', 'style-standard', 'audit-report-standard'],
  'performance-auditor': ['project-structure', 'coding-standard', 'format-check-standard'],
};

const FALLBACK_SKILL_SOURCE_CANDIDATES = {
  'create-proposal': {
    default: ['.agents/skills/common/create-proposal/SKILL.md'],
  },
  'design-analysis': {
    default: ['.agents/skills/common/design-analysis/SKILL.md'],
  },
  'ui-ux-pro-max': {
    default: ['.agents/skills/domains/ui-ux-pro-max/SKILL.md'],
  },
  'create-view': {
    vue: ['.agents/skills/profiles/vue/create-view/SKILL.md'],
  },
  'create-component': {
    vue: ['.agents/skills/profiles/vue/create-component/SKILL.md'],
    react: ['.agents/skills/profiles/react/create-component/SKILL.md'],
    default: ['.agents/skills/profiles/vue/create-component/SKILL.md'],
  },
  'create-route': {
    vue: ['.agents/skills/profiles/vue/create-route/SKILL.md'],
    react: ['.agents/skills/profiles/react/create-route/SKILL.md'],
  },
  'create-api': {
    vue: ['.agents/skills/profiles/vue/create-api/SKILL.md'],
    react: ['.agents/skills/profiles/react/create-api/SKILL.md'],
  },
  'create-store': {
    vue: ['.agents/skills/profiles/vue/create-store/SKILL.md'],
    react: ['.agents/skills/profiles/react/create-store/SKILL.md'],
  },
  'theme-variables': {
    vue: ['.agents/skills/profiles/vue/theme-variables/SKILL.md'],
    react: ['.agents/skills/profiles/react/theme-variables/SKILL.md'],
  },
  'execute-task': {
    default: ['.agents/skills/common/execute-task/SKILL.md'],
  },
  'create-test': {
    default: ['.agents/skills/common/create-test/SKILL.md'],
  },
  'ui-verification': {
    default: ['.agents/skills/common/ui-verification/SKILL.md'],
  },
  'web-design-guidelines': {
    default: ['.agents/skills/common/web-design-guidelines/SKILL.md'],
  },
};

const FALLBACK_ROLE_SKILL_PRIORITY = {
  'requirement-analyst': ['create-proposal', 'design-analysis'],
  'frontend-implementer': ['create-view', 'create-route', 'create-api', 'theme-variables', 'create-component', 'create-store', 'execute-task'],
  'code-guardian': ['ui-verification', 'web-design-guidelines', 'create-test'],
  'design-collaborator': ['ui-ux-pro-max', 'design-analysis'],
  'api-contract-specialist': ['create-api', 'design-analysis'],
  'unit-test-specialist': ['create-test'],
  'verification-reviewer': ['ui-verification', 'web-design-guidelines'],
  'performance-auditor': ['web-design-guidelines'],
};

const FALLBACK_ROLE_OPENSPEC_RULE_SECTIONS = {
  'requirement-analyst': ['proposal', 'specs', 'design', 'tasks'],
  'frontend-implementer': ['specs', 'tasks', 'design'],
  'code-guardian': ['tasks', 'specs', 'design', 'checklist', 'iterations'],
  'archive-change': ['specs', 'design', 'checklist', 'iterations'],
};

const DEFAULT_FLOW_ID = 'prd-to-delivery';
const QUICK_FIX_FLOW_ID = 'bugfix-to-verification';
const DEFAULT_RUN_MODE = 'auto';
const DEFAULT_REVIEW_POLICY = 'none';
const RUN_MODES = new Set(['auto', 'suggest', 'manual']);
const REVIEW_POLICIES = new Set(['none', 'main-flow-blocking']);
const DEFAULT_FLOW_CONSTRAINTS = {
  required_roles: ['requirement-analyst', 'frontend-implementer', 'code-guardian'],
  approval_gates: [],
  required_artifacts: ['proposal.md', 'specs', 'design.md', 'tasks.md', 'checklist.md', 'iterations.md'],
};

const DEFAULT_HANDOFF_GATE_POLICY = {
  'requirement-analyst->frontend-implementer': 'silent',
  'frontend-implementer->code-guardian': 'silent',
  'code-guardian->archive-change': 'silent',
};

function normalizeRunMode(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return RUN_MODES.has(normalized) ? normalized : DEFAULT_RUN_MODE;
}

function normalizeReviewPolicy(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return REVIEW_POLICIES.has(normalized) ? normalized : DEFAULT_REVIEW_POLICY;
}

function buildEffectiveApprovalGates(flowId, gates, reviewPolicy) {
  const normalizedPolicy = normalizeReviewPolicy(reviewPolicy);
  const deduped = [...new Set(normalizeStringArray(gates))];
  if (flowId !== DEFAULT_FLOW_ID || normalizedPolicy !== 'main-flow-blocking') {
    return deduped;
  }
  const supportedMainFlowGates = new Set(['before-implementation', 'before-guardian', 'before-archive']);
  const shouldInjectMainFlowGates = deduped.length === 0 || deduped.every((gate) => supportedMainFlowGates.has(gate));
  if (!shouldInjectMainFlowGates) {
    return deduped;
  }

  const ordered = [];
  for (const gate of ['before-implementation', 'before-guardian', 'before-archive']) {
    if (!ordered.includes(gate)) {
      ordered.push(gate);
    }
  }
  for (const gate of deduped) {
    if (!ordered.includes(gate)) {
      ordered.push(gate);
    }
  }
  return ordered;
}

function buildEffectiveHandoffGatePolicy(flowId, handoffGatePolicy, reviewPolicy) {
  const normalizedPolicy = normalizeReviewPolicy(reviewPolicy);
  const nextPolicy = {
    ...(handoffGatePolicy || {}),
  };

  const supportedPairs = new Set([
    'requirement-analyst->frontend-implementer',
    'frontend-implementer->code-guardian',
    'code-guardian->archive-change',
  ]);
  const shouldInjectMainFlowPolicy = Object.keys(nextPolicy).length === 0
    || Object.keys(nextPolicy).every((pair) => supportedPairs.has(pair));

  if (flowId === DEFAULT_FLOW_ID && normalizedPolicy === 'main-flow-blocking' && shouldInjectMainFlowPolicy) {
    nextPolicy['requirement-analyst->frontend-implementer'] = 'approval';
    nextPolicy['frontend-implementer->code-guardian'] = 'approval';
    nextPolicy['code-guardian->archive-change'] = 'approval';
  }

  return nextPolicy;
}

const MICRO_ROLE_EXTRAS = {
  'task-orchestrator': {
    goal: '用最小 run-plan 编排微型任务，保留三专家但收口产物和说明。',
    must_do: [
      '明确 delivery_profile=micro 与 artifact_profile=compact',
      '优先按仓库现状复用目录、路由、mock 和样式承载方式',
    ],
    must_not: [
      '不要为了微型任务扩展额外专家或发明新流程',
    ],
  },
  'requirement-analyst': {
    goal: '用短版 proposal.md、specs/、design.md 和 tasks.md 收敛需求，不写实现代码。',
    must_do: [
      'proposal.md 只保留目标、范围、默认假设、风险四块',
      'specs/<domain>/spec.md 只保留当前变更需要的增量规范和场景',
      'design.md 只保留真实实现落点和关键约束',
      'tasks.md 保持 3-5 条可执行任务，覆盖实现与验收',
    ],
    must_not: [
      '不要把微型任务写成长篇方案说明',
    ],
  },
  'frontend-implementer': {
    goal: '基于短版 proposal/specs/design/tasks 做最小必要实现，优先复用现有结构。',
    must_do: [
      '保持改动最小化，优先就地复用现有页面、组件、样式变量和 mock 约定',
      '实现说明只保留当前变更、验证结果和残留风险',
    ],
    must_not: [
      '不要为了“看起来完整”而扩展无关范围',
    ],
  },
  'code-guardian': {
    goal: '用短版 checklist.md 和 iterations.md 完成交付守护，明确阻断项。',
    must_do: [
      'checklist.md 使用最小核查清单，直接给出通过/不通过',
      'iterations.md 只记录问题、修正动作和残留风险',
    ],
    must_not: [
      '不要输出泛泛而谈的长篇审查结论',
    ],
  },
};

const MICRO_OPENSPEC_RULES = {
  proposal: [
    '短版 proposal 只保留目标、范围、默认假设、风险/待确认四块。',
    '若为页面或组件任务，明确落点路径或目录，不写长篇背景说明。',
    '若为 mock 任务，显式说明不接真实 API。'
  ],
  tasks: [
    '短版 tasks 保持 3-5 条可执行任务，覆盖实现与最小验收。',
    '每条任务都要可落盘、可验证，避免空标题。',
    '保持改动最小化，聚焦本次请求。'
  ],
  design: [
    '只保留当前实现真正需要的结构与样式约束。',
    '继续使用主题变量和既有目录结构。'
  ],
  specs: [
    '只记录当前变更真正需要的增量规范和关键验收场景。',
    '保留可测试的结论，不展开无关背景说明。'
  ],
  checklist: [
    'checklist.md 只保留关键检查项、阻断项和最终放行结论。',
    '检查项必须能回指 proposal/specs/design/tasks 或实现证据。'
  ],
  iterations: [
    'iterations.md 只记录问题、修正动作和残留风险。',
    '避免输出泛泛复盘，聚焦本轮变更。'
  ],
};

const ROLE_GUIDANCE = {
  'task-orchestrator': {
    goal: '基于项目事实编排流程、门禁和专家交接，不直接承担具体实现。',
    must_do: [
      '先看项目现状、规则和风险，再决定交付档位、门禁和第一跳专家',
      '将仓库可推断的事实转成 assumptions 或 routing constraints，而不是重复回问用户',
      '对高风险和审批场景明确给出下一步，不允许隐式放行',
    ],
    must_not: [
      '不要越权替代 requirement-analyst、frontend-implementer 或 code-guardian 的职责',
      '不要在 proposal/specs/design/tasks/checklist/iterations 缺失时跳过门禁直接推进',
    ],
  },
  'requirement-analyst': {
    goal: '把需求收敛成可执行的 proposal.md、specs/、design.md 和 tasks.md，不写实现代码。',
    must_do: [
      '先明确目标、范围、非目标、关键假设和风险',
      'proposal.md、specs/ 和 design.md 需要能支撑后续实现和验收',
      'tasks.md 必须是可执行任务清单，而不是空标题模板',
    ],
    must_not: [
      '不要直接开始写 Vue/TS/CSS 代码',
      '不要在 proposal.md、specs/、design.md 和 tasks.md 未落盘前宣称本阶段完成',
    ],
  },
  'frontend-implementer': {
    goal: '基于 proposal.md、specs/、design.md 和 tasks.md 完成当前范围内的前端实现。',
    must_do: [
      '先读 proposal.md、specs/、design.md 和 tasks.md 再改代码',
      '严格在当前变更范围内实现，不顺手扩 scope',
      '遵守最小改动原则，只修改与当前任务直接相关的文件',
      '实现完成后写 expert-execution 回执并等待下一轮编排',
    ],
    must_not: [
      '不要重新定义需求边界',
      '不要跳过实现验证直接宣称交付完成',
    ],
  },
  'code-guardian': {
    goal: '基于 proposal、specs、design、tasks 和实现结果做交付前检查，产出 checklist.md 和 iterations.md。',
    must_do: [
      '明确区分阻断项和非阻断项',
      'checklist.md 记录检查项和结论',
      'iterations.md 记录问题、修正动作和残留风险',
    ],
    must_not: [
      '不要在 checklist.md 和 iterations.md 未落盘前给 complete 结论',
      '不要把明显问题写成模糊建议',
    ],
  },
  'archive-change': {
    goal: '在归档批准后先完成 preflight，再通过 archive-change 命令做规范合并、目录归档和运行收尾。',
    must_do: [
      '先确认 proposal/specs/design/tasks/checklist/iterations 已齐备',
      '归档摘要要说明合并的 spec、归档位置、残留风险和后续 patch 的回退阶段',
      '优先执行 archive-change 内置命令，不手工搬运目录',
    ],
    must_not: [
      '不要在 preflight 未通过时强行归档',
      '不要在命令成功后重复补写 execution 或再次 advance',
    ],
  },
  'design-collaborator': {
    goal: '把设计稿、交互说明和视觉约束整理成可执行的设计协作结论，不直接承担业务实现。',
    must_do: [
      '明确页面结构、关键状态与交互歧义',
      '把设计约束落到当前项目的页面、组件、样式变量与路由上下文',
    ],
    must_not: [
      '不要直接替代 frontend-implementer 写业务实现',
    ],
  },
  'api-contract-specialist': {
    goal: '在实现前把接口契约、字段边界和 mock/真实接口切换规则说清楚。',
    must_do: [
      '明确输入输出、状态和值域约束',
      '把接口约束回写到当前变更需要更新的章节，而不是只给抽象建议',
    ],
    must_not: [
      '不要把尚未确认的接口假设伪装成已批准事实',
    ],
  },
  'unit-test-specialist': {
    goal: '补充关键逻辑的单测策略与高回归风险保护点。',
    must_do: [
      '识别最值得补测的逻辑和边界场景',
      '优先给出最小必要测试增量，不为覆盖率而覆盖率',
    ],
    must_not: [
      '不要用大面积补测试掩盖需求边界或实现问题',
    ],
  },
  'verification-reviewer': {
    goal: '从验收视角补强验证结论，确保交付不是“代码完成但验证不足”。',
    must_do: [
      '对照 proposal/specs/design/tasks 检查验收口径是否闭环',
      '明确哪些验证已完成、哪些仍需补充',
    ],
    must_not: [
      '不要重复 code-guardian 已给出的泛化审查意见',
    ],
  },
  'performance-auditor': {
    goal: '识别页面、资源和交互层面的主要性能风险，并给出最值得先做的优化建议。',
    must_do: [
      '优先定位高收益性能问题，而不是罗列泛泛建议',
      '将性能风险与当前页面结构、数据量和交互路径绑定',
    ],
    must_not: [
      '不要把性能优化扩展成不必要的大范围重构',
    ],
  },
};

const SKILL_GUIDANCE = {
  'create-proposal': '用于快速形成 proposal/specs/design/tasks 的结构和变更说明。',
  'design-analysis': '用于整理页面结构、信息层级和交互要点。',
  'ui-ux-pro-max': '用于设计协作阶段的 Figma 解析、标注提取和 UI/UX 设计决策收口。',
  'create-view': '用于创建或调整 Vue 页面文件与页面目录结构。',
  'create-component': '用于拆分和实现 Vue 组件。',
  'create-route': '用于新增或调整页面路由。',
  'create-api': '用于创建接口定义与请求封装。',
  'create-store': '用于新增或调整全局状态。',
  'theme-variables': '用于处理主题变量与样式约束。',
  'execute-task': '用于按任务清单逐项推进实现。',
  'create-test': '用于补充测试文件或测试建议。',
  'ui-verification': '用于 UI 验收与页面核查。',
  'web-design-guidelines': '用于规则和体验审查。',
};

const FALLBACK_ROLE_RULE_CONSTRAINT_PROFILES = {
  default: {
    'task-orchestrator': {
      must_follow: [
        '首轮编排必须优先吸收仓库现状与规则，再决定 flow、delivery_profile 和人工确认点。',
        '能从仓库结构、项目规则推断的路由/API/mock/样式事实，优先转成 assumptions 或 routing constraints。',
      ],
      blocked_when: [
        '高风险领域的流程、安全、合规、风控或权限边界仍未确认时，不得放行到 frontend-implementer。',
      ],
    },
    'requirement-analyst': {
      must_follow: [
        '先把项目定位、目录落点、路由/API/样式约定吸收到 proposal/specs/design/tasks，不要把规范已明确的信息重复写成 missing_inputs。',
        '需求收敛必须同时落到 specs/ 与 design.md，不能只写 tasks 而缺实现落点。',
        '需求收敛必须落到当前仓库可实施的页面、路由、接口或 mock 落点，而不是抽象方案。',
      ],
      blocked_when: [
        '高风险领域的流程、安全、合规、风控或权限边界仍未确认时，必须维持 before-implementation 门禁。',
      ],
    },
    'frontend-implementer': {
      must_follow: [
        '优先复用现有目录、路由、请求封装、状态管理和样式变量约定。',
        '实现前先对齐 proposal/specs/design/tasks 的范围与落点，不要自行扩 scope。',
        '坚持最小 patch，避免顺手重构无关模块或扩大改动面。',
      ],
      blocked_when: [
        'proposal/specs/design/tasks 未落盘或仍处于 before-implementation 审批门禁时，禁止改业务代码。',
      ],
    },
    'code-guardian': {
      must_follow: [
        '以 proposal/specs/design/tasks 和项目规则为准检查实现，而不是只做泛化 lint。',
        '必须给出阻断项、非阻断项和交付建议，不能写成模糊建议列表。',
      ],
      blocked_when: [
        '存在与项目规范冲突的目录、路由、API、样式或测试问题时，不得给 complete 结论。',
      ],
    },
  },
  vue: {
    'task-orchestrator': {
      must_follow: [
        'Vue 页面类任务优先以 src/views、src/router/modules、src/api、src/api/types、src/style.css 等当前仓库落点编排。',
        '若仓库缺少 vue-router 或请求层骨架，要先把“补骨架还是保持占位入口”写进编排约束。',
        'mock-first、真实接口、Pinia/store 与主题变量策略需要在首轮编排时明确，不留到实现阶段临时猜。'
      ],
    },
    'requirement-analyst': {
      must_follow: [
        '页面任务优先对齐 src/views/<page>/index.vue 与 src/router/modules/<module>.ts 的落点约定。',
        '若为 mock 或占位页，明确写清 src/mock 或本地 mock 方案，以及“不接真实 API”的边界。',
        '样式和视觉约束需对齐主题 CSS 变量，不要把硬编码颜色或自由样式当默认方案。',
      ],
    },
    'frontend-implementer': {
      must_follow: [
        'Vue 视图优先落在 src/views/<page>/index.vue；页面专用组件落在 src/views/<page>/components/。',
        '路由统一放在 src/router/modules/，页面路由必须懒加载，并补齐 meta.title / requiresAuth 等项目约定。',
        '接口统一走 src/api/<module>.ts 与 src/api/types/<module>.ts，组件或页面里禁止直接调 request。',
        '状态管理统一走 Pinia 和 src/store/modules/；mock-first 场景优先本地状态，不预建复杂 store。',
        '样式必须使用主题变量和 scoped/CSS Modules，禁止硬编码颜色值。',
      ],
    },
    'code-guardian': {
      must_follow: [
        '核查页面是否落在 src/views、路由是否落在 src/router/modules，并保持动态导入。',
        '核查 API 是否通过 src/api 封装、类型是否放在 src/api/types，页面中未直接调 request。',
        '核查样式是否使用主题变量、scoped 或 CSS Modules，而不是硬编码全局样式。',
        '核查 Pinia/store、mock 与 proposal/specs/design/tasks 的边界是否一致，避免“演示页写成生产页”。',
      ],
    },
  },
};

const ROLE_RULE_REPO_SPECIFIC = {
  vue: {
    'task-orchestrator': {
      repo_specific: (facts) => [
        facts.routeEntry ? `当前路由入口为 ${facts.routeEntry}，优先按现有路由骨架编排。` : '仓库尚未检测到路由入口；页面类任务需先明确补路由骨架还是保留占位入口。',
        facts.apiDir ? `当前 API 目录为 ${facts.apiDir}${facts.apiTypesDir ? `，类型目录为 ${facts.apiTypesDir}` : ''}。` : '仓库尚未检测到 API 模块目录；真实接口任务需先明确请求层承载方式。',
        facts.styleEntry ? `当前样式入口为 ${facts.styleEntry}，需沿用主题变量与现有样式承载方式。` : null,
      ].filter(Boolean),
    },
    'requirement-analyst': {
      repo_specific: (facts) => [
        facts.routeModulesDir ? `当前仓库已有路由模块目录 ${facts.routeModulesDir}，proposal/specs/design/tasks 需要按该目录组织。` : '若项目尚未接入 vue-router，需要在 proposal/specs/design/tasks 明确是补路由还是保持占位入口。',
        facts.viewsDir ? `页面目录以 ${facts.viewsDir} 为准，任务拆解要写清页面落点。` : null,
      ].filter(Boolean),
    },
    'frontend-implementer': {
      repo_specific: (facts) => [
        facts.routeEntry ? `当前路由入口为 ${facts.routeEntry}。` : '仓库尚未检测到路由入口，若需新增路由必须先补路由骨架。',
        facts.requestConfig ? `当前请求层配置入口为 ${facts.requestConfig}。` : facts.apiDir ? `当前 API 目录为 ${facts.apiDir}，新增接口时保持模块化拆分。` : '仓库尚未检测到 API 封装入口，如需真实接口需先补请求层约定。',
        facts.styleEntry ? `当前样式入口为 ${facts.styleEntry}，新增样式要沿用主题变量。` : null,
      ].filter(Boolean),
    },
    'code-guardian': {
      repo_specific: (facts) => [
        facts.routeModulesDir ? `重点核对 ${facts.routeModulesDir} 下的路由模块是否与页面落点一致。` : null,
        facts.mockDir ? `重点核对 ${facts.mockDir} 中的 mock 是否与演示范围一致。` : null,
      ].filter(Boolean),
    },
  },
};

const MICRO_ROLE_SKILL_ALLOWLIST = {
  'requirement-analyst': ['create-proposal', 'design-analysis'],
  'frontend-implementer': ['create-view', 'create-route', 'create-api', 'theme-variables', 'create-component', 'create-store'],
  'code-guardian': ['ui-verification', 'web-design-guidelines'],
};

function resolveTargetDir(target) {
  return path.resolve(process.cwd(), target || '.');
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function finalizeProtocolResult(targetDir, result) {
  pushVisualRuntimeStateSnapshot(targetDir);
  return result;
}

function buildFileTarget(targetDir, relPath, options = {}) {
  const absolutePath = path.join(targetDir, relPath);
  const exists = fs.existsSync(absolutePath);
  const isDirectory = relPath.endsWith('/') || (exists && fs.statSync(absolutePath).isDirectory());

  return {
    kind: isDirectory ? 'directory' : 'file',
    path: absolutePath,
    rel_path: relPath,
    exists,
    required: Boolean(options.required),
    label: options.label || null,
  };
}

function buildReadableTarget(targetDir, relPath, options = {}) {
  const targetPath = path.join(targetDir, relPath);
  if (fs.existsSync(targetPath)) {
    return {
      ...buildFileTarget(targetDir, relPath, options),
      origin: 'target',
    };
  }

  const packagePath = path.join(PACKAGE_ROOT, relPath);
  if (fs.existsSync(packagePath)) {
    const isDirectory = relPath.endsWith('/') || fs.statSync(packagePath).isDirectory();
    return {
      kind: isDirectory ? 'directory' : 'file',
      path: packagePath,
      rel_path: relPath,
      exists: true,
      required: Boolean(options.required),
      label: options.label || null,
      origin: 'package',
    };
  }

  return {
    ...buildFileTarget(targetDir, relPath, options),
    origin: 'target',
  };
}

function buildReadableTargetFromCandidates(targetDir, candidates, options = {}) {
  const normalized = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
  if (normalized.length === 0) {
    return null;
  }

  for (const candidate of normalized) {
    const targetPath = path.join(targetDir, candidate);
    if (fs.existsSync(targetPath)) {
      return {
        ...buildFileTarget(targetDir, candidate, options),
        origin: 'target',
      };
    }
  }

  for (const candidate of normalized) {
    const packagePath = path.join(PACKAGE_ROOT, candidate);
    if (fs.existsSync(packagePath)) {
      const isDirectory = candidate.endsWith('/') || fs.statSync(packagePath).isDirectory();
      return {
        kind: isDirectory ? 'directory' : 'file',
        path: packagePath,
        rel_path: candidate,
        exists: true,
        required: Boolean(options.required),
        label: options.label || null,
        origin: 'package',
      };
    }
  }

  return {
    ...buildFileTarget(targetDir, normalized[0], options),
    origin: 'target',
  };
}

function buildSymbolicTarget(value, options = {}) {
  return {
    kind: 'symbolic',
    value,
    required: Boolean(options.required),
    label: options.label || null,
  };
}

function loadPackageManifest(targetDir) {
  const packagePath = path.join(targetDir, 'package.json');
  if (!fs.existsSync(packagePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(packagePath, 'utf8'));
}

function hasDependency(pkg, names) {
  if (!pkg) {
    return false;
  }

  const deps = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
    ...(pkg.peerDependencies || {}),
  };

  return names.some((name) => Object.prototype.hasOwnProperty.call(deps, name));
}

function detectProjectProfile(targetDir) {
  const manifestPath = path.join(targetDir, '.ai-spec', 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const manifestProfile = resolveRuntimeProfileId(targetDir, manifest?.profile);
      if (manifestProfile) {
        return manifestProfile;
      }
    } catch (error) {
      // Ignore invalid local manifest during profile detection and fall back to repo facts.
    }
  }

  const pkg = loadPackageManifest(targetDir);
  if (hasDependency(pkg, ['vue', 'vue-router', 'pinia'])) {
    return 'vue';
  }
  if (hasDependency(pkg, ['react', 'react-dom', 'react-router-dom'])) {
    return 'react';
  }
  return 'default';
}

function detectProjectLanguage(targetDir, pkg) {
  if (hasDependency(pkg, ['typescript']) || fs.existsSync(path.join(targetDir, 'tsconfig.json'))) {
    return 'TypeScript';
  }
  return 'JavaScript';
}

function detectBuildTool(pkg) {
  if (hasDependency(pkg, ['vite'])) {
    return 'Vite';
  }
  if (hasDependency(pkg, ['next'])) {
    return 'Next.js';
  }
  if (hasDependency(pkg, ['nuxt'])) {
    return 'Nuxt';
  }
  if (hasDependency(pkg, ['webpack'])) {
    return 'Webpack';
  }
  return 'unknown';
}

function detectPackageManager(targetDir) {
  if (fs.existsSync(path.join(targetDir, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }
  if (fs.existsSync(path.join(targetDir, 'yarn.lock'))) {
    return 'yarn';
  }
  if (fs.existsSync(path.join(targetDir, 'package-lock.json'))) {
    return 'npm';
  }
  return 'unknown';
}

function findExistingRelPath(targetDir, candidates) {
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(targetDir, candidate))) {
      return candidate;
    }
  }
  return null;
}

function normalizeOptionalRelPath(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function buildRepoConventionsFromRepoMap(projectProfile, repoMap) {
  const paths = repoMap?.paths && typeof repoMap.paths === 'object'
    ? repoMap.paths
    : {};

  return {
    project_profile: projectProfile,
    projectContextPath: normalizeOptionalRelPath(paths.project_context),
    routeEntry: normalizeOptionalRelPath(paths.route_entry),
    routeModulesDir: normalizeOptionalRelPath(paths.route_modules_dir),
    viewsDir: normalizeOptionalRelPath(paths.views_dir),
    apiDir: normalizeOptionalRelPath(paths.api_dir),
    apiTypesDir: normalizeOptionalRelPath(paths.api_types_dir),
    mockDir: normalizeOptionalRelPath(paths.mock_dir),
    storeModulesDir: normalizeOptionalRelPath(paths.store_modules_dir),
    styleEntry: normalizeOptionalRelPath(paths.style_entry),
    requestConfig: normalizeOptionalRelPath(paths.request_config),
    appEntry: normalizeOptionalRelPath(paths.app_entry),
    mainEntry: normalizeOptionalRelPath(paths.main_entry),
  };
}

function collectRepoConventions(targetDir, projectProfile) {
  const repoMap = readJsonIfExists(path.join(targetDir, '.ai-spec', 'repo-map.json'));
  if (repoMap?.kind === 'repo-map' && repoMap.paths && typeof repoMap.paths === 'object') {
    return buildRepoConventionsFromRepoMap(projectProfile, repoMap);
  }

  const routeEntry = findExistingRelPath(targetDir, ['src/router/index.ts', 'src/router/index.js']);
  const routeModulesDir = findExistingRelPath(targetDir, ['src/router/modules']);
  const viewsDir = findExistingRelPath(targetDir, ['src/views']);
  const apiDir = findExistingRelPath(targetDir, ['src/api']);
  const apiTypesDir = findExistingRelPath(targetDir, ['src/api/types']);
  const mockDir = findExistingRelPath(targetDir, ['src/mock', 'src/mocks']);
  const storeModulesDir = findExistingRelPath(targetDir, ['src/store/modules', 'src/stores/modules', 'src/store']);
  const styleEntry = findExistingRelPath(targetDir, ['src/styles', 'src/style.css', 'src/style.scss', 'src/styles/variables.scss']);
  const requestConfig = findExistingRelPath(targetDir, [
    'src/config/requestConfig.ts',
    'src/config/requestConfig.js',
    'src/lib/request.ts',
    'src/libs/request.ts',
    'src/utils/request.ts',
  ]);
  const appEntry = findExistingRelPath(targetDir, ['src/App.vue', 'src/App.tsx', 'src/App.jsx']);
  const mainEntry = findExistingRelPath(targetDir, ['src/main.ts', 'src/main.js', 'src/main.tsx', 'src/main.jsx']);
  const projectContextPath = findExistingRelPath(targetDir, ['context/PROJECT.md']);

  return {
    project_profile: projectProfile,
    projectContextPath,
    routeEntry,
    routeModulesDir,
    viewsDir,
    apiDir,
    apiTypesDir,
    mockDir,
    storeModulesDir,
    styleEntry,
    requestConfig,
    appEntry,
    mainEntry,
  };
}

function buildProjectContextGuidance(targetDir, projectProfile, runState = null, repoConventionsOverride = null) {
  const pkg = loadPackageManifest(targetDir);
  const facts = repoConventionsOverride || collectRepoConventions(targetDir, projectProfile);
  const routing = facts.routeEntry
    ? `${projectProfile === 'vue' ? 'vue-router' : 'router'} @ ${facts.routeEntry}${facts.routeModulesDir ? ` + ${facts.routeModulesDir}` : ''}`
    : '仓库未检测到显式路由入口';
  const stateManagement = facts.storeModulesDir
    ? `${projectProfile === 'vue' ? 'Pinia/store' : 'store'} @ ${facts.storeModulesDir}`
    : '未检测到全局状态目录';
  const apiLayer = facts.apiDir
    ? `${facts.apiDir}${facts.apiTypesDir ? ` + ${facts.apiTypesDir}` : ''}${facts.requestConfig ? `；请求入口 ${facts.requestConfig}` : ''}`
    : '未检测到 src/api 目录';
  const mockStrategy = facts.mockDir
    ? `mock 数据目录 ${facts.mockDir}`
    : '未检测到独立 mock 目录';

  return {
    framework: projectProfile === 'default' ? 'unknown' : projectProfile,
    language: detectProjectLanguage(targetDir, pkg),
    build_tool: detectBuildTool(pkg),
    package_manager: detectPackageManager(targetDir),
    delivery_profile: runState?.delivery_profile || null,
    artifact_profile: runState?.artifact_profile || null,
    routing,
    state_management: stateManagement,
    api_layer: apiLayer,
    mock_strategy: mockStrategy,
    style_system: facts.styleEntry ? `样式入口 ${facts.styleEntry}` : '未检测到显式样式入口',
    context_source: facts.projectContextPath || null,
  };
}

function inferRoutingStrategy(repoConventions, rawInput) {
  const text = String(rawInput || '');
  if (repoConventions.routeEntry) {
    return repoConventions.routeModulesDir
      ? `复用现有路由入口 ${repoConventions.routeEntry} 与模块目录 ${repoConventions.routeModulesDir}`
      : `复用现有路由入口 ${repoConventions.routeEntry}`;
  }
  if (/页面|列表|详情|欢迎|登录|路由|router|page/i.test(text)) {
    return '仓库未检测到显式路由入口；页面类任务需先补路由骨架或在 proposal/specs/design/tasks 中明确占位入口方案';
  }
  return '当前任务不强依赖新增路由，优先保持现有入口结构';
}

function inferApiStrategy(repoConventions, rawInput) {
  const text = String(rawInput || '');
  if (repoConventions.requestConfig) {
    return `复用请求入口 ${repoConventions.requestConfig}${repoConventions.apiDir ? `，并沿用 ${repoConventions.apiDir}` : ''} 进行模块拆分`;
  }
  if (repoConventions.apiDir) {
    return `沿用 ${repoConventions.apiDir}${repoConventions.apiTypesDir ? ` + ${repoConventions.apiTypesDir}` : ''} 进行接口与类型拆分`;
  }
  if (/接口|api|请求|分页|搜索|筛选|状态|重试|支付|订单|用户/i.test(text)) {
    return '仓库尚未检测到稳定 API 封装入口；真实接口任务需先建立请求层或在 proposal/specs/design/tasks 中明确占位方案';
  }
  return '当前任务不强依赖真实接口，优先保持最小数据流';
}

function inferMockStrategy(repoConventions, rawInput) {
  const text = String(rawInput || '');
  if (repoConventions.mockDir) {
    return /mock|演示|占位/i.test(text)
      ? `优先沿用 ${repoConventions.mockDir} 承载演示数据`
      : `${repoConventions.mockDir} 可作为 mock-first 兜底方案`;
  }
  if (/mock|演示|占位/i.test(text)) {
    return '仓库未检测到独立 mock 目录；若采用演示版，需要在 proposal/specs/design/tasks 中明确本地 mock 或页面内占位方案';
  }
  return '未显式声明 mock-first，按真实接口交付评估';
}

function inferStateStrategy(repoConventions) {
  if (repoConventions.storeModulesDir) {
    return `全局状态沿用 ${repoConventions.storeModulesDir}，避免重复造轮子`;
  }
  return '未检测到全局状态目录；优先本地状态，避免预建复杂 store';
}

function inferStyleStrategy(repoConventions) {
  if (repoConventions.styleEntry) {
    return `样式沿用 ${repoConventions.styleEntry} 与主题变量体系`;
  }
  return '仓库未检测到显式样式入口；需先确认主题变量与样式承载方式';
}

function inferRiskDrivers(rawInput, repoConventions) {
  const text = String(rawInput || '');
  const drivers = [];
  const patterns = [
    { pattern: /支付|收款|交易|退款|psp/i, label: '支付/交易域' },
    { pattern: /登录|认证|oauth|权限|短信|验证码|token/i, label: '认证/权限域' },
    { pattern: /安全|风控|合规|敏感|审计/i, label: '安全/风控/合规域' },
    { pattern: /先不说|暂未|未确定|待定|后续补/i, label: '关键约束尚未确认' },
  ];
  for (const item of patterns) {
    if (item.pattern.test(text)) {
      drivers.push(item.label);
    }
  }
  if (!repoConventions.routeEntry && /页面|列表|详情|欢迎|登录|路由|router|page/i.test(text)) {
    drivers.push('页面任务但仓库未检测到显式路由入口');
  }
  if (!repoConventions.requestConfig && !repoConventions.apiDir && /接口|api|请求|分页|搜索|筛选|状态|重试/i.test(text)) {
    drivers.push('接口任务但仓库未检测到稳定 API 封装入口');
  }
  return [...new Set(drivers)];
}

function parseArchivedChangeId(entryName) {
  const value = String(entryName || '').trim();
  const match = value.match(/^\d{4}-\d{2}-\d{2}-(.+)$/);
  return match ? match[1] : null;
}

function listOpenChangeCandidates(targetDir) {
  const changesDir = path.join(targetDir, 'openspec', 'changes');
  if (!fs.existsSync(changesDir)) {
    return [];
  }

  return fs.readdirSync(changesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'archive')
    .map((entry) => ({
      id: entry.name,
      rel_path: path.join('openspec', 'changes', entry.name),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function listArchivedChangeCandidates(targetDir) {
  const archiveDir = path.join(targetDir, 'openspec', 'changes', 'archive');
  if (!fs.existsSync(archiveDir)) {
    return [];
  }

  return fs.readdirSync(archiveDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      id: parseArchivedChangeId(entry.name),
      archive_entry: entry.name,
      rel_path: path.join('openspec', 'changes', 'archive', entry.name),
    }))
    .filter((item) => item.id)
    .sort((a, b) => b.archive_entry.localeCompare(a.archive_entry));
}

function findReferencedChangeCandidates(input, candidates) {
  const text = String(input || '').trim().toLowerCase();
  if (!text) {
    return [];
  }

  return candidates.filter((item) => {
    const id = String(item.id || '').toLowerCase();
    const archiveEntry = String(item.archive_entry || '').toLowerCase();
    return Boolean(id && text.includes(id)) || Boolean(archiveEntry && text.includes(archiveEntry));
  });
}

function looksLikeExplicitTraceInput(input) {
  return /留痕|归档|评审|spec|规范|openspec/i.test(String(input || ''));
}

function looksLikeScopeDeltaInput(input) {
  return /范围|方案|边界|验收口径|新增接口|字段调整|路由|流程|真实接口|跨模块|全局状态|store|联动|验证码|短信验证|短信校验|token|oauth|权限|双因子|二次验证|风控/i.test(String(input || ''));
}

function looksLikeLowRiskQuickFixInput(input) {
  const text = String(input || '');
  if (!text.trim()) {
    return false;
  }
  if (
    looksLikeExplicitTraceInput(text) ||
    looksLikeScopeDeltaInput(text) ||
    /新增接口|新增路由|新增状态|全局状态|权限|支付|风控|合规|真实接口|多页面|重构|架构|需求边界/i.test(text)
  ) {
    return false;
  }
  return /bug|修复|样式|微调|文案|按钮|标题|颜色|间距|布局|对齐|hover|小交互|交互调整|卡片布局|显示异常|报错/i.test(text);
}

function summarizeChangeCandidates(candidates) {
  return candidates.map((item) => ({
    change_id: item.id,
    rel_path: item.rel_path,
    archive_entry: item.archive_entry || null,
  }));
}

function inferStartRoutingDecision(targetDir, userInput) {
  const text = String(userInput || '').trim();
  const openCandidates = listOpenChangeCandidates(targetDir);
  const archivedCandidates = listArchivedChangeCandidates(targetDir);
  const referencedOpen = findReferencedChangeCandidates(text, openCandidates);
  const referencedArchived = findReferencedChangeCandidates(text, archivedCandidates);
  const archivedIntent = looksLikeFollowupPatchInput(text) || /上个归档|最近归档|已归档/.test(text);
  const traceRequired = looksLikeExplicitTraceInput(text);
  const quickFixEligible = looksLikeLowRiskQuickFixInput(text);
  const needsScopeDelta = looksLikeScopeDeltaInput(text);

  if (archivedIntent || referencedArchived.length > 0) {
    let selectedArchived = referencedArchived[0] || null;
    if (!selectedArchived && /上个归档|最近归档|已归档/.test(text)) {
      selectedArchived = archivedCandidates[0] || null;
    }
    return {
      change_context: 'archived-change',
      route_decision: 'followup-patch',
      trace_mode: 'followup-change',
      selected_flow: DEFAULT_FLOW_ID,
      reuse_change_id: null,
      parent_change_id: selectedArchived?.id || null,
      enter_openspec: true,
      next_expert: needsScopeDelta ? 'requirement-analyst' : 'frontend-implementer',
      reason: selectedArchived
        ? `检测到已归档变更 ${selectedArchived.id}，应新开 follow-up patch 并保留 parent_change_id。`
        : '输入明确指向已归档变更补丁，按 follow-up patch 新开修正链路。',
      candidate_changes: summarizeChangeCandidates(selectedArchived ? [selectedArchived] : archivedCandidates.slice(0, 3)),
      waiting_confirm_required: false,
    };
  }

  if (openCandidates.length > 0) {
    const selectedOpen = referencedOpen[0] || (openCandidates.length === 1 ? openCandidates[0] : null);
    if (!selectedOpen && openCandidates.length > 1) {
      return {
        change_context: 'open-change',
        route_decision: null,
        trace_mode: 'same-change',
        selected_flow: DEFAULT_FLOW_ID,
        reuse_change_id: null,
        parent_change_id: null,
        enter_openspec: true,
        next_expert: null,
        reason: '检测到多个未归档 change，但当前输入没有明确指向哪一个，不能自动猜测。',
        candidate_changes: summarizeChangeCandidates(openCandidates),
        waiting_confirm_required: true,
      };
    }

    if (selectedOpen) {
      const routeDecision = needsScopeDelta ? 'scope-delta' : 'patch';
      return {
        change_context: 'open-change',
        route_decision: routeDecision,
        trace_mode: 'same-change',
        selected_flow: DEFAULT_FLOW_ID,
        reuse_change_id: selectedOpen.id,
        parent_change_id: null,
        enter_openspec: true,
        next_expert: routeDecision === 'scope-delta' ? 'requirement-analyst' : 'frontend-implementer',
        reason: routeDecision === 'scope-delta'
          ? `检测到未归档 change ${selectedOpen.id}，且输入会影响范围/接口/验收边界，需回到 requirement-analyst 做增量修订。`
          : `检测到未归档 change ${selectedOpen.id}，当前输入属于同一 change 内的小修正，按 patch 最小吸收。`,
        candidate_changes: summarizeChangeCandidates([selectedOpen]),
        waiting_confirm_required: false,
      };
    }
  }

  if (quickFixEligible && !traceRequired) {
    return {
      change_context: 'no-change',
      route_decision: 'quick-fix',
      trace_mode: 'direct-fix',
      selected_flow: QUICK_FIX_FLOW_ID,
      reuse_change_id: null,
      parent_change_id: null,
      enter_openspec: false,
      next_expert: 'frontend-implementer',
      reason: '当前输入属于全新且低风险的小修正，适合直接进入轻量 bugfix-to-verification 路径。',
      candidate_changes: [],
      waiting_confirm_required: false,
    };
  }

  return {
    change_context: 'no-change',
    route_decision: 'full-change',
    trace_mode: 'full-openspec',
    selected_flow: DEFAULT_FLOW_ID,
    reuse_change_id: null,
    parent_change_id: null,
    enter_openspec: true,
    next_expert: null,
    reason: traceRequired
      ? '输入明确要求留痕/归档/spec，需进入完整 OpenSpec 主流程。'
      : '当前输入超出低风险快修边界，需进入 prd-to-delivery 完整链路。',
    candidate_changes: [],
    waiting_confirm_required: false,
  };
}

function buildRunRouteDecision(targetDir, runState, userInput, flowDefinition) {
  const text = userInput || runState?.trigger?.latest_user_input || runState?.trigger?.raw_input || '';
  const incremental = runState?.incremental_update || {};
  const status = String(runState?.status || '').trim().toLowerCase();
  const flowId = flowDefinition.id;
  const routeDecision = incremental.route_decision
    || runState?.task?.route_decision
    || (flowId === QUICK_FIX_FLOW_ID ? 'quick-fix' : 'full-change');
  const traceMode = incremental.trace_mode
    || runState?.task?.trace_mode
    || (flowId === QUICK_FIX_FLOW_ID ? 'direct-fix' : 'full-openspec');
  const changeContext = incremental.change_context
    || runState?.task?.change_context
    || (status === 'success' ? 'archived-change' : 'active-change');
  const parentChangeId = runState?.task?.parent_change_id || incremental.parent_change_id || null;
  const reuseChangeId = traceMode === 'same-change' || (flowId !== QUICK_FIX_FLOW_ID && !parentChangeId)
    ? runState?.task?.change_id || null
    : null;
  const nextExpert = incremental.target_role
    || runState?.current_role
    || runState?.plan?.first_handoff
    || flowDefinition.first_handoff;

  return {
    change_context: changeContext,
    route_decision: routeDecision,
    trace_mode: traceMode,
    selected_flow: flowId,
    reuse_change_id: reuseChangeId,
    parent_change_id: parentChangeId,
    enter_openspec: flowId !== QUICK_FIX_FLOW_ID,
    next_expert: nextExpert,
    reason: changeContext === 'active-change'
      ? '当前存在进行中的 run，补充输入按当前 run 的增量语义继续处理。'
      : changeContext === 'archived-change'
      ? '当前输入基于已结束或已归档结果继续补丁修正。'
      : `当前运行沿用 ${flowId} 的默认链路继续推进。`,
    candidate_changes: reuseChangeId
      ? summarizeChangeCandidates([{ id: reuseChangeId, rel_path: runState?.artifacts?.proposal ? path.dirname(runState.artifacts.proposal) : null }])
      : [],
    waiting_confirm_required: false,
    latest_input: text || null,
  };
}

function buildBugfixRouteContract() {
  return {
    allowed_as_quick_fix: [
      '单页面、单组件、单模块的 bug 修复',
      '样式微调、文案调整、小交互修正',
      '低风险且不需要长期 OpenSpec 沉淀的小改动',
    ],
    must_escalate_to_full_change: [
      '新增真实 API、路由、全局状态或跨模块联动',
      '需求边界、方案决策、验收口径发生变化',
      '涉及权限、支付、风控、合规或其他中高风险领域',
    ],
    prefer_same_change: [
      '当前存在 active/open change 且输入只是在当前范围内小修正时，优先复用原 change',
      '归档前修正继续走 archive-fix，已归档补修继续走 followup-patch',
    ],
    must_wait_confirm_when_multiple_open_changes: '同时存在多个 open change 且输入未明确目标时，必须进入 waiting-confirm，不得猜测。',
  };
}

function buildOrchestratorGuidance(targetDir, runState = null, userInput = null, routeDecisionOverride = null) {
  const selectedFlowId = routeDecisionOverride?.selected_flow || runState?.flow?.id || DEFAULT_FLOW_ID;
  const flowDefinition = loadFlowDefinition(targetDir, selectedFlowId);
  const projectProfile = detectProjectProfile(targetDir);
  const repoConventions = collectRepoConventions(targetDir, projectProfile);
  const rawInput = userInput || runState?.trigger?.latest_user_input || runState?.trigger?.raw_input || null;
  const routeDecision = routeDecisionOverride || (runState?.run_id
    ? buildRunRouteDecision(targetDir, runState, rawInput, flowDefinition)
    : inferStartRoutingDecision(targetDir, rawInput));
  const riskLevel = runState?.task?.risk_level || inferRiskLevel({
    rawInput,
    taskType: null,
    deliveryProfile: runState?.delivery_profile || null,
    flowId: selectedFlowId,
  });
  const deliveryProfile = runState?.delivery_profile || inferDeliveryProfile({
    rawInput,
    taskType: null,
    riskLevel,
    flowId: selectedFlowId,
  });
  const artifactProfile = runState?.artifact_profile || flowDefinition.artifact_profile || inferArtifactProfile({
    deliveryProfile,
  });
  const complexity = runState?.complexity || runState?.task?.complexity || inferComplexity({
    deliveryProfile,
    riskLevel,
  });
  const projectContextGuidance = buildProjectContextGuidance(targetDir, projectProfile, {
    ...(runState || {}),
    delivery_profile: deliveryProfile,
    artifact_profile: artifactProfile,
  });
  const roleRuleContract = buildRoleRuleContract(
    targetDir,
    'task-orchestrator',
    deliveryProfile,
    projectProfile,
    repoConventions,
  );
  const riskDrivers = inferRiskDrivers(rawInput, repoConventions);
  const activatedOptionalRoles = inferOptionalRoles(rawInput)
    .filter((roleId) => !Array.isArray(flowDefinition.optional_roles) || flowDefinition.optional_roles.includes(roleId));
  const skippedOptionalRoles = (flowDefinition.optional_roles || []).filter((roleId) => !activatedOptionalRoles.includes(roleId));
  const pendingGate = runState?.pending_gate || null;
  const runMode = normalizeRunMode(runState?.mode || routeDecisionOverride?.mode || null);
  const reviewPolicy = normalizeReviewPolicy(runState?.review_policy || routeDecisionOverride?.review_policy || null);
  const approvalGates = buildEffectiveApprovalGates(flowDefinition.id, runState?.plan?.approval_gates || flowDefinition.approval_gates, reviewPolicy);
  const handoffGatePolicy = buildEffectiveHandoffGatePolicy(flowDefinition.id, flowDefinition.handoff_gate_policy, reviewPolicy);
  const hasBeforeImplementationGate = approvalGates.includes('before-implementation');
  const expectedGate = pendingGate || (riskLevel === 'high' && hasBeforeImplementationGate ? 'before-implementation' : null);
  const resumeRole = expectedGate === 'before-implementation'
    ? inferApprovalResumeRoleFromFlow(targetDir, runState, flowDefinition)
    : null;
  const bugfixRouteContract = selectedFlowId === QUICK_FIX_FLOW_ID
    ? buildBugfixRouteContract()
    : null;

  return {
    project_context: projectContextGuidance,
    superpowers_contract: buildSuperpowersContract(targetDir, 'task-orchestrator'),
    repo_map_source: '.ai-spec/repo-map.json',
    repo_conventions: buildRepoConventionGuidance(repoConventions),
    role: buildRoleGuidance('task-orchestrator', deliveryProfile),
    role_rule_contract: roleRuleContract,
    routing_constraints: {
      selected_flow: flowDefinition.id,
      run_mode: runMode,
      review_policy: reviewPolicy,
      required_experts: flowDefinition.required_roles,
      activated_optional_roles: activatedOptionalRoles,
      skipped_optional_roles: skippedOptionalRoles,
      first_handoff: runState?.plan?.first_handoff || routeDecision?.next_expert || flowDefinition.first_handoff,
      route_strategy: inferRoutingStrategy(repoConventions, rawInput),
      api_strategy: inferApiStrategy(repoConventions, rawInput),
      mock_strategy: inferMockStrategy(repoConventions, rawInput),
      state_strategy: inferStateStrategy(repoConventions),
      style_strategy: inferStyleStrategy(repoConventions),
      route_bootstrap_required: Boolean(!repoConventions.routeEntry && /页面|列表|详情|欢迎|登录|路由|router|page/i.test(String(rawInput || ''))),
    },
    risk_contract: {
      risk_level: riskLevel,
      complexity,
      drivers: riskDrivers,
      before_implementation_gate: riskLevel === 'high' && hasBeforeImplementationGate ? 'before-implementation' : null,
      manual_confirmation_required: riskLevel === 'high' && hasBeforeImplementationGate,
      review_policy: reviewPolicy,
      escalation_rule: riskLevel === 'high' && hasBeforeImplementationGate
        ? '需求收敛后必须进入 before-implementation 审批门禁，再决定是否放行实现'
        : reviewPolicy === 'main-flow-blocking' && flowDefinition.id === DEFAULT_FLOW_ID
        ? '当前启用 main-flow-blocking 审核策略，主流程三个核心专家完成后都会进入人工审核门禁'
        : '按三专家协同自动推进，必要时仅在异常或门禁场景下阻断',
    },
    approval_contract: {
      gates: approvalGates,
      pending_gate: pendingGate,
      expected_gate: expectedGate,
      review_policy: reviewPolicy,
      required_when: [
        '支付、认证、权限、安全、风控、合规等高风险领域',
        '关键流程或约束仍未确认，继续实现会显著放大返工成本',
        '内测期启用 main-flow-blocking 时，主流程 requirement / frontend / guardian 完成后都需要人工审核',
      ],
      approve_resume_to_role: resumeRole,
      approval_examples: [
        '我同意按当前 proposal 的范围继续实现',
        '按演示版范围继续推进',
        '批准当前提案，继续到实现阶段',
      ],
    },
    orchestration_contract: {
      selected_flow: flowDefinition.id,
      run_mode: runMode,
      review_policy: reviewPolicy,
      delivery_profile: deliveryProfile,
      artifact_profile: artifactProfile,
      change_id: runState?.task?.change_id || routeDecision?.reuse_change_id || null,
      required_experts: flowDefinition.required_roles,
      required_artifacts: flowDefinition.required_artifacts,
      activated_optional_roles: activatedOptionalRoles,
      skipped_optional_roles: skippedOptionalRoles,
      assumptions_policy: [
        '仓库结构、项目规则和现有代码可推断的信息优先转成 assumptions',
        '只在高风险、不可逆或规则冲突时把缺口升级为审批或阻断',
      ],
      missing_inputs_policy: [
        '规范中已明确、仓库中已存在的事实不要重复标成 missing_inputs',
        '高风险且无法可靠推断的边界必须显式升级为审批点',
      ],
      handoff_policy: flowDefinition.handoff_policy,
      handoff_gate_policy: handoffGatePolicy,
      completion_policy: flowDefinition.completion_policy,
      repo_alignment: [
        repoConventions.viewsDir ? `页面目录优先对齐 ${repoConventions.viewsDir}` : '页面目录需先与仓库结构对齐',
        repoConventions.routeEntry ? `路由入口优先对齐 ${repoConventions.routeEntry}` : '未检测到路由入口时，页面任务需先明确骨架方案',
        repoConventions.apiDir ? `API 模块优先对齐 ${repoConventions.apiDir}` : '真实接口任务需先明确 API 承载方式',
        repoConventions.styleEntry ? `样式入口优先对齐 ${repoConventions.styleEntry}` : '样式承载方式需先明确',
      ],
    },
    route_decision: {
      identified_type: routeDecision?.change_context || null,
      change_context: routeDecision?.change_context || null,
      route_decision: routeDecision?.route_decision || null,
      trace_mode: routeDecision?.trace_mode || null,
      selected_flow: routeDecision?.selected_flow || flowDefinition.id,
      reuse_change_id: routeDecision?.reuse_change_id || null,
      parent_change_id: routeDecision?.parent_change_id || null,
      enter_openspec: routeDecision?.enter_openspec ?? (flowDefinition.id !== QUICK_FIX_FLOW_ID),
      next_expert: routeDecision?.next_expert || runState?.plan?.first_handoff || flowDefinition.first_handoff,
      candidate_changes: routeDecision?.candidate_changes || [],
      waiting_confirm_required: Boolean(routeDecision?.waiting_confirm_required),
      reason: routeDecision?.reason || null,
    },
    bugfix_route_contract: bugfixRouteContract,
    quick_fix_boundary: bugfixRouteContract?.allowed_as_quick_fix || null,
    upgrade_to_full_change_when: bugfixRouteContract?.must_escalate_to_full_change || null,
  };
}

function isParentRelPath(parentPath, childPath) {
  const normalizedParent = String(parentPath || '').replace(/\/+$/, '');
  const normalizedChild = String(childPath || '').replace(/\/+$/, '');
  if (!normalizedParent || !normalizedChild || normalizedParent === normalizedChild) {
    return false;
  }
  return normalizedChild.startsWith(`${normalizedParent}/`);
}

function buildCodeGuardianEvidenceRelPaths(repoConventions) {
  const prioritized = [
    repoConventions.routeEntry,
    repoConventions.routeModulesDir,
    repoConventions.apiDir || repoConventions.requestConfig,
    repoConventions.styleEntry,
    repoConventions.mockDir,
    repoConventions.storeModulesDir,
    repoConventions.viewsDir,
    repoConventions.mainEntry,
    repoConventions.appEntry,
  ].filter(Boolean);
  const deduped = [];

  for (const relPath of prioritized) {
    if (deduped.includes(relPath)) {
      continue;
    }
    const parentIndex = deduped.findIndex((existing) => isParentRelPath(relPath, existing));
    if (parentIndex >= 0) {
      deduped[parentIndex] = relPath;
      continue;
    }
    if (deduped.some((existing) => isParentRelPath(existing, relPath))) {
      continue;
    }
    deduped.push(relPath);
    if (deduped.length >= 4) {
      break;
    }
  }

  return deduped;
}

function buildCodeGuardianEvidenceTargets(targetDir, repoConventions) {
  const relPaths = buildCodeGuardianEvidenceRelPaths(repoConventions);

  return relPaths.map((relPath) => buildReadableTarget(targetDir, relPath, {
    label: `review evidence: ${relPath}`,
  }));
}

function buildVerificationExpectations(targetDir, projectContextGuidance) {
  const pkg = loadPackageManifest(targetDir);
  const scripts = pkg && typeof pkg.scripts === 'object' ? pkg.scripts : {};
  const packageManager = projectContextGuidance?.package_manager || detectPackageManager(targetDir);
  const commands = [];

  if (typeof scripts.typecheck === 'string') {
    commands.push(`${packageManager} run typecheck`);
  } else if (
    projectContextGuidance?.framework === 'vue' &&
    projectContextGuidance?.language === 'TypeScript'
  ) {
    commands.push(`${packageManager} exec vue-tsc --noEmit`);
  }

  if (typeof scripts.lint === 'string') {
    commands.push(`${packageManager} run lint`);
  }
  if (typeof scripts.test === 'string') {
    commands.push(`${packageManager} run test`);
  }
  if (typeof scripts.build === 'string') {
    commands.push(`${packageManager} run build`);
  }

  return [...new Set(commands)];
}

function dedupeTargets(targets) {
  const seen = new Set();
  const result = [];

  for (const item of targets) {
    const key = item.kind === 'symbolic'
      ? `symbolic:${item.value}`
      : `${item.kind}:${item.rel_path}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }

  return result;
}

function parseScalar(value) {
  const trimmed = value.trim();
  if (trimmed === '') {
    return '';
  }
  if (trimmed === '[]') {
    return [];
  }
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseFrontmatter(fileContent) {
  const lines = fileContent.split('\n');
  if (lines[0] !== '---') {
    return {};
  }

  const endIndex = lines.indexOf('---', 1);
  if (endIndex === -1) {
    return {};
  }

  const frontmatterLines = lines.slice(1, endIndex);
  const data = {};
  let currentKey = null;

  for (const line of frontmatterLines) {
    const listMatch = line.match(/^\s*-\s+(.*)$/);
    if (listMatch && currentKey) {
      if (!Array.isArray(data[currentKey])) {
        data[currentKey] = [];
      }
      data[currentKey].push(parseScalar(listMatch[1]));
      continue;
    }

    const keyMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!keyMatch) {
      currentKey = null;
      continue;
    }

    const [, key, rawValue] = keyMatch;
    if (rawValue.trim() === '') {
      data[key] = [];
      currentKey = key;
      continue;
    }

    data[key] = parseScalar(rawValue);
    currentKey = null;
  }

  return data;
}

function parseOpenSpecRules(fileContent) {
  const lines = fileContent.split('\n');
  const sections = {};
  let inRules = false;
  let currentSection = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '');

    if (!inRules) {
      if (line.trim() === 'rules:') {
        inRules = true;
      }
      continue;
    }

    if (/^[A-Za-z0-9_-]+:\s*$/.test(line)) {
      break;
    }

    const sectionMatch = line.match(/^  ([A-Za-z0-9_-]+):\s*$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      sections[currentSection] = [];
      continue;
    }

    const listMatch = line.match(/^    -\s+(.*)$/);
    if (listMatch && currentSection) {
      sections[currentSection].push(parseScalar(listMatch[1]));
      continue;
    }
  }

  return sections;
}

function loadRoleDefinition(targetDir, sourceRelPath) {
  if (!sourceRelPath) {
    return null;
  }

  const sourceTarget = buildReadableTarget(targetDir, sourceRelPath);
  if (!sourceTarget.exists) {
    return null;
  }

  const content = fs.readFileSync(sourceTarget.path, 'utf8');
  const frontmatter = parseFrontmatter(content);
  const roleId = frontmatter.id || null;
  const registryEntry = getRoleRuntimeConfig(targetDir, roleId);

  return {
    id: roleId,
    name: frontmatter.name || registryEntry?.name || null,
    source: sourceRelPath,
    preferred_skills: Array.isArray(frontmatter.preferred_skills)
      ? frontmatter.preferred_skills
      : Array.isArray(registryEntry?.preferred_skills)
      ? registryEntry.preferred_skills
      : [],
    reads: Array.isArray(frontmatter.reads) ? frontmatter.reads : [],
    writes: Array.isArray(frontmatter.writes) ? frontmatter.writes : [],
    handoff_to: Array.isArray(frontmatter.handoff_to)
      ? frontmatter.handoff_to
      : Array.isArray(registryEntry?.handoff_to)
      ? registryEntry.handoff_to
      : [],
  };
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item || '').trim()).filter(Boolean);
}

function normalizeFlowArtifactHints(values) {
  return normalizeStringArray(values).map((item) => {
    if (item.includes('/')) {
      return path.basename(item);
    }
    return item;
  });
}

function normalizeHandoffGatePolicy(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([pair, gate]) => [String(pair || '').trim(), String(gate || '').trim()])
      .filter(([pair, gate]) => pair && gate),
  );
}

function loadFlowDefinition(targetDir, flowId = DEFAULT_FLOW_ID) {
  const registryEntry = getFlowRuntimeConfig(targetDir, flowId) || {};
  const sourceRel = registryEntry.source || null;
  let frontmatter = {};

  if (sourceRel) {
    const sourceTarget = buildReadableTarget(targetDir, sourceRel);
    if (sourceTarget.exists) {
      frontmatter = parseFrontmatter(fs.readFileSync(sourceTarget.path, 'utf8'));
    }
  }

  const requiredRoles = normalizeStringArray(registryEntry.required_roles || frontmatter.required_roles);
  const optionalRoles = normalizeStringArray(registryEntry.optional_roles || frontmatter.optional_roles);
  const approvalGates = normalizeStringArray(registryEntry.approval_gates || frontmatter.approval_gates);
  const requiredArtifacts = normalizeFlowArtifactHints(
    registryEntry.required_artifacts ||
    registryEntry.core_artifacts ||
    frontmatter.artifacts,
  );
  const resolvedRequiredRoles = requiredRoles.length > 0
    ? requiredRoles
    : DEFAULT_FLOW_CONSTRAINTS.required_roles;
  const resolvedApprovalGates = approvalGates.length > 0
    ? approvalGates
    : DEFAULT_FLOW_CONSTRAINTS.approval_gates;
  const resolvedRequiredArtifacts = requiredArtifacts.length > 0
    ? requiredArtifacts
    : DEFAULT_FLOW_CONSTRAINTS.required_artifacts;
  const firstHandoff = registryEntry.first_handoff || resolvedRequiredRoles[0] || null;
  const handoffGatePolicy = {
    ...DEFAULT_HANDOFF_GATE_POLICY,
    ...normalizeHandoffGatePolicy(frontmatter.handoff_gates || frontmatter.handoff_gate_policy),
    ...normalizeHandoffGatePolicy(registryEntry.handoff_gates || registryEntry.handoff_gate_policy),
  };

  return {
    id: flowId,
    name: registryEntry.name || frontmatter.name || flowId,
    source: sourceRel || null,
    default_schema: registryEntry.default_schema || null,
    artifact_profile: registryEntry.artifact_profile || null,
    required_roles: resolvedRequiredRoles,
    optional_roles: optionalRoles,
    approval_gates: resolvedApprovalGates,
    required_artifacts: resolvedRequiredArtifacts,
    first_handoff: firstHandoff,
    handoff_policy: registryEntry.handoff_policy || `task-orchestrator -> ${resolvedRequiredRoles.join(' -> ')} -> terminal`,
    handoff_gate_policy: handoffGatePolicy,
    completion_policy: registryEntry.completion_policy || `${resolvedRequiredArtifacts.join(', ')} 缺一不可`,
  };
}

function resolveRoleOpenSpecSections(targetDir, roleId) {
  const registryEntry = getRoleRuntimeConfig(targetDir, roleId);
  const configured = normalizeStringArray(registryEntry?.openspec_rule_sections);
  if (configured.length > 0) {
    return configured;
  }
  return FALLBACK_ROLE_OPENSPEC_RULE_SECTIONS[roleId] || [];
}

function resolveNextRole(targetDir, flowId, roleId, roleDefinition = null) {
  const transition = getRuntimeTransition(targetDir, flowId, roleId);
  if (transition?.action === 'gate-blocked' && transition?.next_role) {
    return transition.next_role;
  }
  if (transition?.to_role) {
    return transition.to_role;
  }
  return roleDefinition?.handoff_to?.[0] || null;
}

function inferApprovalResumeRoleFromFlow(targetDir, runState, flowDefinition) {
  const currentRole = runState?.current_role || flowDefinition.first_handoff || null;
  if (!currentRole) {
    return null;
  }

  const anchorNextRole = runState?.anchor?.stage?.next_role || null;
  if (anchorNextRole) {
    return anchorNextRole;
  }

  return resolveNextRole(targetDir, flowDefinition.id, currentRole, null);
}

function inferPendingGateResumeRole(targetDir, runState, flowDefinition, pendingGate) {
  if (pendingGate === 'before-implementation') {
    return inferApprovalResumeRoleFromFlow(targetDir, runState, flowDefinition);
  }

  if (pendingGate === 'before-guardian') {
    const currentRole = runState?.current_role || null;
    if (currentRole) {
      return resolveNextRole(targetDir, flowDefinition.id, currentRole, null) || runState?.anchor?.stage?.next_role || null;
    }
  }

  if (pendingGate === 'before-archive') {
    const currentRole = runState?.current_role || null;
    if (currentRole) {
      return resolveNextRole(targetDir, flowDefinition.id, currentRole, null) || runState?.anchor?.stage?.next_role || null;
    }
  }

  return runState?.anchor?.stage?.next_role || runState?.current_role || null;
}

function inferOptionalRoles(rawInput) {
  const text = String(rawInput || '');
  const roles = [];

  if (/设计稿|还原|高保真|视觉|交互稿|像素级|好看|好看的|漂亮|美观|高级感|精致|视觉升级|更有设计感|更精致|更有质感|更现代|更高级|优化视觉|优化\s*ui|改漂亮点|ui/i.test(text)) {
    roles.push('design-collaborator');
  }
  if (/接口|api|字段|契约|mock|联调|分页|筛选|搜索|状态切换|重试/i.test(text)) {
    roles.push('api-contract-specialist');
  }
  if (/测试|回归|断言|单元测试|vitest|store|pinia|zustand|工具函数|边界逻辑|临界|回归风险/i.test(text)) {
    roles.push('unit-test-specialist');
  }
  if (/验收|验证|校验|截图|比对|review|复核|复审|多人确认/i.test(text)) {
    roles.push('verification-reviewer');
  }
  if (/性能|首屏|卡顿|lcp|cls|inp|大列表|虚拟滚动|掉帧|滚动|动画|渲染慢|性能退化/i.test(text)) {
    roles.push('performance-auditor');
  }

  return [...new Set(roles)];
}

function inferChangeImpactTargetRole(currentRole, changeImpact, latestInput) {
  if (changeImpact === 'archive-fix') {
    const text = String(latestInput || '');
    if (/验收|风险|阻断|审查|检查|结论/i.test(text)) {
      return 'code-guardian';
    }
    if (/范围|方案|边界|需求|接口字段|设计|详情联动/i.test(text)) {
      return 'requirement-analyst';
    }
    return 'frontend-implementer';
  }

  if (changeImpact === 'scope-delta') {
    return 'requirement-analyst';
  }

  if (changeImpact === 'patch') {
    if (currentRole === 'code-guardian') {
      return 'frontend-implementer';
    }
    return currentRole || 'frontend-implementer';
  }

  return null;
}

function inferArtifactsToUpdate(changeImpact) {
  switch (changeImpact) {
    case 'scope-delta':
      return ['proposal.md', 'specs/', 'design.md', 'tasks.md', 'checklist.md', 'iterations.md'];
    case 'archive-fix':
      return ['tasks.md', 'design.md', 'checklist.md', 'iterations.md', 'code'];
    case 'followup-patch':
      return ['proposal.md', 'specs/', 'design.md', 'tasks.md', 'checklist.md', 'iterations.md', 'code'];
    case 'patch':
      return ['tasks.md', 'design.md', 'checklist.md', 'iterations.md', 'code'];
    case 're-scope':
      return ['proposal.md', 'specs/', 'design.md', 'tasks.md'];
    default:
      return [];
  }
}

function describeApprovalGate(pendingGate, resumeRole) {
  if (pendingGate === 'before-archive') {
    return {
      blockedReason: '当前交付检查已完成，是否归档尚未得到你的明确决定，流程先停在归档确认门禁。',
      requiredUserAction: '明确告诉系统是否执行归档；同意则进入归档专家，不归档则直接结束本次运行。',
      blockedRule: '在你明确选择之前，禁止合并增量规范或移动 change 目录。',
      resumeRule: `若你同意归档，先记录归档意见，再恢复到 ${resumeRole || '归档专家'}；若你选择暂不归档，则直接结束当前运行。`,
      nextOutput: `收到明确归档意见后，再决定是恢复到 ${resumeRole || '归档专家'} 还是直接结束当前运行`,
    };
  }

  if (pendingGate === 'before-guardian') {
    return {
      blockedReason: '当前实现已完成，但在进入守护审查前需要人工确认是否按当前实现结果继续。',
      requiredUserAction: '明确批准当前实现结果进入 code-guardian（规范守护专家）审查，或说明需要回退修正的方向。',
      blockedRule: '在人工确认前，禁止继续推进到 code-guardian 或归档阶段。',
      resumeRule: `收到明确批准意见后，先执行 turn.commands.update 记录审批说明，再恢复到 ${resumeRole || 'code-guardian（规范守护专家）'}。`,
      nextOutput: `收到明确批准意见后，再恢复到 ${resumeRole || 'code-guardian（规范守护专家）'} 继续审查`,
    };
  }

  return {
    blockedReason: '当前需求收敛已完成，但在进入实现前仍需人工确认范围、限制条件或内测审核意见。',
    requiredUserAction: '明确批准或拒绝当前 proposal / tasks 的实现范围与限制条件',
    blockedRule: '在人工确认前，禁止继续实现或调用 protocol-advance 推进到下一专家',
    resumeRule: `收到明确批准意见后，先执行 turn.commands.update 记录审批说明，再由用户重新执行 /spec-continue 恢复到 ${resumeRole || '下一位专家'}`,
    nextOutput: `收到明确批准意见后，先记录审批说明，再让用户重新执行 /spec-continue 恢复到 ${resumeRole || '下一位专家'}`,
  };
}

function loadOpenSpecRuleSections(targetDir) {
  const candidateTargets = [
    buildReadableTarget(targetDir, 'openspec/config.yaml'),
    buildReadableTarget(targetDir, 'openspec/config.yaml.template'),
  ];

  for (const target of candidateTargets) {
    if (!target.exists) {
      continue;
    }

    const content = fs.readFileSync(target.path, 'utf8');
    return {
      source: target.rel_path,
      sections: parseOpenSpecRules(content),
    };
  }

  return {
    source: null,
    sections: {},
  };
}

function resolveTemplateVariables(value, context) {
  if (typeof value !== 'string') {
    return value;
  }

  return value
    .replace(/<change-id>/g, context.changeId || '__missing_change_id__')
    .replace(/<run-id>/g, context.runId || '__missing_run_id__');
}

function convertTargetSpec(targetDir, rawValue, context, options = {}) {
  const resolvedValue = resolveTemplateVariables(rawValue, context);
  if (resolvedValue === 'code' || resolvedValue === 'implementation-notes') {
    return buildSymbolicTarget(resolvedValue, options);
  }
  return buildFileTarget(targetDir, resolvedValue, options);
}

function buildCommandTargets(targetDir, relPaths) {
  return relPaths.map((relPath) => buildReadableTarget(targetDir, relPath, { required: true }));
}

function loadCurrentArtifacts(targetDir, runtimePaths = resolveRuntimePaths(targetDir)) {
  return {
    run: readJsonIfExists(runtimePaths.currentRun.path),
    dispatch: readJsonIfExists(getExistingPath(runtimePaths.currentDispatch)),
    execution: readJsonIfExists(getExistingPath(runtimePaths.currentExecutionJson)),
  };
}

function createWorkflowSnapshot(targetDir, options = {}) {
  const runtimePaths = options.runtimePaths || resolveRuntimePaths(targetDir);
  const currentArtifacts = options.currentArtifacts || loadCurrentArtifacts(targetDir, runtimePaths);
  const status = options.status || runner.buildStatus(targetDir);
  const projectProfile = options.projectProfile || detectProjectProfile(targetDir);
  const repoConventions = options.repoConventions || collectRepoConventions(targetDir, projectProfile);
  const flowDefinitions = new Map();

  return {
    targetDir,
    runtimePaths,
    currentArtifacts,
    status,
    projectProfile,
    repoConventions,
    flowDefinitions,
  };
}

function getSnapshotFlowDefinition(snapshot, flowId) {
  const resolvedFlowId = flowId || DEFAULT_FLOW_ID;
  if (!snapshot.flowDefinitions.has(resolvedFlowId)) {
    snapshot.flowDefinitions.set(
      resolvedFlowId,
      loadFlowDefinition(snapshot.targetDir, resolvedFlowId),
    );
  }
  return snapshot.flowDefinitions.get(resolvedFlowId);
}

function buildSummary(status, runState = null, targetDir = null) {
  const superpowersState = targetDir ? loadSuperpowersState(targetDir) : null;
  return {
    run_id: status.current.run_id || null,
    run_status: status.current.run_status || null,
    current_role: status.current.current_role || null,
    pending_gate: status.current.pending_gate || null,
    run_mode: runState?.mode || null,
    review_policy: runState?.review_policy || null,
    next_expected_producer: status.next_expected.producer || null,
    delivery_profile: runState?.delivery_profile || null,
    artifact_profile: runState?.artifact_profile || null,
    complexity: runState?.complexity || runState?.task?.complexity || null,
    pending_input_update: Boolean(runState?.pending_input_update),
    input_update_count: Array.isArray(runState?.input_updates) ? runState.input_updates.length : 0,
    change_context: runState?.incremental_update?.change_context || runState?.task?.change_context || null,
    route_decision: runState?.incremental_update?.route_decision || runState?.task?.route_decision || null,
    trace_mode: runState?.incremental_update?.trace_mode || runState?.task?.trace_mode || null,
    change_impact: runState?.incremental_update?.change_impact || runState?.task?.change_impact || null,
    reconcile_strategy: runState?.incremental_update?.reconcile_strategy || null,
    parent_change_id: runState?.task?.parent_change_id || runState?.incremental_update?.parent_change_id || null,
    auto_fix_active: Boolean(runState?.auto_fix?.active),
    auto_fix_attempts: Number(runState?.auto_fix?.attempts) || 0,
    superpowers_mode: superpowersState?.mode || 'off',
    superpowers_fallback_reason: superpowersState?.last_fallback_reason || null,
  };
}

function trimArtifactExcerpt(content, maxChars = 500) {
  const normalized = String(content || '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line, index, array) => !(line === '' && array[index - 1] === ''))
    .join('\n')
    .trim();
  if (!normalized) {
    return null;
  }
  return normalized.length > maxChars ? `${normalized.slice(0, maxChars)}...` : normalized;
}

function listMarkdownFilesRecursive(rootPath) {
  if (!rootPath || !fs.existsSync(rootPath)) {
    return [];
  }

  const rootStat = fs.statSync(rootPath);
  if (!rootStat.isDirectory()) {
    return rootPath.endsWith('.md') ? [rootPath] : [];
  }

  const files = [];
  const stack = [rootPath];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const nextPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(nextPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(nextPath);
      }
    }
  }

  return files.sort();
}

function readArtifactExcerpt(targetDir, relPath, options = {}) {
  if (!relPath) {
    return null;
  }

  const absolutePath = path.join(targetDir, relPath);
  if (!fs.existsSync(absolutePath)) {
    return null;
  }

  const maxFiles = options.maxFiles || 2;
  const maxChars = options.maxChars || 500;
  const files = listMarkdownFilesRecursive(absolutePath).slice(0, maxFiles);
  if (files.length === 0) {
    return null;
  }

  const content = files
    .map((filePath) => {
      const relative = path.relative(targetDir, filePath);
      const raw = fs.readFileSync(filePath, 'utf8');
      const excerpt = trimArtifactExcerpt(raw, Math.floor(maxChars / Math.max(files.length, 1)));
      return excerpt ? `## ${relative}\n${excerpt}` : null;
    })
    .filter(Boolean)
    .join('\n\n');

  return trimArtifactExcerpt(content, maxChars);
}

function buildFrontendAutoFixContract(targetDir, runState) {
  const autoFix = runState?.auto_fix;
  if (!autoFix?.active) {
    return null;
  }

  return {
    active: true,
    attempts: Number(autoFix.attempts) || 0,
    max_attempts: Number(autoFix.max_attempts) || 1,
    failed_steps: Array.isArray(autoFix.last_failed_steps) ? autoFix.last_failed_steps : [],
    repair_scope: [
      '只修复 verification 失败步骤对应的问题，不新增功能',
      '只允许修改本轮已变更文件或与失败直接相关的最小文件集',
      '不要顺手重构、不要补新的 OpenSpec 任务',
    ],
    context_fragments: {
      tasks: readArtifactExcerpt(targetDir, runState?.artifacts?.tasks, { maxFiles: 1, maxChars: 420 }),
      design: readArtifactExcerpt(targetDir, runState?.artifacts?.design, { maxFiles: 1, maxChars: 420 }),
      specs: readArtifactExcerpt(targetDir, runState?.artifacts?.specs, { maxFiles: 2, maxChars: 520 }),
    },
  };
}

function shellQuote(value) {
  return `'${String(value || '').replace(/'/g, `'\\''`)}'`;
}

function buildProtocolCommands(userInput = null) {
  const advance = './node_modules/.bin/ai-spec-auto protocol-advance --target . --json';
  const step = userInput
    ? `./node_modules/.bin/ai-spec-auto protocol-step --target . --user-input ${shellQuote(userInput)} --json`
    : './node_modules/.bin/ai-spec-auto protocol-step --target . --json';
  const update = userInput
    ? `./node_modules/.bin/ai-spec-auto protocol-update --target . --user-input ${shellQuote(userInput)} --json`
    : './node_modules/.bin/ai-spec-auto protocol-update --target . --user-input "<补充需求>" --json';
  const stop = './node_modules/.bin/ai-spec-auto protocol-stop --target . --json';
  const status = './node_modules/.bin/ai-spec-auto protocol-status --target . --json';

  return {
    step,
    advance,
    update,
    stop,
    status,
  };
}

function buildRoleCurrentCommand(turn) {
  const actorId = turn.actor?.id || null;
  if (actorId !== 'archive-change') {
    return null;
  }
  if (turn.guidance?.archive_preflight && turn.guidance.archive_preflight.ready === false) {
    return null;
  }

  const changeId = turn.input?.change_id || null;
  if (!changeId) {
    return './node_modules/.bin/ai-spec-auto archive-change --target . --complete-run --json';
  }

  return `./node_modules/.bin/ai-spec-auto archive-change --target . --change-id ${shellQuote(changeId)} --complete-run --json`;
}

function attachProtocolContracts(turn, options = {}) {
  const commands = buildProtocolCommands(options.userInput || turn.input?.latest_user_input || turn.input?.user_request || null);
  commands.current = turn.mode === 'start'
    ? commands.step
    : turn.mode === 'update-review'
    ? commands.update
    : turn.mode === 'paused'
    ? commands.advance
    : commands.advance;
  const actorId = turn.actor?.id || null;
  const currentCommand = buildRoleCurrentCommand(turn);
  const currentCommandFinalizesRun = actorId === 'archive-change' && Boolean(currentCommand);
  const requiresAdvance = turn.status === 'ready' && !currentCommandFinalizesRun;
  const deliveryProfile = turn.summary?.delivery_profile || turn.input?.delivery_profile || null;
  const compactUserReport = deliveryProfile === 'micro';
  const allowCodeWrite = actorId === 'frontend-implementer';
  const forbiddenSkills = allowCodeWrite
    ? []
    : ['create-view', 'create-component', 'theme-variables', 'create-route', 'create-api', 'create-store', 'execute-task'];

  const standardUserReportContract = {
    style: 'standard-concise',
    max_lines: 8,
    required_sections: ['交付结论', '验证结果', '残留风险'],
    optional_sections: ['下一步'],
    max_bullets_per_section: 1,
    preferred_sentence_count: 4,
    forbidden_items: [
      '协议推进细节（如 protocol-step / protocol-advance / protocol-update / approve）',
      'scratch JSON、current-run/current-dispatch/current-execution 等运行态文件名',
      '逐条罗列 OpenSpec 文件名',
      '逐条罗列 created/updated 文件清单',
      '过细的实现结构描述或组件内部实现细节',
      '无必要的绝对/相对文件路径',
      'proposal.md / spec.md / tasks.md / checklist.md / iterations.md 等文件名',
      'terminal / success / waiting-approval 等运行态状态词',
      '阶段说明（语义）式回放或逐角色完成播报',
      '对内说明、内部注释或实现者自述',
      '默认附加本地执行提示（如 pnpm dev、浏览器打开路径等）',
    ],
  };

  return {
    ...turn,
    commands,
    enforcement: {
      execute_current_command_first: Boolean(currentCommand),
      current_command: currentCommand,
      current_command_already_executed: !currentCommand,
      current_command_finalizes_run: currentCommandFinalizesRun,
      entry_command: commands.current,
      allowed_actor: actorId,
      auto_continue_same_session: true,
      must_consume_returned_turn: true,
      no_natural_language_handoff: true,
      announce_before_work: turn.announcements?.enter || null,
      announce_after_work: turn.announcements?.exit || null,
      allow_code_write: allowCodeWrite,
      forbidden_before_current_command: currentCommand
        ? ['不要手工执行 mkdir/cp/mv 合并或迁移归档目录']
        : [],
      forbidden_skills: forbiddenSkills,
    },
    requires_advance: requiresAdvance,
    finalize_contract: turn.status === 'ready'
      ? {
          required: !currentCommandFinalizesRun,
          advance_command: currentCommandFinalizesRun ? null : commands.advance,
          update_command: commands.update,
          when: currentCommandFinalizesRun
            ? '当前 current_command 会直接完成归档与运行收尾；命令成功后不要再写 expert-execution 或执行 advance。'
            : '完成当前轮次的所有 writes 后，必须先执行 advance，再对用户汇报',
          continue_rule: currentCommandFinalizesRun
            ? 'current_command 成功后直接读取 current-run.json 或命令返回结果确认终态，再输出最终摘要；不要补写 runtime-state complete，不要恢复目录，不要额外执行 step/advance'
            : 'advance 返回后，直接消费返回结果中的 turn；不要 sleep、tail、timeout、cat 日志或重复执行 step/advance',
          current_command_terminal: currentCommandFinalizesRun,
          user_report: compactUserReport
            ? '微型任务最终摘要改为三句式：交付结论、验证结果、残留风险，各一句；不要写文件路径、实现结构细节、命令名或任何内部协议词。'
            : '标准任务最终摘要保持简洁：只保留关键结果、验证结果、残留风险，必要时补一句下一步；不要写协议细节、文件路径、内部文件名或运行态状态词。',
          user_report_contract: compactUserReport
            ? {
                style: 'compact',
                max_lines: 5,
                required_sections: ['交付结论', '验证结果', '残留风险'],
                one_sentence_per_section: true,
                max_bullets_per_section: 1,
                preferred_sentence_count: 3,
                forbidden_items: [
                  '重复转述 checklist.md 内容',
                  '重复转述 iterations.md 内容',
                  '逐条罗列 created/updated 文件',
                  '逐条罗列 OpenSpec 文件名',
                  'proposal.md / spec.md / tasks.md / checklist.md / iterations.md 等文件名',
                  '任何文件路径',
                  'terminal / success / waiting-approval 等运行态状态词',
                  '组件/页面内部实现结构细节',
                  '具体命令名或协议推进细节',
                  '阶段说明（语义）式回放或逐角色完成播报',
                  '默认附加本地执行提示（如 pnpm dev、浏览器打开路径等）',
                ],
              }
            : standardUserReportContract,
        }
      : null,
  };
}

function buildSkillGuidance(skills) {
  if (!Array.isArray(skills)) {
    return [];
  }

  return skills
    .filter((item) => item && typeof item === 'object' && item.id)
    .map((item) => ({
      id: item.id,
      guidance: SKILL_GUIDANCE[item.id] || null,
    }));
}

function selectRoleSkills(targetDir, roleId, skills, deliveryProfile) {
  if (!Array.isArray(skills)) {
    return [];
  }

  if (deliveryProfile !== 'micro') {
    return skills;
  }

  const allowlist = resolveRoleMicroSkillAllowlist(targetDir, roleId);
  if (!Array.isArray(allowlist) || allowlist.length === 0) {
    return skills;
  }

  return skills.filter((item) => {
    const skillId = item?.id || item;
    if (skillId === 'using-superpowers') {
      return true;
    }
    return allowlist.includes(skillId);
  });
}

function getSourceCandidates(entry, projectProfile, fallbackConfig = null) {
  const configured = entry && typeof entry === 'object'
    ? (entry.sourceByProfile?.[projectProfile] || entry.source || null)
    : null;
  if (configured) {
    return [configured];
  }

  const config = fallbackConfig;
  if (!config) {
    return [];
  }
  return config[projectProfile] || config.default || [];
}

function resolveRoleRuleIds(targetDir, roleId, projectProfile) {
  const configured = getRoleRuleIds(targetDir, roleId, projectProfile);
  if (configured.length > 0) {
    return configured;
  }
  return FALLBACK_ROLE_RULE_IDS[roleId] || [];
}

function resolveRoleRuleConstraintProfiles(targetDir, roleId, projectProfile) {
  const registryEntry = getRoleRuntimeConfig(targetDir, roleId) || {};
  const configuredProfiles = registryEntry.rule_contract_profiles && typeof registryEntry.rule_contract_profiles === 'object'
    ? registryEntry.rule_contract_profiles
    : {};
  const fallbackProfiles = FALLBACK_ROLE_RULE_CONSTRAINT_PROFILES;

  const configuredDefault = configuredProfiles.default && typeof configuredProfiles.default === 'object'
    ? configuredProfiles.default
    : {};
  const configuredScoped = configuredProfiles[projectProfile] && typeof configuredProfiles[projectProfile] === 'object'
    ? configuredProfiles[projectProfile]
    : {};
  const fallbackDefault = fallbackProfiles.default?.[roleId] || {};
  const fallbackScoped = fallbackProfiles[projectProfile]?.[roleId] || {};

  return {
    default: {
      must_follow: normalizeStringArray(
        configuredDefault.must_follow !== undefined ? configuredDefault.must_follow : fallbackDefault.must_follow,
      ),
      blocked_when: normalizeStringArray(
        configuredDefault.blocked_when !== undefined ? configuredDefault.blocked_when : fallbackDefault.blocked_when,
      ),
    },
    scoped: {
      must_follow: normalizeStringArray(
        configuredScoped.must_follow !== undefined ? configuredScoped.must_follow : fallbackScoped.must_follow,
      ),
      blocked_when: normalizeStringArray(
        configuredScoped.blocked_when !== undefined ? configuredScoped.blocked_when : fallbackScoped.blocked_when,
      ),
    },
  };
}

function buildRoleRuleContract(targetDir, roleId, deliveryProfile, projectProfile, repoConventions) {
  const ruleIds = resolveRoleRuleIds(targetDir, roleId, projectProfile);
  const sourceRules = ruleIds
    .map((ruleId) => {
      const target = buildReadableTargetFromCandidates(
        targetDir,
        getSourceCandidates(
          getRuleRuntimeConfig(targetDir, ruleId),
          projectProfile,
          FALLBACK_RULE_SOURCE_CANDIDATES[ruleId],
        ),
        {
        required: true,
        label: `${roleId} rule: ${ruleId}`,
      },
      );
      if (!target) {
        return null;
      }
      return {
        id: ruleId,
        path: target.rel_path,
        target,
        focus: ruleId,
      };
    })
    .filter(Boolean);

  const resolvedConstraintProfiles = resolveRoleRuleConstraintProfiles(targetDir, roleId, projectProfile);
  const scopedConstraints = resolvedConstraintProfiles.scoped;
  const fallbackConstraints = resolvedConstraintProfiles.default;
  const mustFollow = [
    ...(fallbackConstraints.must_follow || []),
    ...(scopedConstraints.must_follow || []),
  ];
  const blockedWhen = [
    ...(fallbackConstraints.blocked_when || []),
    ...(scopedConstraints.blocked_when || []),
  ];
  const fallbackRepoSpecific = ROLE_RULE_REPO_SPECIFIC.default?.[roleId] || {};
  const scopedRepoSpecific = ROLE_RULE_REPO_SPECIFIC[projectProfile]?.[roleId] || {};
  const repoSpecific = [
    ...((typeof fallbackRepoSpecific.repo_specific === 'function' ? fallbackRepoSpecific.repo_specific(repoConventions) : fallbackRepoSpecific.repo_specific) || []),
    ...((typeof scopedRepoSpecific.repo_specific === 'function' ? scopedRepoSpecific.repo_specific(repoConventions) : scopedRepoSpecific.repo_specific) || []),
  ].filter(Boolean);

  return {
    source_rules: sourceRules.map((item) => ({
      id: item.id,
      path: item.path,
      focus: item.focus,
    })),
    read_targets: sourceRules.map((item) => item.target),
    must_follow: mustFollow,
    repo_specific: repoSpecific,
    blocked_when: blockedWhen,
    profile: projectProfile,
    delivery_profile: deliveryProfile,
  };
}

function buildSkillTarget(targetDir, skillId, projectProfile) {
  const candidates = getSourceCandidates(
    getSkillRuntimeConfig(targetDir, skillId),
    projectProfile,
    FALLBACK_SKILL_SOURCE_CANDIDATES[skillId],
  );
  if (candidates.length === 0) {
    return null;
  }
  return buildReadableTargetFromCandidates(targetDir, candidates, {
    required: true,
    label: `skill: ${skillId}`,
  });
}

function normalizeSkillIds(skills) {
  if (!Array.isArray(skills)) {
    return [];
  }
  return skills
    .map((item) => (typeof item === 'string' ? item : item?.id))
    .filter(Boolean);
}

function resolveRoleSkillPriority(targetDir, roleId, projectProfile, selectedSkills) {
  const configured = getRoleSkillPriority(targetDir, roleId, projectProfile);
  const normalizedSelected = normalizeSkillIds(selectedSkills);
  if (configured.length > 0) {
    if (normalizedSelected.includes('using-superpowers') && !configured.includes('using-superpowers')) {
      return ['using-superpowers', ...configured];
    }
    return configured;
  }
  if (normalizedSelected.length > 0) {
    return normalizedSelected;
  }
  return FALLBACK_ROLE_SKILL_PRIORITY[roleId] || [];
}

function injectSuperpowersSkills(targetDir, roleId, selectedSkills) {
  const contract = buildSuperpowersContract(targetDir, roleId);
  const normalized = normalizeSkillIds(selectedSkills);
  if (!contract.enabled || !contract.allowed_roles.includes(roleId)) {
    return normalized;
  }
  return ['using-superpowers', ...normalized.filter((item) => item !== 'using-superpowers')];
}

function resolveRoleMicroSkillAllowlist(targetDir, roleId) {
  const registryEntry = getRoleRuntimeConfig(targetDir, roleId);
  const configured = normalizeStringArray(registryEntry?.micro_skill_allowlist);
  if (configured.length > 0) {
    return configured;
  }
  return MICRO_ROLE_SKILL_ALLOWLIST[roleId] || [];
}

function readTextIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return '';
  }
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (_error) {
    return '';
  }
}

function detectTaskIntentSignals(rawText) {
  const text = String(rawText || '');
  return {
    page: /页面|page|view|screen|路由|route|首页|欢迎页|登录页|报表页|详情页|列表页/i.test(text),
    component: /组件|component|按钮|表单|卡片|弹窗|drawer|dialog|modal/i.test(text),
    api: /接口封装|数据层|接口|api|请求|字段|联调|分页|筛选|搜索|契约|支付|订单/i.test(text),
    store: /store|状态|pinia|zustand|redux|全局状态/i.test(text),
    style: /样式|主题|颜色|视觉|还原|design|ui|scss|css/i.test(text),
  };
}

function collectChangeArtifactIntentText(targetDir, changeId, currentRun) {
  const candidates = [];
  const artifactBase = changeId ? path.join(targetDir, 'openspec', 'changes', changeId) : null;

  if (artifactBase) {
    candidates.push(
      path.join(artifactBase, 'proposal.md'),
      path.join(artifactBase, 'design.md'),
      path.join(artifactBase, 'tasks.md'),
    );
  }

  if (currentRun?.artifacts && typeof currentRun.artifacts === 'object') {
    for (const key of ['proposal', 'design', 'tasks']) {
      if (typeof currentRun.artifacts[key] === 'string') {
        candidates.push(path.join(targetDir, currentRun.artifacts[key]));
      }
    }
  }

  return [...new Set(candidates)]
    .map((filePath) => readTextIfExists(filePath))
    .filter(Boolean)
    .join('\n');
}

function choosePrimarySkillIds(targetDir, roleId, projectProfile, selectedSkills, repoConventions, userRequest = null, currentRun = null, changeId = null) {
  const ordered = resolveRoleSkillPriority(targetDir, roleId, projectProfile, selectedSkills);
  const selected = new Set(normalizeSkillIds(selectedSkills));
  const requestSignals = detectTaskIntentSignals(userRequest);
  const artifactSignals = roleId === 'frontend-implementer'
    ? detectTaskIntentSignals(collectChangeArtifactIntentText(targetDir, changeId, currentRun))
    : { page: false, component: false, api: false, store: false, style: false };
  const explicitApiFocus = roleId === 'frontend-implementer'
    && requestSignals.api
    && !requestSignals.page
    && !requestSignals.component
    && !requestSignals.store
    && !requestSignals.style;
  const explicitStoreFocus = roleId === 'frontend-implementer'
    && requestSignals.store
    && !requestSignals.page
    && !requestSignals.component
    && !requestSignals.api
    && !requestSignals.style;

  if (explicitApiFocus) {
    return ordered.filter((skillId) => selected.has(skillId) && skillId === 'create-api').slice(0, 1);
  }

  if (explicitStoreFocus) {
    return ordered.filter((skillId) => selected.has(skillId) && skillId === 'create-store').slice(0, 1);
  }

  const pageIntent = requestSignals.page || (!requestSignals.api && artifactSignals.page);
  const componentIntent = requestSignals.component || (!requestSignals.api && artifactSignals.component);
  const apiIntent = requestSignals.api || (!requestSignals.page && !requestSignals.component && artifactSignals.api);
  const storeIntent = requestSignals.store || (!requestSignals.api && artifactSignals.store);
  const styleIntent = requestSignals.style || (!requestSignals.api && artifactSignals.style);

  return ordered.filter((skillId) => {
    if (!selected.has(skillId)) {
      return false;
    }
    if (skillId === 'create-view') {
      return pageIntent || Boolean(repoConventions.viewsDir && !apiIntent && !storeIntent && !componentIntent);
    }
    if (skillId === 'create-component') {
      return componentIntent;
    }
    if (skillId === 'create-route') {
      return pageIntent;
    }
    if (skillId === 'create-api') {
      return apiIntent || Boolean(
        (repoConventions.apiDir || repoConventions.requestConfig)
        && !pageIntent
        && !componentIntent
        && !storeIntent
        && !styleIntent,
      );
    }
    if (skillId === 'create-store') {
      return storeIntent;
    }
    if (skillId === 'theme-variables') {
      return styleIntent || pageIntent || componentIntent;
    }
    return true;
  }).slice(0, roleId === 'frontend-implementer' ? 4 : 3);
}

function buildRoleSkillContract(targetDir, roleId, selectedSkills, deliveryProfile, projectProfile, repoConventions, userRequest = null, currentRun = null, changeId = null) {
  const normalized = normalizeSkillIds(selectedSkills);
  const primaryIds = choosePrimarySkillIds(targetDir, roleId, projectProfile, selectedSkills, repoConventions, userRequest, currentRun, changeId);
  const targetIds = primaryIds.length > 0 ? primaryIds : normalized.slice(0, roleId === 'frontend-implementer' ? 4 : 3);
  const readTargets = targetIds
    .map((id) => buildSkillTarget(targetDir, id, projectProfile))
    .filter(Boolean);

  return {
    selected: normalized.map((id) => {
      const target = buildSkillTarget(targetDir, id, projectProfile);
      return {
        id,
        path: target?.rel_path || null,
        purpose: SKILL_GUIDANCE[id] || null,
        mode: targetIds.includes(id) ? 'primary' : 'secondary',
      };
    }),
    primary_skills: targetIds,
    read_targets: readTargets,
    execution_order: targetIds,
    delivery_profile: deliveryProfile,
    note: '优先按 primary_skills 的顺序阅读并调用技能；其余技能仅在当前实现范围明确需要时再展开。',
  };
}

function buildRuleHints(roleId, deliveryProfile, roleRuleContract = null) {
  const hints = Array.isArray(roleRuleContract?.source_rules)
    ? roleRuleContract.source_rules.map((item) => path.basename(item.path))
    : [];
  if (deliveryProfile === 'micro') {
    return hints.slice(0, 3);
  }
  return hints;
}

function buildOpenSpecGuidance(targetDir, roleId, deliveryProfile, flowId = DEFAULT_FLOW_ID) {
  if (flowId === QUICK_FIX_FLOW_ID) {
    return {
      enabled: false,
      source: null,
      profile: inferArtifactProfile({
        deliveryProfile,
      }),
      sections: [],
      reason: '当前流程为 bugfix-to-verification，直接使用 .ai-spec/history/<run-id>/ 轻量留痕，不读取 OpenSpec 章节约束。',
    };
  }

  const config = loadOpenSpecRuleSections(targetDir);
  const sectionNames = resolveRoleOpenSpecSections(targetDir, roleId);
  const artifactProfile = inferArtifactProfile({
    deliveryProfile,
  });

  return {
    source: config.source,
    profile: artifactProfile,
    sections: sectionNames
      .filter((name) => Array.isArray(config.sections[name]) && config.sections[name].length > 0)
      .map((name) => ({
        name,
        profile: artifactProfile,
        source_rule_count: config.sections[name].length,
        rules: deliveryProfile === 'micro'
          ? MICRO_OPENSPEC_RULES[name] || config.sections[name].slice(0, 3)
          : config.sections[name],
      })),
  };
}

function buildRepoConventionGuidance(repoConventions) {
  return {
    project_context: repoConventions.projectContextPath || null,
    app_entry: repoConventions.appEntry || null,
    main_entry: repoConventions.mainEntry || null,
    views_dir: repoConventions.viewsDir || null,
    route_entry: repoConventions.routeEntry || null,
    route_modules_dir: repoConventions.routeModulesDir || null,
    api_dir: repoConventions.apiDir || null,
    api_types_dir: repoConventions.apiTypesDir || null,
    request_config: repoConventions.requestConfig || null,
    mock_dir: repoConventions.mockDir || null,
    store_modules_dir: repoConventions.storeModulesDir || null,
    style_entry: repoConventions.styleEntry || null,
  };
}

function buildArtifactContract(roleId, roleRuleContract, roleSkillContract, flowId = DEFAULT_FLOW_ID) {
  const ruleIds = Array.isArray(roleRuleContract?.source_rules)
    ? roleRuleContract.source_rules.map((item) => item.id)
    : [];
  const primarySkills = Array.isArray(roleSkillContract?.primary_skills) ? roleSkillContract.primary_skills : [];

  if (flowId === QUICK_FIX_FLOW_ID && roleId === 'frontend-implementer') {
    return [
      {
        artifact: 'code',
        required_rules: ruleIds.filter((id) => ['project-structure', 'component-standard', 'route-standard', 'api-standard', 'store-standard', 'style-standard'].includes(id)),
        preferred_skills: primarySkills,
        done_when: '只完成当前 bug/样式/文案/小交互修复，不新增真实 API、路由、全局状态或超范围功能。',
      },
      {
        artifact: 'bugfix.md',
        required_rules: ruleIds.filter((id) => ['project-overview', 'project-structure'].includes(id)),
        preferred_skills: primarySkills,
        done_when: '问题现象、期望结果、影响范围、复现线索和限制条件已写清，可支撑后续复查。',
      },
      {
        artifact: 'implementation-notes.md',
        required_rules: ruleIds.filter((id) => ['style-standard', 'audit-report-standard'].includes(id)),
        preferred_skills: primarySkills.filter((id) => ['execute-task'].includes(id)),
        done_when: '已记录修复动作、验证结果、残留风险和是否需要升级到完整 OpenSpec。'
      },
    ];
  }

  if (flowId === QUICK_FIX_FLOW_ID && roleId === 'code-guardian') {
    return [
      {
        artifact: 'checklist.md',
        required_rules: ruleIds.filter((id) => ['api-standard', 'route-standard', 'style-standard', 'test-standard', 'audit-report-standard'].includes(id)),
        preferred_skills: primarySkills.filter((id) => ['ui-verification', 'web-design-guidelines', 'create-test'].includes(id)),
        done_when: '已区分通过 / 未通过 / 阻断项 / 证据 / 是否放行，并明确是否仍可保持 quick-fix 范围。'
      },
      {
        artifact: 'iterations.md',
        required_rules: ruleIds.filter((id) => ['test-standard', 'audit-report-standard'].includes(id)),
        preferred_skills: primarySkills.filter((id) => ['create-test', 'ui-verification'].includes(id)),
        done_when: '已沉淀本轮问题、修正动作、残留风险和下轮提醒，可作为后续 patch 继续依据。'
      },
    ];
  }

  if (flowId === QUICK_FIX_FLOW_ID && roleId === 'unit-test-specialist') {
    return [
      {
        artifact: 'unit-test-suggestions',
        required_rules: ruleIds.filter((id) => ['coding-standard', 'test-standard', 'audit-report-standard'].includes(id)),
        preferred_skills: primarySkills.filter((id) => ['create-test'].includes(id)),
        done_when: '已明确哪些逻辑必须补测、哪些只需记录风险，并说明测试落点与断言重点。',
      },
    ];
  }

  if (flowId === QUICK_FIX_FLOW_ID && roleId === 'verification-reviewer') {
    return [
      {
        artifact: 'verification-review-notes',
        required_rules: ruleIds.filter((id) => ['style-standard', 'test-standard', 'audit-report-standard'].includes(id)),
        preferred_skills: primarySkills.filter((id) => ['ui-verification', 'web-design-guidelines'].includes(id)),
        done_when: '已基于 bugfix、实现说明和守护证据补强验收结论，不重新定义需求边界。',
      },
      {
        artifact: 'acceptance-risks',
        required_rules: ruleIds.filter((id) => ['audit-report-standard'].includes(id)),
        preferred_skills: primarySkills.filter((id) => ['ui-verification', 'web-design-guidelines'].includes(id)),
        done_when: '已明确仍需补充的验证项、残留风险以及是否需要升级到完整 OpenSpec。',
      },
    ];
  }

  if (flowId === QUICK_FIX_FLOW_ID && roleId === 'performance-auditor') {
    return [
      {
        artifact: 'performance-audit-notes',
        required_rules: ruleIds.filter((id) => ['coding-standard', 'style-standard', 'audit-report-standard'].includes(id)),
        preferred_skills: primarySkills,
        done_when: '已说明问题属于首屏、运行时还是资源层，并把现象与证据对应起来。',
      },
      {
        artifact: 'priority-suggestions',
        required_rules: ruleIds.filter((id) => ['audit-report-standard'].includes(id)),
        preferred_skills: primarySkills,
        done_when: '已给出最值得优先处理的优化顺序，并说明哪些情况应升级为完整变更。',
      },
    ];
  }

  if (roleId === 'requirement-analyst') {
    return [
      {
        artifact: 'proposal.md',
        required_rules: ruleIds.filter((id) => ['project-overview', 'project-structure'].includes(id)),
        preferred_skills: primarySkills.filter((id) => ['create-proposal'].includes(id)),
        done_when: '目标、范围、非目标、默认假设和风险已写清，且与当前仓库定位一致。',
      },
      {
        artifact: 'specs/',
        required_rules: ruleIds.filter((id) => ['api-standard', 'route-standard', 'style-standard'].includes(id)),
        preferred_skills: primarySkills.filter((id) => ['create-proposal', 'design-analysis'].includes(id)),
        done_when: '每个增量 spec 都能回指接口、路由或样式约束，并至少包含一个可验证场景。',
      },
      {
        artifact: 'design.md',
        required_rules: ruleIds.filter((id) => ['project-structure', 'component-standard', 'route-standard', 'api-standard', 'style-standard'].includes(id)),
        preferred_skills: primarySkills.filter((id) => ['create-proposal', 'design-analysis'].includes(id)),
        done_when: '页面、组件、路由、API、mock、状态和样式落点都已对齐到当前仓库结构。',
      },
      {
        artifact: 'tasks.md',
        required_rules: ruleIds.filter((id) => ['project-structure', 'api-standard', 'route-standard', 'style-standard'].includes(id)),
        preferred_skills: primarySkills.filter((id) => ['create-proposal'].includes(id)),
        done_when: '关键规则约束已转成可执行任务项，且待确认项已区分阻断与默认假设。',
      },
    ];
  }

  if (roleId === 'frontend-implementer') {
    return [
      {
        artifact: 'code',
        required_rules: ruleIds.filter((id) => ['project-structure', 'component-standard', 'route-standard', 'api-standard', 'store-standard', 'style-standard'].includes(id)),
        preferred_skills: primarySkills,
        done_when: '代码落点符合项目目录与路由/API/状态/样式规范，且未超出 tasks 范围。',
      },
      {
        artifact: 'implementation-notes',
        required_rules: ruleIds.filter((id) => ['project-structure', 'style-standard', 'audit-report-standard'].includes(id)),
        preferred_skills: primarySkills.filter((id) => ['execute-task'].includes(id)),
        done_when: '说明已记录主技能选择、验证结果、残留风险和未完成项，不以笼统措辞代替。',
      },
    ];
  }

  if (roleId === 'code-guardian') {
    return [
      {
        artifact: 'checklist.md',
        required_rules: ruleIds.filter((id) => ['api-standard', 'route-standard', 'style-standard', 'test-standard', 'audit-report-standard'].includes(id)),
        preferred_skills: primarySkills.filter((id) => ['ui-verification', 'web-design-guidelines', 'create-test'].includes(id)),
        done_when: '通过项、未通过项、阻断项、证据和是否放行结论都已明确，不存在模糊建议。',
      },
      {
        artifact: 'iterations.md',
        required_rules: ruleIds.filter((id) => ['test-standard', 'audit-report-standard'].includes(id)),
        preferred_skills: primarySkills.filter((id) => ['create-test', 'ui-verification'].includes(id)),
        done_when: '本轮问题、修正动作、残留风险和下轮提醒已沉淀，可支撑 patch/follow-up 继续推进。',
      },
    ];
  }

  if (roleId === 'archive-change') {
    return [
      {
        artifact: 'openspec/specs/',
        required_rules: ruleIds,
        preferred_skills: primarySkills.filter((id) => ['archive-change'].includes(id)),
        done_when: '增量 spec 已合并到 openspec/specs/，且没有覆盖既有规范。',
      },
      {
        artifact: 'openspec/changes/archive/',
        required_rules: ruleIds,
        preferred_skills: primarySkills.filter((id) => ['archive-change'].includes(id)),
        done_when: '当前 change 已迁移到 YYYY-MM-DD-change-id 归档目录并保持产物可追溯。',
      },
      {
        artifact: 'archive-summary',
        required_rules: ruleIds.filter((id) => ['audit-report-standard'].includes(id)),
        preferred_skills: primarySkills.filter((id) => ['archive-change'].includes(id)),
        done_when: '摘要已写清合并的 spec、归档目录、残留风险和后续 patch 应回退的阶段。',
      },
    ];
  }

  return [];
}

function buildSkillSelectionPolicy(roleId, roleSkillContract, flowId = DEFAULT_FLOW_ID) {
  const primaryOrder = Array.isArray(roleSkillContract?.primary_skills) ? roleSkillContract.primary_skills : [];
  const ruleFirst = '当项目规则、repo_conventions 与 skill 示例冲突时，以规则与仓库事实为准，skill 只负责给出执行方法。';

  if (roleId === 'requirement-analyst') {
    return {
      primary_order: primaryOrder,
      use_when: [
        { when: '生成 proposal/specs/design/tasks', skills: ['create-proposal'] },
        { when: '输入包含设计稿、视觉还原或复杂交互', skills: ['design-analysis'] },
      ],
      fallback_rule: ruleFirst,
    };
  }

  if (roleId === 'frontend-implementer') {
    return {
      primary_order: primaryOrder,
      use_when: [
        { when: '页面任务', skills: ['create-view', 'create-route', 'theme-variables'] },
        { when: '组件任务', skills: ['create-component', 'theme-variables'] },
        { when: '接口任务', skills: ['create-api'] },
        { when: '状态任务', skills: ['create-store'] },
        { when: '混合任务或多步实现', skills: ['execute-task'] },
      ],
      fallback_rule: ruleFirst,
    };
  }

  if (roleId === 'code-guardian') {
    return {
      primary_order: primaryOrder,
      use_when: [
        { when: '页面或 UI 验收任务', skills: ['ui-verification'] },
        { when: '交互、体验或设计规范检查', skills: ['web-design-guidelines'] },
        { when: '工具函数、store、复杂逻辑存在回归风险或需补测', skills: ['create-test'] },
      ],
      fallback_rule: '先依据 rules 生成检查项，再决定是否启用对应 skill 补证据或补测试建议。',
    };
  }

  if (roleId === 'unit-test-specialist') {
    return {
      primary_order: primaryOrder,
      use_when: [
        { when: flowId === QUICK_FIX_FLOW_ID ? 'quick-fix 涉及 store、工具函数、边界逻辑或明显回归风险' : '工具函数、store、复杂逻辑存在回归风险', skills: ['create-test'] },
      ],
      fallback_rule: flowId === QUICK_FIX_FLOW_ID
        ? '先基于 bugfix.md 与 implementation-notes.md 判断是否必须补测，再决定是补测试建议还是要求升级流程。'
        : '先判断哪些逻辑必须被测试保护，再决定是否启用 create-test。',
    };
  }

  if (roleId === 'verification-reviewer') {
    return {
      primary_order: primaryOrder,
      use_when: [
        { when: '页面/UI 需要实核或补强验收证据', skills: ['ui-verification'] },
        { when: '交互、体验或设计规范需要复核', skills: ['web-design-guidelines'] },
      ],
      fallback_rule: flowId === QUICK_FIX_FLOW_ID
        ? 'quick-fix 下优先读取 bugfix.md、implementation-notes.md 与 checklist.md（若已存在），只补强验收证据，不重新定义需求。'
        : ruleFirst,
    };
  }

  if (roleId === 'performance-auditor') {
    return {
      primary_order: primaryOrder,
      use_when: [],
      fallback_rule: flowId === QUICK_FIX_FLOW_ID
        ? '当前没有专门性能 skill 时，先依据现象描述、实现说明和相关代码给出轻量审计结论；若问题超出小修正边界，直接建议升级主流程。'
        : '当前没有专门性能 skill 时，优先依据规则、实现说明和性能现象给出证据化优先级建议。',
    };
  }

  if (roleId === 'archive-change') {
    return {
      primary_order: primaryOrder,
      use_when: [
        { when: 'before-archive 已批准且 archive_preflight 全部通过', skills: ['archive-change'] },
      ],
      fallback_rule: '优先执行 archive-change 内置命令；除非命令不可用，不得以手工目录操作替代。',
    };
  }

  return {
    primary_order: primaryOrder,
    use_when: [],
    fallback_rule: ruleFirst,
  };
}

function buildHandoffChecklist(roleId, repoConventions, flowId = DEFAULT_FLOW_ID) {
  if (flowId === QUICK_FIX_FLOW_ID && roleId === 'frontend-implementer') {
    return [
      '修复范围仍限定在单页面、单组件或单模块的小改动，没有偷偷升级成新需求。',
      '未新增真实 API、路由、全局状态、权限/支付/合规逻辑；若已越界，必须显式升级到 prd-to-delivery。',
      'bugfix.md 与 implementation-notes.md 已同步，能够说明问题、修复动作与残留风险。',
    ];
  }

  if (flowId === QUICK_FIX_FLOW_ID && roleId === 'code-guardian') {
    return [
      'checklist.md 已区分通过 / 未通过 / 阻断项 / 证据 / 是否放行。',
      'iterations.md 已记录问题、修正动作、残留风险和下轮提醒。',
      '若发现需求已越出 quick-fix 边界，已明确阻断并要求升级到完整 OpenSpec 主流程。',
    ];
  }

  if (flowId === QUICK_FIX_FLOW_ID && roleId === 'unit-test-specialist') {
    return [
      '已基于 bugfix.md、implementation-notes.md 和相关代码判断是否必须补测。',
      '若仅给测试建议，已写清不立即补测的风险和优先级。',
      '若发现问题已超出 quick-fix 边界，已提醒 code-guardian 或 task-orchestrator 升级主流程。',
    ];
  }

  if (flowId === QUICK_FIX_FLOW_ID && roleId === 'verification-reviewer') {
    return [
      '已基于 bugfix.md、implementation-notes.md 和 checklist.md（若存在）补强验收证据。',
      '没有把轻量复核重新扩写成需求澄清或方案重定义。',
      '若验证证据仍不足，已明确指出缺口与残留风险。',
    ];
  }

  if (flowId === QUICK_FIX_FLOW_ID && roleId === 'performance-auditor') {
    return [
      '已明确性能问题属于首屏、运行时或资源层中的哪一类。',
      '已给出轻量优先级建议，而不是泛化罗列所有性能优化项。',
      '若问题需要架构级改造或跨模块重构，已明确建议升级到完整变更流程。',
    ];
  }

  if (roleId === 'requirement-analyst') {
    return [
      '页面、路由、API、mock、状态和样式落点已写入 design.md 或 tasks.md。',
      '真实接口与 mock-first 边界已写清，未把未确认契约伪装成已定事实。',
      '待确认项已区分阻断问题还是默认假设，必要时保留 before-implementation 门禁。',
    ];
  }

  if (roleId === 'frontend-implementer') {
    return [
      repoConventions.viewsDir ? `目录落点已对齐 ${repoConventions.viewsDir} 等项目结构。` : '目录落点已对齐当前项目结构约定。',
      repoConventions.routeModulesDir ? `路由已落在 ${repoConventions.routeModulesDir} 并保持懒加载和 meta 约束。` : '若涉及路由，已按项目要求处理懒加载和 meta。',
      repoConventions.apiDir ? `页面或组件未直接调 request，接口已经由 ${repoConventions.apiDir} 封装。` : '页面或组件未直接调 request，接口封装方式已保持一致。',
      '样式已使用主题变量和作用域样式，不存在硬编码颜色或全局污染。',
      '未新增超范围功能、顺手重构或与本任务无关的扩改。',
    ];
  }

  if (roleId === 'code-guardian') {
    return [
      'checklist.md 已区分通过 / 未通过 / 阻断项 / 证据 / 是否放行。',
      'iterations.md 已记录问题、修正动作、残留风险和下轮提醒。',
      '若存在阻断项，已明确回退到 frontend-implementer 或保留门禁，不用模糊建议放行。',
    ];
  }

  if (roleId === 'archive-change') {
    return [
      'archive_preflight 已全部通过，缺失项已补齐。',
      '归档命令执行后将直接结束运行，不再补写 execution 或重复推进协议。',
      '归档摘要需覆盖 spec 合并结果、归档路径、残留风险和后续 patch 回退阶段。',
    ];
  }

  return [];
}

function buildOptionalRoleTriggers(roleId, flowId = DEFAULT_FLOW_ID) {
  if (roleId === 'requirement-analyst') {
    return [
      { role_id: 'design-collaborator', use_when: '输入包含设计稿、视觉还原、像素级交互、复杂 UI 约束，或明确要求页面更好看、漂亮、美观、有高级感、更有设计感、更有质感、更现代、更高级、优化视觉/优化 UI/改漂亮点时，需要先把设计歧义收口。' },
      { role_id: 'api-contract-specialist', use_when: '涉及接口字段、联调、mock/真实接口边界或契约不稳定，需要先补接口约束。' },
    ];
  }

  if (roleId === 'frontend-implementer') {
    if (flowId === QUICK_FIX_FLOW_ID) {
      return [
        { role_id: 'unit-test-specialist', use_when: 'quick-fix 涉及 store、工具函数、边界逻辑修复，或明显存在回归风险，需要补最小测试策略。' },
        { role_id: 'performance-auditor', use_when: 'quick-fix 明确命中列表卡顿、首屏慢、动画/滚动掉帧或用户直接反馈性能退化。' },
      ];
    }
    return [
      { role_id: 'unit-test-specialist', use_when: '改动涉及 store、复杂逻辑、关键回归路径，且现有测试不足以覆盖风险。' },
      { role_id: 'performance-auditor', use_when: '页面存在大列表、首屏卡顿、性能指标退化或明确性能目标。' },
    ];
  }

  if (roleId === 'code-guardian') {
    if (flowId === QUICK_FIX_FLOW_ID) {
      return [
        { role_id: 'verification-reviewer', use_when: '轻流程需要更强验收证据、多人复核或现有 history 产物不足以支撑放行。' },
        { role_id: 'unit-test-specialist', use_when: '守护阶段识别出 store、工具函数、边界逻辑修复或明显回归风险，需要补最小测试建议。' },
        { role_id: 'performance-auditor', use_when: '守护阶段识别出首屏慢、列表卡顿、动画/滚动掉帧等性能症状，需要补轻量性能结论。' },
      ];
    }
    return [
      { role_id: 'verification-reviewer', use_when: '交付需要更强验收证据、多人协作确认或现有验证口径不完整。' },
      { role_id: 'unit-test-specialist', use_when: '规则检查命中工具函数、store 或复杂逻辑未补测，需补充测试策略。' },
      { role_id: 'performance-auditor', use_when: '守护阶段识别出明确性能风险，需要在归档前补性能审计结论。' },
    ];
  }

  return [];
}

function buildArchivePreflight(targetDir, changeId, currentRun) {
  if (!changeId) {
    return {
      ready: false,
      summary: '缺少 change_id，无法执行归档 preflight。',
      missing_artifacts: ['change_id'],
      items: [],
    };
  }

  const artifactBase = path.join('openspec', 'changes', changeId);
  const hasFrontendDelivery = Boolean(currentRun?.verification)
    || Boolean(currentRun?.current_role === 'archive-change' || currentRun?.current_role === 'code-guardian');
  const items = [
    { artifact: 'proposal.md', rel_path: path.join(artifactBase, 'proposal.md'), ready: fs.existsSync(path.join(targetDir, artifactBase, 'proposal.md')), source_stage: 'requirement-analyst' },
    { artifact: 'specs/', rel_path: path.join(artifactBase, 'specs'), ready: fs.existsSync(path.join(targetDir, artifactBase, 'specs')), source_stage: 'requirement-analyst' },
    { artifact: 'design.md', rel_path: path.join(artifactBase, 'design.md'), ready: fs.existsSync(path.join(targetDir, artifactBase, 'design.md')), source_stage: 'requirement-analyst' },
    { artifact: 'tasks.md', rel_path: path.join(artifactBase, 'tasks.md'), ready: fs.existsSync(path.join(targetDir, artifactBase, 'tasks.md')), source_stage: 'requirement-analyst' },
    { artifact: 'code', rel_path: null, ready: hasFrontendDelivery, source_stage: 'frontend-implementer' },
    { artifact: 'implementation-notes', rel_path: null, ready: hasFrontendDelivery, source_stage: 'frontend-implementer' },
    { artifact: 'checklist.md', rel_path: path.join(artifactBase, 'checklist.md'), ready: fs.existsSync(path.join(targetDir, artifactBase, 'checklist.md')), source_stage: 'code-guardian' },
    { artifact: 'iterations.md', rel_path: path.join(artifactBase, 'iterations.md'), ready: fs.existsSync(path.join(targetDir, artifactBase, 'iterations.md')), source_stage: 'code-guardian' },
  ];
  const missingArtifacts = items.filter((item) => !item.ready).map((item) => item.artifact);

  return {
    ready: missingArtifacts.length === 0,
    summary: missingArtifacts.length === 0
      ? 'proposal/specs/design/tasks/code/implementation-notes/checklist/iterations 已齐备，可以执行归档命令。'
      : `仍缺少 ${missingArtifacts.join('、')}，当前不允许执行归档命令。`,
    missing_artifacts: missingArtifacts,
    items,
  };
}

function buildRoleSpecificContract(
  roleId,
  roleRuleContract,
  roleSkillContract,
  repoConventions,
  deliveryProfile,
  flowId = DEFAULT_FLOW_ID,
  targetDir = null,
  projectContextGuidance = null,
  currentRun = null,
  changeId = null,
) {
  const base = {
    delivery_profile: deliveryProfile,
    primary_skills: roleSkillContract.primary_skills,
    required_rules: roleRuleContract.source_rules.map((item) => item.path),
    repo_alignment: roleRuleContract.repo_specific,
    artifact_contract: buildArtifactContract(roleId, roleRuleContract, roleSkillContract, flowId),
    skill_selection_policy: buildSkillSelectionPolicy(roleId, roleSkillContract, flowId),
    handoff_checklist: buildHandoffChecklist(roleId, repoConventions, flowId),
    optional_role_triggers: buildOptionalRoleTriggers(roleId, flowId),
  };

  if (flowId === QUICK_FIX_FLOW_ID && roleId === 'frontend-implementer') {
    return {
      ...base,
      summary: '按用户输入与 bugfix.md 完成最小修复，不创建新的 OpenSpec change，不擅自扩大需求边界。',
      bugfix_route_contract: buildBugfixRouteContract(),
      quick_fix_boundary: [
        '只允许处理单页面、单组件、单模块中的 bug、样式、文案、小交互修复',
        '输出固定为 code + bugfix.md + implementation-notes.md',
        '优先按规则判断仍属小修正，再选最小 skill 路径实现',
      ],
      upgrade_to_full_change_when: [
        '需要新增真实 API、路由、全局状态',
        '需要改动需求边界、接口边界或验收口径',
        '涉及权限、支付、风控、合规或其他中高风险逻辑',
      ],
      expected_outputs: ['code', 'bugfix.md', 'implementation-notes.md'],
      implementation_focus: [
        '优先修复单页面、单组件或单模块中的 bug、样式、文案、小交互问题',
        repoConventions.viewsDir ? `页面落点继续对齐 ${repoConventions.viewsDir}` : '页面落点继续对齐现有项目结构',
        repoConventions.styleEntry ? `样式继续沿用 ${repoConventions.styleEntry} 与主题变量体系` : '样式继续沿用现有主题变量与作用域样式',
      ],
      implementation_constraints: [
        '不得顺手新增真实 API、路由、全局状态、权限、支付、风控、合规逻辑。',
        '若修复过程中发现需要改动范围/接口/验收口径，必须停止快修并升级到 prd-to-delivery。',
        '必须把问题现象与修复动作写回 .ai-spec/history/<run-id>/bugfix.md 和 implementation-notes.md。',
      ],
    };
  }

  if (flowId === QUICK_FIX_FLOW_ID && roleId === 'code-guardian') {
    const verificationExpectations = targetDir
      ? buildVerificationExpectations(targetDir, projectContextGuidance)
      : [];
    return {
      ...base,
      summary: '基于 bugfix.md、implementation-notes.md、代码与验证结果做轻量放行判断；越界时阻断并要求升级主流程。',
      bugfix_route_contract: buildBugfixRouteContract(),
      quick_fix_boundary: [
        '仍按低风险小需求守门，不把轻流程当作跳过验证的捷径',
        '只对当前修复范围给结论，不顺势扩写需求或方案',
        'history 产物和验证证据不足时不能放行',
      ],
      upgrade_to_full_change_when: [
        '守护阶段发现新增 API、路由、store 或跨模块范围扩张',
        '验收口径或需求边界已经变化，需要回到 requirement-analyst',
        '残留风险已超出 quick-fix 可接受范围',
      ],
      bugfix_blocking_checks: [
        '是否仍属于低风险小需求',
        '是否偷偷新增 API、路由、store',
        '是否改变验收口径或需求范围',
        '是否需要升级回完整 OpenSpec 主流程',
      ],
      review_focus: [
        '修复是否仍限定在低风险小需求边界内',
        '代码落点、样式变量、路由/API 约束是否仍符合仓库规范',
        'bugfix.md 与 implementation-notes.md 是否能支撑后续复查',
      ],
      blocking_checks: [
        '是否新增真实 API、路由、全局状态、权限/支付/风控/合规逻辑；若是，立即阻断 quick-fix。',
        '是否出现跨模块范围扩张、验收口径变化或需要补 proposal/specs/design/tasks 的情况。',
        'checklist.md 是否明确写出通过 / 未通过 / 阻断项 / 证据 / 是否放行。',
      ],
      verification_expectations: verificationExpectations,
      output_requirements: [
        'checklist.md 必须使用轻量结构，但仍要明确证据和放行结论。',
        'iterations.md 必须记录问题、修正动作、残留风险与是否建议升级主流程。',
      ],
    };
  }

  if (flowId === QUICK_FIX_FLOW_ID && roleId === 'unit-test-specialist') {
    return {
      ...base,
      summary: '基于 bugfix.md、implementation-notes.md 和相关代码判断 quick-fix 是否必须补测，并给最小测试策略。',
      quick_fix_boundary: [
        '仅围绕当前修复涉及的 store、工具函数、边界逻辑和回归路径给建议',
        '不把轻量补测默认扩成全量测试重构',
      ],
      upgrade_to_full_change_when: [
        '要补的测试已经暴露出需求边界、接口边界或架构职责变化',
        '测试缺口意味着当前修复并非低风险小改动',
      ],
      expected_outputs: ['unit-test-suggestions'],
      input_priority: ['bugfix.md', 'implementation-notes.md', '相关代码', '现有测试'],
      must_resolve: [
        '指出哪些逻辑必须被测试保护，哪些只需记录残留风险',
        '说明建议补测的落点、断言重点和不立即补测的影响',
      ],
    };
  }

  if (flowId === QUICK_FIX_FLOW_ID && roleId === 'verification-reviewer') {
    return {
      ...base,
      summary: '在 quick-fix 下补强验收证据与验证口径，不重新定义需求。',
      quick_fix_boundary: [
        '优先读取 bugfix.md、implementation-notes.md 与 checklist.md（若存在）',
        '只补强交付证据，不倒推需求或方案重写',
      ],
      upgrade_to_full_change_when: [
        '现有 history 产物不足以支撑验收，且补证据已经变成重新定义需求',
        '验证缺口暴露出范围或验收口径变化，需要升级到完整 OpenSpec',
      ],
      expected_outputs: ['verification-review-notes', 'acceptance-risks'],
      input_priority: ['bugfix.md', 'implementation-notes.md', 'checklist.md', '相关页面代码'],
      must_resolve: [
        '指出现有轻流程证据是否足以支撑放行',
        '明确仍需补充的验证动作、截图或残留风险',
      ],
    };
  }

  if (flowId === QUICK_FIX_FLOW_ID && roleId === 'performance-auditor') {
    return {
      ...base,
      summary: '在 quick-fix 下给出轻量性能诊断与优先级建议，判断是否仍可保持小修正语义。',
      quick_fix_boundary: [
        '只针对当前性能症状给判断和优先级，不发散成完整性能治理',
        '优先基于现象描述、实现说明和相关页面代码形成结论',
      ],
      upgrade_to_full_change_when: [
        '性能问题需要跨模块重构、架构调整或长期专项治理',
        '性能退化已经超出 quick-fix 可接受范围',
      ],
      expected_outputs: ['performance-audit-notes', 'priority-suggestions'],
      input_priority: ['性能现象描述', 'implementation-notes.md', '相关页面代码'],
      must_resolve: [
        '明确性能问题属于首屏、运行时还是资源层',
        '给出最值得优先处理的建议，并说明是否需要升级主流程',
      ],
    };
  }

  if (roleId === 'requirement-analyst') {
    return {
      ...base,
      summary: '先按项目规则把需求收敛成 proposal/specs/design/tasks，再把高风险缺口转成门禁或待确认项。',
      expected_outputs: ['proposal.md', 'specs/', 'design.md', 'tasks.md'],
      must_resolve: [
        '页面/路由/API/mock/样式落点需和仓库约定一致',
        '至少产出一个 specs/<domain>/spec.md，并在 design.md 说明实现落点',
        '能从项目规则与代码推断的信息优先转成 assumptions',
        '在 tasks.md 中把关键规则约束转成可执行任务项，而不是保留成抽象建议',
      ],
    };
  }

  if (roleId === 'frontend-implementer') {
    return {
      ...base,
      summary: '按 proposal/specs/design/tasks 与项目目录、路由、API、样式约定完成实现，不擅自扩 scope。',
      implementation_focus: [
        repoConventions.viewsDir ? `页面落点优先对齐 ${repoConventions.viewsDir}` : '页面落点需与仓库 views 约定一致',
        repoConventions.routeModulesDir ? `路由修改优先对齐 ${repoConventions.routeModulesDir}` : '若新增路由，需先确认路由入口与模块组织方式',
        repoConventions.apiDir ? `接口封装优先对齐 ${repoConventions.apiDir}` : '若涉及真实接口，需先确认 API 封装入口',
      ],
      implementation_constraints: [
        '项目规则和 repo_conventions 高于 skill 示例；若 skill 样例与项目规范冲突，以规则为准。',
        '遵守最小改动原则：只改当前需求直接相关的页面、路由、mock、API 或样式文件',
        '不要顺手重构无关模块，不要为了“更完整”扩大改动面',
      ],
    };
  }

  if (roleId === 'code-guardian') {
    const verificationExpectations = targetDir
      ? buildVerificationExpectations(targetDir, projectContextGuidance)
      : [];
    const evidenceTargets = buildCodeGuardianEvidenceRelPaths(repoConventions);

    return {
      ...base,
      summary: '按 proposal/specs/design/tasks 和项目规范核查目录落点、路由/API/样式/Test 合规性，再给交付结论。',
      review_focus: [
        '页面/组件/路由/API/mock/store 是否落到正确目录',
        '实现边界是否仍符合 proposal/specs/design/tasks 与审批限制',
        '样式是否继续使用主题变量与作用域样式',
      ],
      evidence_targets: evidenceTargets,
      blocking_checks: [
        repoConventions.viewsDir ? `页面或组件是否落在 ${repoConventions.viewsDir} 约定范围` : '页面或组件落点是否符合仓库结构约定',
        repoConventions.routeModulesDir ? `路由是否落在 ${repoConventions.routeModulesDir} 并保持懒加载/meta 约定` : '新增路由是否先补齐路由骨架并符合模块组织方式',
        repoConventions.apiDir ? `接口是否经由 ${repoConventions.apiDir} 封装，页面/组件未直接调 request` : '涉及真实接口时是否先建立统一 API 封装入口',
        '工具函数、store 或复杂业务逻辑新增时，是否已按 11-测试规范补齐测试并保证可独立运行',
        '审计结论是否按 14-审计汇报规范给出读取记录、操作记录、规范对齐、技能状态与偏差披露',
        repoConventions.styleEntry ? `样式是否沿用 ${repoConventions.styleEntry} 及主题变量，不存在硬编码颜色或全局污染` : '样式是否继续使用主题变量和作用域样式',
        '是否出现与本次任务无关的扩改、顺手重构或越权补功能',
        '实现是否越过 proposal/specs/design/tasks 或审批约束，把演示页扩成生产能力',
      ],
      scope_guard: [
        '只按 proposal/specs/design/tasks 与已批准范围审查，不接受静默扩 scope',
        '高风险领域未批准的真实支付、敏感采集、风控/权限逻辑必须继续阻断',
        'mock / 占位实现不得伪装成可直接上线的真实交付',
      ],
      verification_expectations: verificationExpectations,
      output_requirements: [
        'checklist.md 需要区分通过、未通过、阻断项与建议放行结论，并使用中文标题',
        'iterations.md 需要沉淀问题、修正动作、残留风险与下轮提醒，并使用中文标题',
      ],
    };
  }

  if (roleId === 'design-collaborator') {
    return {
      ...base,
      summary: '先把设计输入转成可执行的 UI 约束、歧义点和待确认问题，再交还需求/实现链路。',
      expected_outputs: ['ui-analysis-notes', 'design-open-questions'],
      must_resolve: [
        '设计稿中的关键交互、状态和视觉约束需落到当前项目页面结构',
        '把会影响实现范围的设计歧义显式转成待确认项',
      ],
    };
  }

  if (roleId === 'api-contract-specialist') {
    return {
      ...base,
      summary: '在实现前明确接口契约、字段边界和 mock/真实接口切换策略。',
      expected_outputs: ['api-contract-notes', 'open-questions'],
      must_resolve: [
        '接口输入输出、字段命名和值域约束要能回写到当前变更章节',
        '需要明确哪些地方可以先 mock，哪些必须等真实契约确认',
      ],
    };
  }

  if (roleId === 'unit-test-specialist') {
    return {
      ...base,
      summary: '补充最值得做的单测策略与边界场景，降低 patch / 增量改动的回归风险。',
      expected_outputs: ['test-plan', 'unit-test-suggestions'],
      must_resolve: [
        '指出哪些逻辑必须被测试保护',
        '优先最小测试增量，不要求一次补全全部测试',
      ],
    };
  }

  if (roleId === 'verification-reviewer') {
    return {
      ...base,
      summary: '从验收视角检查验证链路是否闭环，并补强交付前的验证结论。',
      expected_outputs: ['verification-review-notes', 'acceptance-risks'],
      must_resolve: [
        'proposal/specs/design/tasks 的关键验收项是否已有对应验证',
        '指出仍需补充的验证动作或残留风险',
      ],
    };
  }

  if (roleId === 'performance-auditor') {
    return {
      ...base,
      summary: '定位主要性能瓶颈与高收益优化点，为后续实现或守护提供性能审计意见。',
      expected_outputs: ['performance-audit-notes', 'priority-suggestions'],
      must_resolve: [
        '说明性能问题是首屏、运行时还是资源层瓶颈',
        '给出最值得优先处理的优化顺序，而不是泛化建议',
      ],
    };
  }

  if (roleId === 'archive-change') {
    const archivePreflight = targetDir
      ? buildArchivePreflight(targetDir, changeId, currentRun)
      : {
          ready: false,
          summary: '缺少目标项目上下文，无法执行 archive preflight。',
          missing_artifacts: ['target'],
          items: [],
        };

    return {
      ...base,
      summary: '在用户明确同意后合并增量规范并归档 change 目录，不跳过任何收尾步骤。',
      archive_command: './node_modules/.bin/ai-spec-auto archive-change --target . --change-id <change-id> --complete-run --json',
      must_use_internal_command: true,
      archive_preflight: archivePreflight,
      archive_focus: [
        '优先执行 ai-spec-auto archive-change --complete-run 内置命令，不手工 mkdir/cp/mv',
        '先把 openspec/changes/<change-id>/specs/ 合并到 openspec/specs/',
        '再把 change 目录迁移到 openspec/changes/archive/YYYY-MM-DD-<change-id>/',
        'preflight 未通过时先补齐缺失产物，不得放行到归档命令',
        '归档命令成功后直接结束本次运行，不再补写 runtime-state complete 或额外执行 protocol-advance',
      ],
    };
  }

  return base;
}

function looksLikeApprovalInput(input) {
  const text = String(input || '').trim();
  if (!text) {
    return false;
  }

  return [
    /同意/,
    /批准/,
    /通过审批/,
    /可以继续/,
    /继续\b/,
    /继续实现/,
    /继续开发/,
    /开始\b/,
    /愿意/,
    /按 proposal 继续/,
    /按提案继续/,
    /审批通过/,
  ].some((pattern) => pattern.test(text));
}

function looksLikeResumeInput(input) {
  const text = String(input || '').trim();
  if (!text) {
    return false;
  }

  return [
    /^继续$/,
    /^继续执行$/,
    /^恢复$/,
    /^恢复执行$/,
    /^继续推进$/,
    /^接着来$/,
    /^继续做$/,
  ].some((pattern) => pattern.test(text));
}

function looksLikeConfirmProceedInput(input) {
  const text = String(input || '').trim();
  if (!text) {
    return false;
  }

  return [
    /确认/,
    /按当前方案继续/,
    /按这个方案继续/,
    /按方案.*继续/,
    /选方案/,
    /就这样继续/,
    /可以按这个做/,
  ].some((pattern) => pattern.test(text));
}

function looksLikeArchiveApproveInput(input) {
  const text = String(input || '').trim();
  if (!text) {
    return false;
  }

  if (looksLikeArchiveSkipInput(text) || looksLikeArchiveFixInput(text)) {
    return false;
  }

  return [
    /归档/,
    /同意归档/,
    /确认归档/,
    /执行归档/,
    /继续归档/,
    /开始归档/,
  ].some((pattern) => pattern.test(text));
}

function looksLikeArchiveSkipInput(input) {
  const text = String(input || '').trim();
  if (!text) {
    return false;
  }

  return [
    /不归档/,
    /先不归档/,
    /暂不归档/,
    /跳过归档/,
    /不用归档/,
    /无需归档/,
  ].some((pattern) => pattern.test(text));
}

function looksLikeArchiveFixInput(input) {
  const text = String(input || '').trim();
  if (!text) {
    return false;
  }

  return [
    /先别归档/,
    /别归档/,
    /不要归档/,
    /不归档.*改/,
    /实现不对/,
    /不是我想要的/,
    /改一下/,
    /改成/,
    /调一下/,
    /还得调/,
  ].some((pattern) => pattern.test(text));
}

function looksLikeFollowupPatchInput(input) {
  const text = String(input || '').trim();
  if (!text) {
    return false;
  }

  return [
    /上个.*归档.*修/,
    /补一个修正/,
    /开个补丁/,
    /follow-?up patch/i,
    /patch/i,
    /已归档.*改/,
  ].some((pattern) => pattern.test(text));
}

function classifyChangeImpact(runState, latestInput) {
  const text = String(latestInput || '').trim();
  const pendingGate = runState?.pending_gate || null;
  const currentRole = runState?.current_role || null;
  const status = String(runState?.status || '').trim().toLowerCase();
  const changeContext = status === 'success' ? 'archived-change' : 'active-change';

  if (!text) {
    return {
      change_context: changeContext,
      route_decision: runState?.flow?.id === QUICK_FIX_FLOW_ID ? 'quick-fix' : 'full-change',
      trace_mode: runState?.flow?.id === QUICK_FIX_FLOW_ID ? 'direct-fix' : 'same-change',
      change_impact: null,
      reconcile_strategy: null,
      artifacts_to_update: [],
      reopen_reason: null,
      target_role: null,
      handoff_gate: null,
    };
  }

  if (pendingGate === 'before-archive' && looksLikeArchiveFixInput(text) && !looksLikeArchiveSkipInput(text) && !looksLikeArchiveApproveInput(text)) {
    const targetRole = inferChangeImpactTargetRole(currentRole, 'archive-fix', text);
    return {
      change_context: changeContext,
      route_decision: 'archive-fix',
      trace_mode: 'same-change',
      change_impact: 'archive-fix',
      reconcile_strategy: targetRole === 'requirement-analyst'
        ? 'rewind-to-requirement'
        : targetRole === 'code-guardian'
        ? 'rewind-to-guardian'
        : 'rewind-to-frontend',
      artifacts_to_update: inferArtifactsToUpdate('archive-fix'),
      reopen_reason: '归档前发现实现或验收不符合预期，需要先修正再归档',
      target_role: targetRole,
      handoff_gate: targetRole === 'requirement-analyst' ? 'confirm' : 'silent',
    };
  }

  if (status === 'success' && looksLikeFollowupPatchInput(text)) {
    return {
      change_context: 'archived-change',
      route_decision: 'followup-patch',
      trace_mode: 'followup-change',
      change_impact: 'followup-patch',
      reconcile_strategy: 'followup-patch',
      artifacts_to_update: inferArtifactsToUpdate('followup-patch'),
      reopen_reason: '原变更已归档，当前输入更适合作为补丁变更单独修正',
      target_role: /范围|设计|接口|字段|验收/i.test(text) ? 'requirement-analyst' : 'frontend-implementer',
      handoff_gate: 'silent',
    };
  }

  if (/顺便|另外再做|改成.*模块|真实支付|生产收银台|权限系统|风控规则/i.test(text)) {
    return {
      change_context: changeContext,
      route_decision: 'full-change',
      trace_mode: 'full-openspec',
      change_impact: 're-scope',
      reconcile_strategy: 'suggest-new-change',
      artifacts_to_update: inferArtifactsToUpdate('re-scope'),
      reopen_reason: '新输入明显超出当前 change 范围，建议拆成新的 change',
      target_role: 'task-orchestrator',
      handoff_gate: 'confirm',
    };
  }

  if (looksLikeScopeDeltaInput(text) || /改成.*详情|详情联动/i.test(text)) {
    return {
      change_context: changeContext,
      route_decision: 'scope-delta',
      trace_mode: 'same-change',
      change_impact: 'scope-delta',
      reconcile_strategy: 'rewind-to-requirement',
      artifacts_to_update: inferArtifactsToUpdate('scope-delta'),
      reopen_reason: '补充输入影响任务拆分、接口边界或验收范围，需要回需求阶段做增量修订',
      target_role: 'requirement-analyst',
      handoff_gate: 'confirm',
    };
  }

  return {
    change_context: changeContext,
    route_decision: 'patch',
    trace_mode: 'same-change',
    change_impact: 'patch',
    reconcile_strategy: 'in-place',
    artifacts_to_update: inferArtifactsToUpdate('patch'),
    reopen_reason: '补充输入属于当前 change 内的小修正，按最小 diff 吸收即可',
    target_role: inferChangeImpactTargetRole(currentRole, 'patch', text),
    handoff_gate: 'silent',
  };
}

function createFollowupPatchChangeId(parentChangeId, userInput) {
  const base = String(parentChangeId || 'followup-patch')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'followup-patch';
  const hint = String(userInput || '')
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s-]/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .join('-')
    .replace(/-+/g, '-')
    .toLowerCase();
  return `${base}-patch${hint ? `-${hint}` : ''}`.slice(0, 96);
}

function buildRoleGuidance(roleId, deliveryProfile) {
  const base = ROLE_GUIDANCE[roleId];
  if (!base) {
    return null;
  }

  if (deliveryProfile !== 'micro') {
    return {
      ...base,
      delivery_profile: 'standard',
      artifact_profile: 'full',
    };
  }

  const extras = MICRO_ROLE_EXTRAS[roleId] || {};
  return {
    goal: extras.goal || base.goal,
    must_do: [...(base.must_do || []), ...(extras.must_do || [])],
    must_not: [...(base.must_not || []), ...(extras.must_not || [])],
    delivery_profile: 'micro',
    artifact_profile: 'compact',
  };
}

function buildArtifactSummary(currentRun, writes) {
  const currentArtifacts = currentRun?.artifacts && typeof currentRun.artifacts === 'object'
    ? Object.fromEntries(Object.entries(currentRun.artifacts).filter(([, value]) => Boolean(value)))
    : {};
  const plannedOutputs = writes
    .filter((item) => item.kind === 'symbolic' || item.rel_path)
    .map((item) => (item.kind === 'symbolic' ? item.value : item.rel_path));

  return {
    change_id: currentRun?.task?.change_id || currentRun?.anchor?.task?.change_id || null,
    current_artifacts: currentArtifacts,
    planned_outputs: plannedOutputs,
    latest_verification: currentRun?.verification ? 'available' : null,
    auto_fix_active: Boolean(currentRun?.auto_fix?.active),
  };
}

function buildCompactContext(roleRuleContract, roleSkillContract, repoConventions, currentRun, writes) {
  return {
    rule_summary: {
      source_rule_ids: Array.isArray(roleRuleContract?.source_rules)
        ? roleRuleContract.source_rules.map((item) => item.id)
        : [],
      must_follow: Array.isArray(roleRuleContract?.must_follow) ? roleRuleContract.must_follow.slice(0, 4) : [],
      blocked_when: Array.isArray(roleRuleContract?.blocked_when) ? roleRuleContract.blocked_when.slice(0, 3) : [],
      repo_specific: Array.isArray(roleRuleContract?.repo_specific) ? roleRuleContract.repo_specific.slice(0, 3) : [],
    },
    skill_summary: {
      primary_skills: Array.isArray(roleSkillContract?.primary_skills) ? roleSkillContract.primary_skills : [],
      execution_order: Array.isArray(roleSkillContract?.execution_order) ? roleSkillContract.execution_order : [],
      selected_purposes: Array.isArray(roleSkillContract?.selected)
        ? roleSkillContract.selected
          .filter((item) => item.mode === 'primary' && item.purpose)
          .map((item) => ({ id: item.id, purpose: item.purpose }))
        : [],
    },
    repo_summary: buildRepoConventionGuidance(repoConventions),
    artifact_summary: buildArtifactSummary(currentRun, writes),
    do_not_search_package_source: true,
  };
}

function buildSearchPolicy() {
  return {
    prefer_repo_map_first: true,
    avoid_package_source_search: true,
    max_optional_repo_searches: 3,
  };
}

function buildExecutionArtifactHints(writes, runtimePaths) {
  return writes
    .filter((item) => item.kind === 'symbolic' || item.rel_path !== runtimePaths.tmpCurrentExecution.relPath)
    .map((item) => ({
      artifact: item.kind === 'symbolic' ? item.value : item.rel_path,
      kind: item.kind,
      note: item.kind === 'directory'
        ? '目录型产物也要在 artifacts 中显式列出路径。'
        : item.kind === 'symbolic'
        ? '符号型产物需在 summary 或实现说明中明确完成情况。'
        : null,
    }));
}

function buildExecutionAutoAttachedFields(roleId) {
  const fields = [
    'run_id',
    'dispatch_id',
    'role.id',
    'role.name',
    'flow.id',
    'task.change_id',
    'openspec_action',
    'execution_id',
    'generated_at',
  ];
  if (roleId === 'frontend-implementer') {
    fields.push('verification');
  }
  return fields;
}

function buildExecutionExamplePayload(dispatch, roleDefinition) {
  const roleId = dispatch.role?.id || null;
  const artifacts = dispatch.anchor?.artifacts && typeof dispatch.anchor.artifacts === 'object'
    ? dispatch.anchor.artifacts
    : {};
  const examples = {
    'requirement-analyst': {
      summary: '已完成 proposal/specs/design/tasks，并标记实现前审批关注点。',
      next_action: '执行 protocol-advance，进入 before-implementation 审批。',
      assumptions: ['默认沿用当前仓库的 mock-first 与目录落点约定。'],
    },
    'frontend-implementer': {
      summary: '已完成当前范围实现，保持最小改动并准备进入规范审查。',
      next_action: '执行 protocol-advance，进入 before-guardian 审批。',
    },
    'code-guardian': {
      summary: '已完成 checklist 与 iterations，给出放行结论与残留风险。',
      next_action: '执行 protocol-advance，进入 before-archive 审批。',
    },
  };
  const roleExample = examples[roleId] || {
    summary: '已完成当前专家任务。',
    next_action: '执行 protocol-advance，推进下一轮。',
  };

  return {
    schema_version: 1,
    kind: 'expert-execution',
    run_id: dispatch.run_id || null,
    dispatch_id: dispatch.dispatch_id || null,
    role: {
      id: roleId,
      name: dispatch.role?.name || roleDefinition?.name || null,
    },
    status: 'completed',
    summary: roleExample.summary,
    artifacts,
    next_action: roleExample.next_action,
    ...(roleExample.assumptions ? { assumptions: roleExample.assumptions } : {}),
  };
}

function buildExecutionContract(targetDir, runtimePaths, dispatch, roleDefinition, writes, deliveryProfile) {
  if (dispatch.role?.id === 'archive-change') {
    return null;
  }

  const artifactWrites = writes
    .filter((item) => item.kind !== 'symbolic' && item.rel_path !== runtimePaths.tmpCurrentExecution.relPath)
    .map((item) => item.rel_path);
  const artifactProfile = inferArtifactProfile({
    deliveryProfile,
  });

  const contract = {
    kind: 'expert-execution',
    write_to: runtimePaths.tmpCurrentExecution.relPath,
    delivery_profile: deliveryProfile,
    artifact_profile: artifactProfile,
    required_fields: [
      'kind',
      'status',
      'summary',
      'artifacts',
      'next_action',
    ],
    required_artifacts: artifactWrites,
    auto_attached_fields: buildExecutionAutoAttachedFields(dispatch.role?.id),
    artifact_hints: buildExecutionArtifactHints(writes, runtimePaths),
    example_payload: buildExecutionExamplePayload(dispatch, roleDefinition),
    next_advance_command: './node_modules/.bin/ai-spec-auto protocol-advance --target . --json',
  };

  if (dispatch.role?.id === 'requirement-analyst') {
    contract.required_fields.push('assumptions');
  }

  const flowId = dispatch.flow?.id || DEFAULT_FLOW_ID;
  const nextRole = resolveNextRole(targetDir, flowId, dispatch.role?.id, roleDefinition);
  if (nextRole) {
    contract.default_next_role = nextRole;
  }

  return contract;
}

function buildExpertExpectedOutput(dispatch, writes, runtimePaths, deliveryProfile = 'standard') {
  const outputs = [];
  const flowId = dispatch.flow?.id || DEFAULT_FLOW_ID;

  if (flowId === QUICK_FIX_FLOW_ID) {
    if (dispatch.role?.id === 'frontend-implementer') {
      outputs.push('完成当前范围内的代码修复');
      outputs.push('完成 .ai-spec/history/<run-id>/bugfix.md');
      outputs.push('完成 .ai-spec/history/<run-id>/implementation-notes.md');
    } else if (dispatch.role?.id === 'code-guardian') {
      outputs.push('完成 .ai-spec/history/<run-id>/checklist.md');
      outputs.push('完成 .ai-spec/history/<run-id>/iterations.md');
    } else if (dispatch.role?.id === 'unit-test-specialist') {
      outputs.push('在 expert-execution.summary 中给出 unit-test-suggestions 与边界场景建议');
    } else if (dispatch.role?.id === 'verification-reviewer') {
      outputs.push('在 expert-execution.summary 中给出 verification-review-notes 与 acceptance-risks');
    } else if (dispatch.role?.id === 'performance-auditor') {
      outputs.push('在 expert-execution.summary 中给出 performance-audit-notes 与 priority-suggestions');
    }

    outputs.push(`写入 ${runtimePaths.tmpCurrentExecution.relPath}`);
    outputs.push('产出合法的 expert-execution JSON 回执');
    outputs.push('完成后立即执行 protocol-advance 推进下一轮');
    return [...new Set(outputs)];
  }

  if (dispatch.role?.id === 'requirement-analyst') {
    outputs.push(deliveryProfile === 'micro' ? '完成短版 openspec proposal.md' : '完成 openspec proposal.md');
    outputs.push(deliveryProfile === 'micro' ? '完成短版 openspec specs/<domain>/spec.md（可多份）' : '完成 openspec specs/<domain>/spec.md（可多份）');
    outputs.push(deliveryProfile === 'micro' ? '完成短版 openspec design.md' : '完成 openspec design.md');
    outputs.push(deliveryProfile === 'micro' ? '完成短版 openspec tasks.md' : '完成 openspec tasks.md');
  } else if (dispatch.role?.id === 'frontend-implementer') {
    outputs.push('完成当前范围内的代码实现');
  } else if (dispatch.role?.id === 'code-guardian') {
    outputs.push(deliveryProfile === 'micro' ? '完成短版 openspec checklist.md' : '完成 openspec checklist.md');
    outputs.push(deliveryProfile === 'micro' ? '完成短版 openspec iterations.md' : '完成 openspec iterations.md');
  } else if (dispatch.role?.id === 'archive-change') {
    outputs.push('执行当前归档命令完成规范合并');
    outputs.push('执行当前归档命令完成变更归档并结束本次运行');
    return [...new Set(outputs)];
  }

  outputs.push(`写入 ${runtimePaths.tmpCurrentExecution.relPath}`);
  outputs.push('产出合法的 expert-execution JSON 回执');
  outputs.push('完成后立即执行 protocol-advance 推进下一轮');

  return [...new Set(outputs)];
}

function resolveFlowRoleTargets(flowId, roleId, currentRun) {
  if (flowId !== QUICK_FIX_FLOW_ID) {
    return null;
  }

  const artifacts = currentRun?.artifacts || {};
  if (roleId === 'frontend-implementer') {
    return {
      reads: ['.agents/templates/common/bugfix.md'],
      writes: ['code', artifacts.bugfix, artifacts.implementation_notes].filter(Boolean),
    };
  }

  if (roleId === 'code-guardian') {
    return {
      reads: [artifacts.bugfix, artifacts.implementation_notes].filter(Boolean),
      writes: [artifacts.checklist, artifacts.iterations].filter(Boolean),
    };
  }

  if (['unit-test-specialist', 'verification-reviewer', 'performance-auditor'].includes(roleId)) {
    return {
      reads: [artifacts.bugfix, artifacts.implementation_notes, artifacts.checklist].filter(Boolean),
      writes: [],
    };
  }

  return null;
}

function buildActorPresentation(actorId, mode) {
  switch (actorId) {
    case 'task-orchestrator':
      return {
        label: '任务主代理',
        enter: '当前阶段：任务主代理（task-orchestrator）',
        exit: mode === 'start'
          ? '任务主代理已完成首轮编排'
          : '任务主代理已完成当前编排',
      };
    case 'requirement-analyst':
      return {
        label: '需求解析专家',
        enter: '当前阶段：需求解析专家（requirement-analyst）',
        exit: '需求收敛已完成',
      };
    case 'frontend-implementer':
      return {
        label: '前端实现专家',
        enter: '当前阶段：前端实现专家（frontend-implementer）',
        exit: '当前范围实现已完成',
      };
    case 'code-guardian':
      return {
        label: '规范守护专家',
        enter: '当前阶段：规范守护专家（code-guardian）',
        exit: '交付检查已完成',
      };
    case 'archive-change':
      return {
        label: '归档专家',
        enter: '当前阶段：归档专家（archive-change）',
        exit: '归档收尾已完成',
      };
    case 'runner':
      return {
        label: '运行时推进器',
        enter: '当前阶段：运行时推进器（runner）',
        exit: '运行时推进器已完成当前态消费',
      };
    default:
      return {
        label: actorId || null,
        enter: actorId ? `当前阶段：${actorId}` : null,
        exit: actorId ? `${actorId} 已完成当前轮次` : null,
      };
  }
}

function attachActorPresentation(turn) {
  if (!turn.actor?.id) {
    return turn;
  }

  const presentation = buildActorPresentation(turn.actor.id, turn.mode);
  return {
    ...turn,
    actor: {
      ...turn.actor,
      label: turn.actor.label || presentation.label,
    },
    announcements: {
      enter: presentation.enter,
      exit: presentation.exit,
    },
  };
}

function applySuperpowersPresentation(turn) {
  const prompt = turn.guidance?.superpowers_contract?.user_prompt;
  if (!prompt || !turn.announcements?.enter) {
    return turn;
  }

  return {
    ...turn,
    announcements: {
      ...turn.announcements,
      enter: `${turn.announcements.enter}。${prompt}`,
    },
  };
}

function buildStartConfirmTurn(targetDir, userInput, routeDecision) {
  const runtimePaths = resolveRuntimePaths(targetDir);
  const orchestratorGuidance = buildOrchestratorGuidance(targetDir, null, userInput, routeDecision);

  return attachProtocolContracts(attachActorPresentation({
    kind: 'ai-protocol-turn',
    status: 'blocked',
    mode: 'confirm-gate',
    actor: {
      id: 'task-orchestrator',
      type: 'orchestrator',
    },
    command: null,
    reason: 'multiple candidate open changes were detected; user confirmation is required before opening or reusing a change',
    summary: {
      run_id: null,
      run_status: null,
      current_role: null,
      pending_gate: null,
      next_expected_producer: 'task-orchestrator',
      change_context: routeDecision?.change_context || null,
      route_decision: routeDecision?.route_decision || null,
      trace_mode: routeDecision?.trace_mode || null,
    },
    input: {
      user_request: userInput || null,
      candidate_changes: routeDecision?.candidate_changes || [],
    },
    reads: dedupeTargets([
      ...buildCommandTargets(targetDir, START_INSTRUCTION_FILES),
      buildFileTarget(targetDir, runtimePaths.repoMap.relPath, {
        label: 'lightweight repo map',
      }),
    ]),
    writes: [],
    expected_output: [
      '当前存在多个未归档 change，先请用户明确本次要复用哪个 change 或说明这是新的独立需求',
      '只输出简洁的候选 change 摘要与下一步确认动作',
    ],
    guidance: {
      ...orchestratorGuidance,
      confirm_gate: {
        gate: 'select-change',
        status: 'waiting-confirm',
        required_user_action: '请明确要复用的 change_id，或说明这是一个新的独立小需求。',
        blocked_reason: routeDecision?.reason || '当前存在多个未归档 change，不能自动猜测目标变更。',
        blocked_by_role: 'task-orchestrator',
        resume_to_role: 'task-orchestrator',
        candidate_changes: routeDecision?.candidate_changes || [],
        resume_rule: '用户明确 change_id 或说明“这是新的需求”后，再重新进入 start 路由选择。',
      },
    },
  }), { userInput });
}

function buildStartConfigGateTurn(targetDir, userInput, options = {}) {
  const runtimePaths = resolveRuntimePaths(targetDir);
  const runMode = normalizeRunMode(options.mode);
  const reviewPolicy = normalizeReviewPolicy(options.reviewPolicy);
  const requiredAction = options.requiredUserAction || (runMode === 'manual'
    ? '当前以 manual（手动）模式启动，请补充 --flow <flow-id> 后再继续。'
    : '当前以 suggest（建议）模式启动，请先确认建议执行计划后再继续。');
  const blockedReason = options.blockedReason || (runMode === 'manual'
    ? 'manual（手动）模式要求显式指定 flow（流程模板），当前不能自动猜测。'
    : 'suggest（建议）模式会先收敛 run-plan（运行计划），经人工确认后再启动第一位专家。');

  return attachProtocolContracts(attachActorPresentation({
    kind: 'ai-protocol-turn',
    status: 'blocked',
    mode: 'confirm-gate',
    actor: {
      id: 'task-orchestrator',
      type: 'orchestrator',
    },
    command: null,
    reason: blockedReason,
    summary: {
      run_id: null,
      run_status: null,
      current_role: null,
      pending_gate: null,
      run_mode: runMode,
      review_policy: reviewPolicy,
      next_expected_producer: 'task-orchestrator',
    },
    input: {
      user_request: userInput || null,
      requested_mode: runMode,
      review_policy: reviewPolicy,
      requested_flow: options.flowId || null,
    },
    reads: dedupeTargets([
      ...buildCommandTargets(targetDir, START_INSTRUCTION_FILES),
      buildFileTarget(targetDir, runtimePaths.repoMap.relPath, {
        label: 'lightweight repo map',
      }),
    ]),
    writes: [],
    expected_output: runMode === 'manual'
      ? ['提示用户补充 --flow <flow-id>，不要自动猜测流程模板']
      : ['提示用户先确认建议执行计划，再恢复到第一位专家继续'],
    guidance: {
      confirm_gate: {
        gate: runMode === 'manual' ? 'manual-flow-required' : 'start-review',
        status: 'waiting-confirm',
        required_user_action: requiredAction,
        blocked_reason: blockedReason,
        blocked_by_role: 'task-orchestrator',
        resume_to_role: 'task-orchestrator',
        resume_rule: runMode === 'manual'
          ? '补充 --flow 后重新执行 /spec-start。'
          : '确认建议计划后，再恢复到第一位专家继续。',
      },
    },
  }), { userInput });
}

function buildStartTurn(targetDir, userInput, options = {}) {
  const runtimePaths = resolveRuntimePaths(targetDir);
  const runMode = normalizeRunMode(options.mode);
  const reviewPolicy = normalizeReviewPolicy(options.reviewPolicy);
  const requestedFlowId = options.flowId ? String(options.flowId).trim() : null;
  if (runMode === 'manual' && !requestedFlowId) {
    return buildStartConfigGateTurn(targetDir, userInput, {
      mode: runMode,
      reviewPolicy,
      flowId: null,
    });
  }
  if (runMode === 'manual' && requestedFlowId && !getFlowRuntimeConfig(targetDir, requestedFlowId)) {
    return buildStartConfigGateTurn(targetDir, userInput, {
      mode: runMode,
      reviewPolicy,
      flowId: requestedFlowId,
      requiredUserAction: `指定的 flow（流程模板） "${requestedFlowId}" 未注册，请改用有效的 flow-id 后重试。`,
      blockedReason: `manual（手动）模式指定的 flow（流程模板） "${requestedFlowId}" 未在当前项目注册，不能继续。`,
    });
  }

  const routeDecision = inferStartRoutingDecision(targetDir, userInput);
  if (routeDecision.waiting_confirm_required) {
    return buildStartConfirmTurn(targetDir, userInput, routeDecision);
  }
  const selectedFlowId = requestedFlowId || routeDecision.selected_flow || DEFAULT_FLOW_ID;
  const flowDefinition = loadFlowDefinition(targetDir, selectedFlowId);
  const effectiveApprovalGates = buildEffectiveApprovalGates(flowDefinition.id, flowDefinition.approval_gates, reviewPolicy);
  const riskLevel = inferRiskLevel({
    rawInput: userInput,
    taskType: null,
    deliveryProfile: null,
    flowId: selectedFlowId,
  });
  const deliveryProfile = inferDeliveryProfile({
    rawInput: userInput,
    taskType: null,
    riskLevel,
    flowId: selectedFlowId,
  });
  const artifactProfile = flowDefinition.artifact_profile || inferArtifactProfile({
    deliveryProfile,
  });
  const complexity = inferComplexity({
    deliveryProfile,
    riskLevel,
  });
  const orchestratorGuidance = buildOrchestratorGuidance(targetDir, {
    delivery_profile: deliveryProfile,
    artifact_profile: artifactProfile,
    complexity,
    task: {
      risk_level: riskLevel,
      change_context: routeDecision.change_context,
      route_decision: routeDecision.route_decision,
      trace_mode: routeDecision.trace_mode,
      change_id: routeDecision.reuse_change_id || null,
      parent_change_id: routeDecision.parent_change_id || null,
    },
    flow: {
      id: selectedFlowId,
    },
    plan: {
      first_handoff: routeDecision.next_expert || flowDefinition.first_handoff,
      approval_gates: effectiveApprovalGates,
    },
    mode: runMode,
    review_policy: reviewPolicy,
  }, userInput, {
    ...routeDecision,
    selected_flow: selectedFlowId,
    mode: runMode,
    review_policy: reviewPolicy,
  });

  return attachProtocolContracts(attachActorPresentation({
    kind: 'ai-protocol-turn',
    status: userInput ? 'ready' : 'waiting-input',
    mode: 'start',
    actor: {
      id: 'task-orchestrator',
      type: 'orchestrator',
    },
    command: '/spec-start',
    reason: userInput
      ? 'no active run-state found; start a new AI delivery run from the incoming requirement'
      : 'no active run-state found; waiting for a new requirement input',
    summary: {
      run_id: null,
      run_status: null,
      current_role: null,
      pending_gate: null,
      run_mode: runMode,
      review_policy: reviewPolicy,
      next_expected_producer: 'task-orchestrator',
      delivery_profile: deliveryProfile,
      artifact_profile: artifactProfile,
      complexity,
      risk_level: riskLevel,
      change_context: routeDecision.change_context,
      route_decision: routeDecision.route_decision,
      trace_mode: routeDecision.trace_mode,
      superpowers_mode: loadSuperpowersState(targetDir).mode || 'off',
      superpowers_fallback_reason: loadSuperpowersState(targetDir).last_fallback_reason || null,
    },
    input: {
      user_request: userInput || null,
      requested_mode: runMode,
      review_policy: reviewPolicy,
      requested_flow: requestedFlowId,
    },
    reads: dedupeTargets([
      ...buildCommandTargets(targetDir, START_INSTRUCTION_FILES),
      buildFileTarget(targetDir, runtimePaths.repoMap.relPath, {
        label: 'lightweight repo map',
      }),
    ]),
    writes: [
      buildFileTarget(targetDir, runtimePaths.tmpTaskOrchestratorTurn.relPath, {
        required: true,
        label: 'task-orchestrator turn inbox',
      }),
    ],
    expected_output: [
      '输出最小 run-plan JSON',
      `在 run-plan 中明确 mode=${runMode} 与 review_policy=${reviewPolicy}`,
      `在 run-plan 中明确 delivery_profile=${deliveryProfile} 与 artifact_profile=${artifactProfile}`,
      `在 run-plan 中明确 change_context=${routeDecision.change_context || 'no-change'}、route_decision=${routeDecision.route_decision || 'full-change'}、trace_mode=${routeDecision.trace_mode || 'full-openspec'}`,
      requestedFlowId ? `在 run-plan 中显式使用 flow.id=${requestedFlowId}` : 'flow.id 需按当前路由结果或用户指定值显式写明',
      `写入 ${runtimePaths.tmpTaskOrchestratorTurn.relPath}`,
    ],
    guidance: {
      ...orchestratorGuidance,
      routing: {
        selected_flow: selectedFlowId,
        requested_mode: runMode,
        review_policy: reviewPolicy,
        delivery_profile: deliveryProfile,
        artifact_profile: artifactProfile,
        complexity,
        risk_level: riskLevel,
        note: runMode === 'suggest'
          ? '当前以 suggest（建议）模式启动：先生成建议执行计划，经人工确认后再启动第一位专家。'
          : runMode === 'manual'
          ? `当前以 manual（手动）模式启动：flow 已锁定为 ${requestedFlowId}，主代理只做校验与编排。`
          : routeDecision.route_decision === 'quick-fix'
          ? '当前需求命中全新低风险小修正，默认走 bugfix-to-verification 轻链路，并在 .ai-spec/history/<run-id>/ 下留痕。'
          : riskLevel === 'high'
          ? '当前需求涉及高风险领域：仍按三专家协同推进，但 requirement 阶段后将进入 before-implementation 审批门禁。'
          : reviewPolicy === 'main-flow-blocking' && selectedFlowId === DEFAULT_FLOW_ID
          ? '当前启用 main-flow-blocking 审核策略：主流程 requirement / frontend / guardian 完成后都需人工审核。'
          : deliveryProfile === 'micro'
            ? '当前需求更适合微型交付档位：保留三专家，但产物使用短版 compact 规格。'
            : '当前需求更适合标准交付档位：保留完整 OpenSpec 产物，默认自动推进；如需人工审核，可显式切换到 main-flow-blocking。',
      },
      orchestrator_contract: {
        kind: 'run-plan',
        write_to: runtimePaths.tmpTaskOrchestratorTurn.relPath,
        required_fields: [
          'kind',
          'mode',
          'review_policy',
          'flow.id',
          'plan.first_handoff',
          'delivery_profile',
          'artifact_profile',
          'task.change_context',
          'task.route_decision',
          'task.trace_mode',
        ],
        allowed_kinds: ['run-plan', 'task-orchestrator-bootstrap'],
      },
    },
  }), { userInput });
}

function buildDispatchTurn(targetDir, status, currentArtifacts) {
  const runtimePaths = resolveRuntimePaths(targetDir);
  return attachProtocolContracts(attachActorPresentation({
    kind: 'ai-protocol-turn',
    status: 'ready',
    mode: 'dispatch',
    actor: {
      id: 'task-orchestrator',
      type: 'orchestrator',
    },
    command: 'task-orchestrator:dispatch',
    reason: status.next_expected.reason,
    summary: buildSummary(status, currentArtifacts.run, targetDir),
    input: {
      user_request: currentArtifacts.run?.trigger?.raw_input || null,
      flow_id: currentArtifacts.run?.flow?.id || null,
      delivery_profile: currentArtifacts.run?.delivery_profile || null,
      artifact_profile: currentArtifacts.run?.artifact_profile || null,
    },
    reads: dedupeTargets([
      ...buildCommandTargets(targetDir, DISPATCH_INSTRUCTION_FILES),
      buildFileTarget(targetDir, path.join('.ai-spec', 'current-run.json'), {
        required: true,
        label: 'current run-state',
      }),
    ]),
    writes: [
      buildFileTarget(targetDir, runtimePaths.tmpCurrentDispatch.relPath, {
        required: true,
        label: 'expert dispatch inbox',
      }),
    ],
    expected_output: [
      '根据 current-run 选择当前专家并产出 expert-dispatch',
      '将当前任务锚点和期望输出裁剪到当前专家可执行粒度',
    ],
  }), {
    userInput: currentArtifacts.run?.trigger?.latest_user_input || currentArtifacts.run?.trigger?.raw_input || null,
  });
}

function buildContinueTurn(targetDir, status, currentArtifacts, snapshot = null) {
  const activeSnapshot = snapshot || createWorkflowSnapshot(targetDir, { status, currentArtifacts });
  const runtimePaths = activeSnapshot.runtimePaths;
  const orchestratorGuidance = buildOrchestratorGuidance(
    targetDir,
    currentArtifacts.run,
    currentArtifacts.run?.trigger?.latest_user_input || currentArtifacts.run?.trigger?.raw_input || null,
  );
  const expectedOutput = currentArtifacts.run?.pending_gate
    ? ['基于当前审批点产出最小 runtime-action']
    : ['基于当前专家执行结果产出最小 runtime-action'];

  const reads = [
    ...buildCommandTargets(targetDir, CONTINUE_INSTRUCTION_FILES),
    buildFileTarget(targetDir, path.join('.ai-spec', 'current-run.json'), {
      required: true,
      label: 'current run-state',
    }),
  ];

  if (currentArtifacts.execution) {
    reads.push(
      buildFileTarget(targetDir, getExistingRelPath(runtimePaths.currentExecutionJson), {
        required: true,
        label: 'current expert execution',
      }),
    );
  }

  return attachProtocolContracts(attachActorPresentation({
    kind: 'ai-protocol-turn',
    status: 'ready',
    mode: 'continue',
    actor: {
      id: 'task-orchestrator',
      type: 'orchestrator',
    },
    command: '/spec-continue',
    reason: status.next_expected.reason,
    summary: buildSummary(status, currentArtifacts.run, targetDir),
    input: {
      user_request: currentArtifacts.run?.trigger?.raw_input || null,
      current_role: currentArtifacts.run?.current_role || null,
      pending_gate: currentArtifacts.run?.pending_gate || null,
      delivery_profile: currentArtifacts.run?.delivery_profile || null,
      artifact_profile: currentArtifacts.run?.artifact_profile || null,
    },
    reads: dedupeTargets(reads),
    writes: [
      buildFileTarget(targetDir, runtimePaths.tmpTaskOrchestratorTurn.relPath, {
        required: true,
        label: 'task-orchestrator turn inbox',
      }),
    ],
    expected_output: expectedOutput,
    guidance: {
      ...orchestratorGuidance,
      orchestrator_contract: {
        kind: 'task-orchestrator-runtime-action',
        write_to: runtimePaths.tmpTaskOrchestratorTurn.relPath,
        required_fields: [
          'kind',
          'action',
          'run_id',
        ],
        allowed_actions: ['handoff', 'approve', 'resume', 'gate-blocked', 'complete', 'fail', 'cancel'],
      },
    },
  }), {
    userInput: currentArtifacts.run?.trigger?.latest_user_input || currentArtifacts.run?.trigger?.raw_input || null,
  });
}

function buildPausedTurn(targetDir, status, currentArtifacts) {
  const runState = currentArtifacts.run || null;
  return attachProtocolContracts(attachActorPresentation({
    kind: 'ai-protocol-turn',
    status: 'blocked',
    mode: 'paused',
    actor: {
      id: 'task-orchestrator',
      type: 'orchestrator',
    },
    command: '/spec-continue',
    reason: 'current run has been paused and is waiting for an explicit resume',
    summary: buildSummary(status, runState, targetDir),
    input: {
      user_request: runState?.trigger?.raw_input || null,
      current_role: runState?.current_role || null,
      pending_gate: runState?.pending_gate || null,
      delivery_profile: runState?.delivery_profile || null,
      artifact_profile: runState?.artifact_profile || null,
    },
    reads: [
      buildFileTarget(targetDir, path.join('.ai-spec', 'current-run.json'), {
        required: true,
        label: 'current run-state',
      }),
    ],
    writes: [],
    expected_output: [
      '当前运行已暂停，保留当前产物与上下文',
      '等待用户继续推进或补充新的修正输入',
      '只用简洁摘要说明当前停点与恢复方式',
    ],
    guidance: {
      ...buildOrchestratorGuidance(
        targetDir,
        runState,
        runState?.trigger?.latest_user_input || runState?.trigger?.raw_input || null,
      ),
      pause_contract: {
        status: 'paused',
        resume_rule: '用户执行 /spec-continue，或通过自然语言表达“继续 / 恢复执行”后，再恢复到当前停点继续。',
        preserved_state: [
          '当前 run',
          '当前专家停点',
          '当前产物与增量修订上下文',
        ],
      },
    },
  }), {
    userInput: runState?.trigger?.latest_user_input || runState?.trigger?.raw_input || null,
  });
}

function buildConfirmGateTurn(targetDir, status, currentArtifacts) {
  const runState = currentArtifacts.run || null;
  const gateContext = runState?.gate_context || null;
  const gateId = gateContext?.gate_id || runState?.pending_gate || 'handoff-confirm';

  return attachProtocolContracts(attachActorPresentation({
    kind: 'ai-protocol-turn',
    status: 'blocked',
    mode: 'confirm-gate',
    actor: {
      id: 'task-orchestrator',
      type: 'orchestrator',
    },
    command: '/spec-continue',
    reason: 'current run is waiting for a lightweight confirm decision before continuing',
    summary: buildSummary(status, runState, targetDir),
    input: {
      user_request: runState?.trigger?.raw_input || null,
      latest_user_input: runState?.trigger?.latest_user_input || null,
      current_role: runState?.current_role || null,
      pending_gate: runState?.pending_gate || null,
      delivery_profile: runState?.delivery_profile || null,
      artifact_profile: runState?.artifact_profile || null,
    },
    reads: [
      buildFileTarget(targetDir, path.join('.ai-spec', 'current-run.json'), {
        required: true,
        label: 'current run-state',
      }),
    ],
    writes: [],
    expected_output: [
      '当前停在轻确认门禁，等待用户决定是否按当前方案继续',
      '只用简洁摘要说明当前状态、关键原因、下一步',
      '用户确认后恢复到指定专家继续，不升级成重审批',
    ],
    guidance: {
      ...buildOrchestratorGuidance(
        targetDir,
        runState,
        runState?.trigger?.latest_user_input || runState?.trigger?.raw_input || null,
      ),
      confirm_gate: {
        gate: gateId,
        status: 'waiting-confirm',
        required_user_action: gateContext?.required_user_action || '请确认是否按当前方案继续',
        blocked_reason: gateContext?.blocked_reason || '当前方案存在轻量分歧或待确认项',
        blocked_by_role: gateContext?.blocked_by_role || runState?.current_role || null,
        resume_to_role: gateContext?.resume_to_role || runState?.current_role || null,
        resume_rule: '用户用自然语言确认（如“按当前方案继续”）或执行 /spec-continue 后，恢复到指定专家继续。',
        user_report_contract: {
          style: 'confirm-compact',
          max_lines: 4,
          required_sections: ['当前状态', '关键原因', '下一步'],
          one_sentence_per_section: true,
          max_bullets_per_section: 1,
          preferred_sentence_count: 3,
          forbidden_items: [
            '长篇阶段说明',
            '协议推进细节',
            '文件路径或文件清单',
            '对内说明、内部注释或实现者自述',
          ],
        },
      },
    },
  }), {
    userInput: runState?.trigger?.latest_user_input || runState?.trigger?.raw_input || null,
  });
}

function buildApprovalGateTurn(targetDir, status, currentArtifacts, snapshot = null) {
  const activeSnapshot = snapshot || createWorkflowSnapshot(targetDir, { status, currentArtifacts });
  const pendingGate = currentArtifacts.run?.pending_gate || null;
  const gateContext = currentArtifacts.run?.gate_context || null;
  const flowDefinition = getSnapshotFlowDefinition(activeSnapshot, currentArtifacts.run?.flow?.id || DEFAULT_FLOW_ID);
  const reviewPolicy = normalizeReviewPolicy(currentArtifacts.run?.review_policy || currentArtifacts.run?.plan?.review_policy || null);
  const approvalGates = buildEffectiveApprovalGates(flowDefinition.id, currentArtifacts.run?.plan?.approval_gates || flowDefinition.approval_gates, reviewPolicy);
  const resumeRole = gateContext?.resume_to_role || inferPendingGateResumeRole(targetDir, currentArtifacts.run, flowDefinition, pendingGate);
  const gateDescription = describeApprovalGate(pendingGate, resumeRole);
  const useCompactArchiveGate = pendingGate === 'before-archive';
  const orchestratorGuidance = useCompactArchiveGate
    ? {
        approval_contract: {
          gates: approvalGates,
          pending_gate: pendingGate,
          expected_gate: pendingGate,
          approve_resume_to_role: resumeRole,
        },
        orchestration_contract: {
          selected_flow: flowDefinition.id,
          delivery_profile: currentArtifacts.run?.delivery_profile || null,
          artifact_profile: currentArtifacts.run?.artifact_profile || null,
          change_id: currentArtifacts.run?.task?.change_id || null,
          required_experts: flowDefinition.required_roles,
          required_artifacts: ['checklist.md', 'iterations.md'],
          handoff_policy: flowDefinition.handoff_policy,
          completion_policy: '归档确认只需基于当前检查结论与残留风险做放行决策',
        },
      }
    : buildOrchestratorGuidance(
        targetDir,
        currentArtifacts.run,
        currentArtifacts.run?.trigger?.latest_user_input || currentArtifacts.run?.trigger?.raw_input || null,
      );

  const reads = [
    buildFileTarget(targetDir, path.join('.ai-spec', 'current-run.json'), {
      required: true,
      label: 'current run-state',
    }),
  ];

  if (!useCompactArchiveGate && currentArtifacts.run?.artifacts?.proposal) {
    reads.push(buildReadableTarget(targetDir, currentArtifacts.run.artifacts.proposal, {
      label: 'proposal for approval review',
    }));
  }

  if (!useCompactArchiveGate && currentArtifacts.run?.artifacts?.tasks) {
    reads.push(buildReadableTarget(targetDir, currentArtifacts.run.artifacts.tasks, {
      label: 'tasks for approval review',
    }));
  }
  if (!useCompactArchiveGate && currentArtifacts.run?.artifacts?.specs) {
    reads.push(buildReadableTarget(targetDir, currentArtifacts.run.artifacts.specs, {
      label: 'specs for approval review',
    }));
  }
  if (!useCompactArchiveGate && currentArtifacts.run?.artifacts?.design) {
    reads.push(buildReadableTarget(targetDir, currentArtifacts.run.artifacts.design, {
      label: 'design for approval review',
    }));
  }
  if (pendingGate === 'before-archive') {
    if (currentArtifacts.run?.artifacts?.checklist) {
      reads.push(buildReadableTarget(targetDir, currentArtifacts.run.artifacts.checklist, {
        label: 'checklist for archive review',
      }));
    }
    if (currentArtifacts.run?.artifacts?.iterations) {
      reads.push(buildReadableTarget(targetDir, currentArtifacts.run.artifacts.iterations, {
        label: 'iterations for archive review',
      }));
    }
  }

  return attachProtocolContracts(attachActorPresentation({
    kind: 'ai-protocol-turn',
    status: 'blocked',
    mode: 'approval-gate',
    actor: {
      id: 'task-orchestrator',
      type: 'orchestrator',
    },
    command: '/spec-continue',
    reason: `run is waiting at approval gate "${pendingGate}"`,
    summary: buildSummary(status, currentArtifacts.run, targetDir),
    input: {
      user_request: currentArtifacts.run?.trigger?.raw_input || null,
      pending_gate: pendingGate,
      current_role: currentArtifacts.run?.current_role || null,
      delivery_profile: currentArtifacts.run?.delivery_profile || null,
      artifact_profile: currentArtifacts.run?.artifact_profile || null,
    },
    reads: dedupeTargets(reads),
    writes: [],
    expected_output: [
      `当前停在 ${pendingGate}，等待人工确认`,
      '只用简洁摘要告诉用户当前状态、关键原因、下一步',
      gateDescription.nextOutput,
    ],
    guidance: {
      ...orchestratorGuidance,
      approval_gate: {
        gate: pendingGate,
        gate_id: gateContext?.gate_id || pendingGate,
        status: 'waiting-approval',
        required_user_action: gateContext?.required_user_action || gateDescription.requiredUserAction,
        blocked_rule: gateDescription.blockedRule,
        blocked_reason: gateContext?.blocked_reason || gateDescription.blockedReason,
        blocked_by_role: gateContext?.blocked_by_role || currentArtifacts.run?.current_role || null,
        resume_to_role: resumeRole,
        resume_rule: gateDescription.resumeRule,
        review_policy: reviewPolicy,
        user_report_contract: {
          style: 'approval-compact',
          max_lines: 4,
          required_sections: ['当前状态', '关键原因', '下一步'],
          one_sentence_per_section: true,
          max_bullets_per_section: 1,
          preferred_sentence_count: 3,
          forbidden_items: [
            '长篇阶段说明',
            '逐条罗列 proposal.md / spec.md / tasks.md 内容',
            '逐条列现有仓库文件路径',
            '输出交付结论 / 验证结果 / 残留风险三段式',
            '协议执行过程描述',
            '命令行细节或多步操作解释',
            '对内说明、内部注释或实现者自述',
            '任何本地执行提示或额外操作指南',
          ],
        },
      },
    },
  }), {
    userInput: currentArtifacts.run?.trigger?.latest_user_input || currentArtifacts.run?.trigger?.raw_input || null,
  });
}

function buildUpdateReviewTurn(targetDir, status, currentArtifacts, snapshot = null) {
  const activeSnapshot = snapshot || createWorkflowSnapshot(targetDir, { status, currentArtifacts });
  const runtimePaths = activeSnapshot.runtimePaths;
  const flowDefinition = getSnapshotFlowDefinition(activeSnapshot, currentArtifacts.run?.flow?.id || DEFAULT_FLOW_ID);
  const reviewPolicy = normalizeReviewPolicy(currentArtifacts.run?.review_policy || currentArtifacts.run?.plan?.review_policy || null);
  const approvalGates = buildEffectiveApprovalGates(flowDefinition.id, currentArtifacts.run?.plan?.approval_gates || flowDefinition.approval_gates, reviewPolicy);
  const recentUpdates = Array.isArray(currentArtifacts.run?.input_updates)
    ? currentArtifacts.run.input_updates.slice(-3)
    : [];
  const latestInput = currentArtifacts.run?.trigger?.latest_user_input || null;
  const pendingGate = currentArtifacts.run?.pending_gate || null;
  const gateContext = currentArtifacts.run?.gate_context || null;
  const approvalIntent = pendingGate === 'before-archive'
    ? (looksLikeArchiveApproveInput(latestInput) || looksLikeApprovalInput(latestInput))
    : (pendingGate ? looksLikeApprovalInput(latestInput) : false);
  const archiveSkipIntent = pendingGate === 'before-archive' ? looksLikeArchiveSkipInput(latestInput) : false;
  const changeDecision = currentArtifacts.run?.incremental_update || classifyChangeImpact(currentArtifacts.run, latestInput);
  const gateReconcileIntent = Boolean(
    pendingGate
    && !approvalIntent
    && !archiveSkipIntent
    && changeDecision?.target_role
    && (
      changeDecision?.change_impact === 'archive-fix'
      || changeDecision?.change_impact === 'scope-delta'
      || (changeDecision?.change_impact === 'patch' && changeDecision?.target_role === 'requirement-analyst')
    )
  );
  const resumeRole = gateContext?.resume_to_role || inferPendingGateResumeRole(targetDir, currentArtifacts.run, flowDefinition, pendingGate);
  const useCompactArchiveGate = pendingGate === 'before-archive' && (approvalIntent || archiveSkipIntent);
  const orchestratorGuidance = useCompactArchiveGate
    ? {
        approval_contract: {
          gates: approvalGates,
          pending_gate: pendingGate,
          expected_gate: pendingGate,
          approve_resume_to_role: resumeRole,
        },
        orchestration_contract: {
          selected_flow: flowDefinition.id,
          delivery_profile: currentArtifacts.run?.delivery_profile || null,
          artifact_profile: currentArtifacts.run?.artifact_profile || null,
          change_id: currentArtifacts.run?.task?.change_id || null,
          required_experts: flowDefinition.required_roles,
          required_artifacts: ['checklist.md', 'iterations.md'],
          handoff_policy: flowDefinition.handoff_policy,
          completion_policy: '归档确认已完成，只需生成最小 runtime-action 执行放行或结束',
        },
      }
    : buildOrchestratorGuidance(targetDir, currentArtifacts.run, latestInput);
  const reads = [
    ...buildCommandTargets(targetDir, CONTINUE_INSTRUCTION_FILES),
    buildFileTarget(targetDir, path.join('.ai-spec', 'current-run.json'), {
      required: true,
      label: 'current run-state',
    }),
  ];

  if (!useCompactArchiveGate && currentArtifacts.dispatch) {
    reads.push(
      buildFileTarget(targetDir, getExistingRelPath(runtimePaths.currentDispatch), {
        required: true,
        label: 'current expert dispatch',
      }),
    );
  }

  if (!useCompactArchiveGate && currentArtifacts.execution) {
    reads.push(
      buildFileTarget(targetDir, getExistingRelPath(runtimePaths.currentExecutionJson), {
        required: true,
        label: 'current expert execution',
      }),
    );
  }

  return attachProtocolContracts(attachActorPresentation({
    kind: 'ai-protocol-turn',
    status: 'ready',
    mode: 'update-review',
    actor: {
      id: 'task-orchestrator',
      type: 'orchestrator',
    },
    command: '/spec-update',
    reason: 'new user input has been appended; task-orchestrator must reconcile it before normal progression',
    summary: buildSummary(status, currentArtifacts.run, targetDir),
    input: {
      user_request: currentArtifacts.run?.trigger?.raw_input || null,
      latest_user_input: currentArtifacts.run?.trigger?.latest_user_input || null,
      input_updates: recentUpdates,
      current_role: currentArtifacts.run?.current_role || null,
      pending_gate: currentArtifacts.run?.pending_gate || null,
      change_context: changeDecision?.change_context || null,
      route_decision: changeDecision?.route_decision || null,
      trace_mode: changeDecision?.trace_mode || null,
      change_impact: changeDecision?.change_impact || null,
      reconcile_strategy: changeDecision?.reconcile_strategy || null,
      delivery_profile: currentArtifacts.run?.delivery_profile || null,
      artifact_profile: currentArtifacts.run?.artifact_profile || null,
    },
    reads: dedupeTargets(reads),
    writes: [
      buildFileTarget(targetDir, runtimePaths.tmpTaskOrchestratorTurn.relPath, {
        required: true,
        label: 'task-orchestrator turn inbox',
      }),
    ],
    expected_output: approvalIntent
      ? [
          '将用户的审批意见吸收到运行态',
          `针对 ${pendingGate} 产出 action=approve 的最小 runtime-action`,
          '审批通过后恢复到下一位可执行专家，而不是继续停在 waiting-approval',
        ]
      : gateReconcileIntent
      ? [
          '将用户的增量修订意见吸收到运行态',
          `生成 action=handoff 的 runtime-action，并 clear_pending_gate=true，回退到 ${changeDecision?.target_role || '对应专家'} 做增量修订`,
          '增量修订完成后，再按主流程重新回到对应审批门禁，而不是停留在旧 gate',
        ]
      : archiveSkipIntent
      ? [
          '将用户的“不归档”决定吸收到运行态',
          '针对 before-archive 产出 action=complete 的最小 runtime-action',
          '不进入归档专家，直接结束当前运行',
        ]
      : [
          '吸收新的用户输入并更新当前假设、边界或交接策略',
          changeDecision?.reconcile_strategy === 'suggest-new-change'
            ? '给出“建议新建 change”的最小结论，不要把明显超范围输入吞进当前 run'
            : `按照 ${changeDecision?.reconcile_strategy || 'in-place'} 策略决定是否回退到 ${changeDecision?.target_role || '当前专家'}`,
          changeDecision?.artifacts_to_update?.length > 0
            ? `只增量更新这些产物：${changeDecision.artifacts_to_update.join('、')}`
            : '若补充输入会影响当前阶段，优先产出最小 runtime-action 或 gate 结论',
          '处理完成后清除 pending_input_update 标记',
    ],
    guidance: {
      ...orchestratorGuidance,
      update_contract: {
        latest_user_input: latestInput,
        change_context: changeDecision?.change_context || null,
        route_decision: changeDecision?.route_decision || null,
        trace_mode: changeDecision?.trace_mode || null,
        change_impact: changeDecision?.change_impact || null,
        reconcile_strategy: changeDecision?.reconcile_strategy || null,
        artifacts_to_update: changeDecision?.artifacts_to_update || [],
        reopen_reason: changeDecision?.reopen_reason || null,
        target_role: changeDecision?.target_role || null,
        handoff_gate: changeDecision?.handoff_gate || null,
        delta_rules: [
          'proposal/specs/design/tasks/checklist/iterations 只改受影响章节，不整份重写',
          '优先在同一 change 内吸收 patch / scope-delta / archive-fix',
          '只有明显跨范围时才建议新建 change',
        ],
      },
      approval_gate: pendingGate
        ? {
            gate: pendingGate,
            gate_id: gateContext?.gate_id || pendingGate,
            blocked_by_role: gateContext?.blocked_by_role || currentArtifacts.run?.current_role || null,
            blocked_reason: gateContext?.blocked_reason || null,
            required_user_action: gateContext?.required_user_action || null,
            approval_intent_detected: approvalIntent,
            archive_skip_intent_detected: archiveSkipIntent,
            archive_fix_intent_detected: pendingGate === 'before-archive' && changeDecision?.change_impact === 'archive-fix',
            latest_user_input: latestInput,
            resume_to_role: resumeRole,
            review_policy: reviewPolicy,
            next_step: approvalIntent
              ? `生成 action=approve 的 runtime-action，清除 pending_gate，并恢复到 ${resumeRole || '下一位专家'}`
              : gateReconcileIntent
              ? `生成 action=handoff 的 runtime-action，clear_pending_gate=true，并回退到 ${changeDecision?.target_role || '对应专家'} 做增量修订`
              : archiveSkipIntent
              ? '生成 action=complete 的 runtime-action，保持现有交付结果并结束当前运行'
              : changeDecision?.change_impact === 'archive-fix'
              ? `生成 action=handoff 的 runtime-action，清除 pending_gate，并回退到 ${changeDecision?.target_role || 'frontend-implementer'} 修正后再回归归档确认`
              : '若未获得明确批准，保持 waiting-approval，不要放行到实现阶段',
          }
        : null,
      orchestrator_contract: {
        write_to: runtimePaths.tmpTaskOrchestratorTurn.relPath,
        allowed_kinds: ['run-plan', 'task-orchestrator-runtime-action'],
        allowed_actions: ['handoff', 'approve', 'resume', 'gate-blocked', 'complete', 'fail', 'cancel'],
      },
    },
  }), {
    userInput: currentArtifacts.run?.trigger?.latest_user_input || null,
  });
}

function buildExpertTurn(targetDir, status, currentArtifacts, snapshot = null) {
  const activeSnapshot = snapshot || createWorkflowSnapshot(targetDir, { status, currentArtifacts });
  const dispatch = currentArtifacts.dispatch;
  if (!dispatch) {
    throw new Error('Cannot build expert turn without a recorded current expert dispatch');
  }
  const runtimePaths = activeSnapshot.runtimePaths;

  const roleSource = dispatch.role?.source || null;
  const roleDefinition = loadRoleDefinition(targetDir, roleSource) || {
    id: dispatch.role?.id || null,
    name: dispatch.role?.name || null,
    source: roleSource,
    preferred_skills: Array.isArray(dispatch.role?.preferred_skills) ? dispatch.role.preferred_skills : [],
    reads: [],
    writes: [],
    handoff_to: [],
  };

  const context = {
    changeId: dispatch.task?.change_id || currentArtifacts.run?.task?.change_id || null,
    runId: dispatch.run_id || currentArtifacts.run?.run_id || null,
  };
  const flowId = dispatch.flow?.id || currentArtifacts.run?.flow?.id || DEFAULT_FLOW_ID;
  const deliveryProfile = currentArtifacts.run?.delivery_profile || 'standard';
  const artifactProfile = currentArtifacts.run?.artifact_profile || inferArtifactProfile({
    deliveryProfile,
  });
  const projectProfile = activeSnapshot.projectProfile;
  const repoConventions = activeSnapshot.repoConventions;
  const flowDefinition = getSnapshotFlowDefinition(activeSnapshot, flowId);
  const projectContextGuidance = buildProjectContextGuidance(targetDir, projectProfile, currentArtifacts.run, repoConventions);
  const frontendAutoFixContract = dispatch.role?.id === 'frontend-implementer'
    ? buildFrontendAutoFixContract(targetDir, currentArtifacts.run)
    : null;
  const autoFixActive = Boolean(frontendAutoFixContract?.active);
  const flowRoleTargets = resolveFlowRoleTargets(flowId, dispatch.role?.id, currentArtifacts.run);
  const roleReadSpecs = flowRoleTargets?.reads || roleDefinition.reads;
  const roleWriteSpecs = flowRoleTargets?.writes || roleDefinition.writes;

  const reads = [
    buildFileTarget(targetDir, path.join('.ai-spec', 'current-run.json'), {
      required: true,
      label: 'current run-state',
    }),
    buildFileTarget(targetDir, getExistingRelPath(runtimePaths.currentDispatch), {
      required: true,
      label: 'current expert dispatch',
    }),
    buildFileTarget(targetDir, runtimePaths.repoMap.relPath, {
      label: 'lightweight repo map',
    }),
  ];

  for (const item of roleReadSpecs) {
    const resolvedValue = resolveTemplateVariables(item, context);
    if (autoFixActive && resolvedValue.startsWith('openspec/')) {
      continue;
    }
    if (resolvedValue === '.agents/rules/' || resolvedValue === '.agents/rules') {
      continue;
    }
    if (resolvedValue === 'code' || resolvedValue === 'implementation-notes') {
      reads.push(buildSymbolicTarget(resolvedValue));
    } else {
      const isProjectContext = resolvedValue === 'context/PROJECT.md';
      const isOpenSpecPath = resolvedValue.startsWith('openspec/');
      const isConcretePath = resolvedValue.includes('/');
      if (isProjectContext || isOpenSpecPath || isConcretePath) {
        reads.push(buildReadableTarget(targetDir, resolvedValue));
      }
    }
  }

  const writes = dispatch.role?.id === 'archive-change'
    ? []
    : [
        buildFileTarget(targetDir, runtimePaths.tmpCurrentExecution.relPath, {
          required: true,
          label: 'expert execution inbox',
        }),
      ];

  for (const item of roleWriteSpecs) {
    writes.push(convertTargetSpec(targetDir, item, context));
  }

  const expectedOutput = Array.isArray(dispatch.execution?.expected_output) && dispatch.execution.expected_output.length > 0
    ? [...dispatch.execution.expected_output]
    : [];
  if (autoFixActive) {
    expectedOutput.push('只修复 verification 失败步骤对应的问题，不新增功能或顺手重构');
    expectedOutput.push('完成修复后重新产出 verification，并准备再次推进协议');
  }
  for (const item of buildExpertExpectedOutput(dispatch, writes, runtimePaths, deliveryProfile)) {
    expectedOutput.push(item);
  }
  const selectedSkills = selectRoleSkills(
    targetDir,
    dispatch.role?.id,
    injectSuperpowersSkills(
      targetDir,
      dispatch.role?.id,
      Array.isArray(dispatch.execution?.skills) && dispatch.execution.skills.length > 0
        ? dispatch.execution.skills
        : roleDefinition.preferred_skills,
    ),
    deliveryProfile,
  );
  const roleRuleContract = buildRoleRuleContract(
    targetDir,
    dispatch.role?.id,
    deliveryProfile,
    projectProfile,
    repoConventions,
  );
  const roleSkillContract = buildRoleSkillContract(
    targetDir,
    dispatch.role?.id,
    selectedSkills,
    deliveryProfile,
    projectProfile,
    repoConventions,
    dispatch.task?.raw_goal || currentArtifacts.run?.trigger?.raw_input || null,
    currentArtifacts.run,
    context.changeId,
  );
  const roleSpecificContract = dispatch.role?.id
    ? buildRoleSpecificContract(
        dispatch.role?.id,
        roleRuleContract,
        roleSkillContract,
        repoConventions,
        deliveryProfile,
        flowId,
        targetDir,
        projectContextGuidance,
        currentArtifacts.run,
        context.changeId,
      )
    : null;
  const archivePreflightBlocked = dispatch.role?.id === 'archive-change'
    && roleSpecificContract?.archive_preflight
    && roleSpecificContract.archive_preflight.ready === false;
  const implementationContract = dispatch.role?.id === 'frontend-implementer'
    ? {
        ...(roleSpecificContract || {}),
        latest_verification: currentArtifacts.run?.verification || null,
        auto_fix: frontendAutoFixContract,
      }
    : null;
  const projectContextRead = repoConventions.projectContextPath
    ? buildReadableTarget(targetDir, repoConventions.projectContextPath, {
        label: 'project stable context',
      })
    : null;
  const nextRole = dispatch.execution?.next_role || resolveNextRole(targetDir, flowId, dispatch.role?.id, roleDefinition);
  if (projectContextRead) {
    reads.push(projectContextRead);
  }
  if (dispatch.role?.id === 'code-guardian') {
    for (const item of buildCodeGuardianEvidenceTargets(targetDir, repoConventions)) {
      reads.push(item);
    }
  }
  const dedupedReads = dedupeTargets(reads);
  const dedupedWrites = dedupeTargets(writes);
  const compactContext = buildCompactContext(
    roleRuleContract,
    roleSkillContract,
    repoConventions,
    currentArtifacts.run,
    dedupedWrites.filter((item) => item.rel_path !== runtimePaths.tmpCurrentExecution.relPath),
  );

  return attachProtocolContracts(applySuperpowersPresentation(attachActorPresentation({
    kind: 'ai-protocol-turn',
    status: archivePreflightBlocked ? 'blocked' : 'ready',
    mode: 'execute',
    actor: {
      id: dispatch.role.id,
      name: dispatch.role.name || roleDefinition.name || null,
      type: 'expert',
      source: roleDefinition.source || null,
    },
    command: archivePreflightBlocked ? null : dispatch.role.id,
    reason: archivePreflightBlocked
      ? 'archive-preflight 检查未通过，需先补齐缺失产物后才能执行归档命令'
      : status.next_expected.reason,
    summary: buildSummary(status, currentArtifacts.run, targetDir),
    input: {
      user_request: dispatch.task?.raw_goal || currentArtifacts.run?.trigger?.raw_input || null,
      change_id: context.changeId,
      flow_id: flowId,
      current_role: dispatch.execution?.current_role || dispatch.role.id,
      next_role: nextRole,
      delivery_profile: deliveryProfile,
      artifact_profile: artifactProfile,
    },
    preferred_skills: selectedSkills,
    reads: dedupedReads,
    writes: dedupedWrites,
    expected_output: [...new Set(expectedOutput)],
    execution_contract: buildExecutionContract(targetDir, runtimePaths, dispatch, roleDefinition, dedupedWrites, deliveryProfile),
    guidance: {
      route_decision: buildRunRouteDecision(
        targetDir,
        currentArtifacts.run,
        currentArtifacts.run?.trigger?.latest_user_input || currentArtifacts.run?.trigger?.raw_input || null,
        flowDefinition,
      ),
      project_context: projectContextGuidance,
      repo_conventions: buildRepoConventionGuidance(repoConventions),
      role: buildRoleGuidance(dispatch.role?.id, deliveryProfile),
      role_rule_contract: roleRuleContract,
      role_skill_contract: roleSkillContract,
      artifact_contract: roleSpecificContract?.artifact_contract || [],
      skill_selection_policy: roleSpecificContract?.skill_selection_policy || null,
      handoff_checklist: roleSpecificContract?.handoff_checklist || [],
      optional_role_triggers: roleSpecificContract?.optional_role_triggers || [],
      bugfix_route_contract: roleSpecificContract?.bugfix_route_contract || null,
      quick_fix_boundary: roleSpecificContract?.quick_fix_boundary || null,
      upgrade_to_full_change_when: roleSpecificContract?.upgrade_to_full_change_when || null,
      bugfix_blocking_checks: roleSpecificContract?.bugfix_blocking_checks || null,
      archive_preflight: roleSpecificContract?.archive_preflight || null,
      analysis_contract: dispatch.role?.id === 'requirement-analyst'
        ? roleSpecificContract
        : null,
      implementation_contract: implementationContract,
      review_contract: dispatch.role?.id === 'code-guardian'
        ? {
            ...(roleSpecificContract || {}),
            latest_verification: currentArtifacts.run?.verification || null,
            latest_auto_fix: currentArtifacts.run?.auto_fix || null,
          }
        : null,
      repo_map_source: '.ai-spec/repo-map.json',
      rule_hints: buildRuleHints(dispatch.role?.id, deliveryProfile, roleRuleContract),
      compact_context: compactContext,
      search_policy: buildSearchPolicy(),
      superpowers_contract: buildSuperpowersContract(targetDir, dispatch.role?.id),
      skills: buildSkillGuidance(
        selectedSkills.map((item) => (typeof item === 'string' ? { id: item } : item)),
      ),
      openspec_rules: buildOpenSpecGuidance(targetDir, dispatch.role?.id, deliveryProfile, flowId),
    },
    handoff_to: nextRole ? [nextRole] : roleDefinition.handoff_to,
  })), {
    userInput: currentArtifacts.run?.trigger?.latest_user_input || currentArtifacts.run?.trigger?.raw_input || null,
  });
}

function buildProtocolTurn(options = {}) {
  const targetDir = resolveTargetDir(options.target);
  const status = runner.buildStatus(targetDir);
  const userInput = options.userInput || null;

  if (status.pending_inputs.length > 0) {
    return attachProtocolContracts(attachActorPresentation({
      kind: 'ai-protocol-turn',
      status: 'blocked',
      mode: 'consume-inbox',
      actor: {
        id: 'runner',
        type: 'runtime',
      },
      command: 'advance-runner',
      reason: status.next_expected.reason,
      summary: buildSummary(status, null, targetDir),
      input: {
        pending_inputs: status.pending_inputs,
      },
      reads: [],
      writes: [],
      expected_output: [],
    }), { userInput });
  }

  if (!status.current.run_id) {
    return buildStartTurn(targetDir, userInput, options);
  }

  if (status.next_expected.producer === null) {
    if (userInput) {
      return buildStartTurn(targetDir, userInput, options);
    }

    return attachProtocolContracts({
      kind: 'ai-protocol-turn',
      status: 'terminal',
      mode: 'terminal',
      actor: null,
      command: null,
      reason: status.next_expected.reason,
      summary: buildSummary(status, null, targetDir),
      input: {
        user_request: null,
      },
      reads: [],
      writes: [],
      expected_output: [],
    }, { userInput });
  }

  const snapshot = createWorkflowSnapshot(targetDir, { status });
  const currentArtifacts = snapshot.currentArtifacts;

  if (String(currentArtifacts.run?.status || '').trim().toLowerCase() === 'paused') {
    return buildPausedTurn(targetDir, status, currentArtifacts);
  }

  if (currentArtifacts.run?.pending_input_update) {
    return buildUpdateReviewTurn(targetDir, status, currentArtifacts, snapshot);
  }

  if (String(currentArtifacts.run?.status || '').trim().toLowerCase() === 'waiting-confirm') {
    return buildConfirmGateTurn(targetDir, status, currentArtifacts);
  }

  if (status.current.execution_role) {
    return buildContinueTurn(targetDir, status, currentArtifacts, snapshot);
  }

  if (status.current.dispatch_role) {
    return buildExpertTurn(targetDir, status, currentArtifacts, snapshot);
  }

  if (status.current.pending_gate) {
    return buildApprovalGateTurn(targetDir, status, currentArtifacts, snapshot);
  }

  return buildDispatchTurn(targetDir, status, currentArtifacts);
}

function advanceProtocolStep(options = {}) {
  const targetDir = resolveTargetDir(options.target);
  const before = runner.buildStatus(targetDir);
  let advanced = null;

  if (String(before.current.run_status || '').trim().toLowerCase() === 'paused') {
    advanced = {
      kind: 'runtime-resume-fast-path',
      applied: {
        adapter_action: 'resume',
      },
      runtime: resumeRunState({
        target: targetDir,
        clearPendingGate: false,
        message: '用户继续推进，恢复到上一个停点。',
      }),
    };
  }

  if (!advanced && before.pending_inputs.length > 0) {
    advanced = runner.advanceRunner({
      target: targetDir,
    });
  }

  const result = {
    kind: 'ai-protocol-step',
    target: targetDir,
    advanced,
    runner_status: runner.buildStatus(targetDir),
    turn: buildProtocolTurn({
      target: targetDir,
      userInput: options.userInput || null,
      mode: options.mode || null,
      reviewPolicy: options.reviewPolicy || null,
      flowId: options.flowId || null,
    }),
  };

  return finalizeProtocolResult(targetDir, result);
}

function statusProtocolStep(options = {}) {
  const targetDir = resolveTargetDir(options.target);
  return {
    kind: 'ai-protocol-status',
    target: targetDir,
    runner_status: runner.buildStatus(targetDir),
    turn: buildProtocolTurn({
      target: targetDir,
      userInput: null,
    }),
  };
}

function stopProtocolStep(options = {}) {
  const targetDir = resolveTargetDir(options.target);
  const currentArtifacts = loadCurrentArtifacts(targetDir);
  if (!currentArtifacts.run) {
    return {
      kind: 'ai-protocol-stop',
      target: targetDir,
      stopped: null,
      runner_status: runner.buildStatus(targetDir),
      turn: buildProtocolTurn({
        target: targetDir,
        userInput: null,
      }),
    };
  }

  if (['success', 'failed', 'cancelled'].includes(String(currentArtifacts.run.status || '').toLowerCase())) {
    return {
      kind: 'ai-protocol-stop',
      target: targetDir,
      stopped: null,
      runner_status: runner.buildStatus(targetDir),
      turn: buildProtocolTurn({
        target: targetDir,
        userInput: null,
      }),
    };
  }

  const stopped = pauseRunState({
    target: targetDir,
    message: options.message || '用户主动暂停当前运行。',
  });

  return {
    kind: 'ai-protocol-stop',
    target: targetDir,
    stopped,
    runner_status: runner.buildStatus(targetDir),
    turn: buildProtocolTurn({
      target: targetDir,
      userInput: null,
    }),
  };
}

function tryApplyBeforeArchiveFastPath(targetDir, userInput) {
  const currentArtifacts = loadCurrentArtifacts(targetDir);
  const runState = currentArtifacts.run || null;
  if (!runState || runState.pending_gate !== 'before-archive') {
    return null;
  }

  const archiveSkipIntent = looksLikeArchiveSkipInput(userInput);
  const archiveApproveIntent = !archiveSkipIntent && (
    looksLikeArchiveApproveInput(userInput) || looksLikeApprovalInput(userInput)
  );

  if (!archiveSkipIntent && !archiveApproveIntent) {
    return null;
  }

  const updated = recordRunInputUpdate({
    target: targetDir,
    userInput,
    source: 'protocol-update',
  });

  if (archiveSkipIntent) {
    const completed = completeRunState({
      target: targetDir,
      runId: updated.state.run_id,
      fromRole: updated.state.current_role || 'code-guardian',
      toRole: updated.state.current_role || 'code-guardian',
      status: 'success',
      message: '用户选择暂不归档，当前运行按现有交付结果结束。',
      clearPendingGate: true,
    });

    return {
      executed: true,
      action: 'complete-without-archive',
      updated,
      final_state: completed.state,
      archived_to: null,
    };
  }

  const approved = approveRunState({
    target: targetDir,
    runId: updated.state.run_id,
    gate: 'before-archive',
    toRole: 'archive-change',
    nextRole: null,
    message: '用户确认归档，进入 archive-change',
  });
  const archiveResult = archiveChange({
    target: targetDir,
    changeId: approved.state.task?.change_id || runState.task?.change_id || null,
    completeRun: true,
  });

  return {
    executed: true,
    action: 'archive-approved',
    updated,
    final_state: archiveResult.runtime_transition?.state || approved.state,
    archived_to: archiveResult.archived_to || null,
  };
}

function tryApplyApprovalGateFastPath(targetDir, userInput) {
  const snapshot = createWorkflowSnapshot(targetDir);
  const runState = snapshot.currentArtifacts.run || null;
  const pendingGate = runState?.pending_gate || null;
  if (
    !runState
    || String(runState.status || '').trim().toLowerCase() !== 'waiting-approval'
    || !['before-implementation', 'before-guardian'].includes(pendingGate)
    || !looksLikeApprovalInput(userInput)
  ) {
    return null;
  }

  const updated = recordRunInputUpdate({
    target: targetDir,
    userInput,
    source: 'protocol-update',
  });
  const flowDefinition = getSnapshotFlowDefinition(snapshot, updated.state?.flow?.id || runState.flow?.id || DEFAULT_FLOW_ID);
  const resumeRole = runState.gate_context?.resume_to_role
    || inferPendingGateResumeRole(targetDir, updated.state, flowDefinition, pendingGate);
  const advanced = runner.advanceRunnerWithRuntimeActionData({
    target: targetDir,
    source: `protocol-update-fast-path:${pendingGate}`,
    payloadData: {
      schema_version: 1,
      kind: 'task-orchestrator-runtime-action',
      action: 'approve',
      gate: pendingGate,
      to_role: resumeRole,
      message: pendingGate === 'before-implementation'
        ? '用户确认进入 frontend-implementer'
        : '用户确认进入 code-guardian',
    },
  });
  const finalState = loadCurrentArtifacts(targetDir).run;

  return {
    executed: true,
    action: pendingGate === 'before-implementation'
      ? 'approve-before-implementation'
      : 'approve-before-guardian',
    updated,
    advanced,
    final_state: finalState,
  };
}

function tryOpenFollowupPatchFastPath(targetDir, userInput) {
  const currentArtifacts = loadCurrentArtifacts(targetDir);
  const runState = currentArtifacts.run || null;
  if (!runState || String(runState.status || '').trim().toLowerCase() !== 'success') {
    return null;
  }

  const changeDecision = classifyChangeImpact(runState, userInput);
  if (changeDecision.change_impact !== 'followup-patch') {
    return null;
  }

  const parentChangeId = runState.task?.change_id || runState.anchor?.task?.change_id || null;
  const patchChangeId = createFollowupPatchChangeId(parentChangeId, userInput);
  const firstHandoff = changeDecision.target_role === 'requirement-analyst'
    ? 'requirement-analyst'
    : 'frontend-implementer';
  const flowDefinition = loadFlowDefinition(targetDir, runState.flow?.id || DEFAULT_FLOW_ID);
  const reviewPolicy = normalizeReviewPolicy(runState.review_policy || runState.plan?.review_policy || null);
  const bootstrap = bootstrapRunState({
    target: targetDir,
    payloadData: {
      kind: 'run-plan',
      schema_version: 1,
      mode: DEFAULT_RUN_MODE,
      review_policy: reviewPolicy,
      status: 'planned',
      delivery_profile: runState.delivery_profile || 'standard',
      artifact_profile: runState.artifact_profile || 'full',
      complexity: runState.complexity || runState.task?.complexity || 'medium',
      task: {
        type: 'followup-patch',
        change_id: patchChangeId,
        parent_change_id: parentChangeId,
        raw_input: `针对已归档变更 ${parentChangeId || '(unknown)'} 的补丁修正：${userInput}`,
        risk_level: runState.task?.risk_level || 'low',
        change_context: 'archived-change',
        route_decision: 'followup-patch',
        trace_mode: 'followup-change',
        change_impact: 'followup-patch',
        reconcile_strategy: 'followup-patch',
        artifacts_to_update: changeDecision.artifacts_to_update || [],
        reopen_reason: changeDecision.reopen_reason || null,
      },
      flow: {
        id: runState.flow?.id || DEFAULT_FLOW_ID,
        name: runState.flow?.name || flowDefinition.name,
        source: runState.flow?.source || flowDefinition.source,
      },
      plan: {
        required_roles: flowDefinition.required_roles,
        activated_optional_roles: /测试|回归/.test(String(userInput || '')) ? ['unit-test-specialist'] : [],
        skipped_optional_roles: [],
        approval_gates: buildEffectiveApprovalGates(flowDefinition.id, ['before-archive'], reviewPolicy),
        first_handoff: firstHandoff,
        delivery_profile: runState.delivery_profile || 'standard',
        artifact_profile: runState.artifact_profile || 'full',
        review_policy: reviewPolicy,
      },
      assumptions: [
        `这是针对已归档变更 ${parentChangeId || '(unknown)'} 的 follow-up patch`,
        '默认沿用原变更的项目上下文与目录约定，只做最小补丁修正',
      ],
      missing_inputs: [],
      artifacts: runState.artifacts || null,
    },
    changeContext: 'archived-change',
    routeDecision: 'followup-patch',
    traceMode: 'followup-change',
    parentChangeId,
    changeImpact: 'followup-patch',
    reconcileStrategy: 'followup-patch',
    artifactsToUpdate: changeDecision.artifacts_to_update || [],
    reopenReason: changeDecision.reopen_reason || null,
  });

  return {
    executed: true,
    action: 'followup-patch-opened',
    bootstrap,
  };
}

function updateProtocolInput(options = {}) {
  const targetDir = resolveTargetDir(options.target);
  const userInput = options.userInput || null;
  if (!userInput) {
    throw new Error('Missing required argument: --user-input <text>');
  }

  const currentArtifacts = loadCurrentArtifacts(targetDir);
  if (String(currentArtifacts.run?.status || '').trim().toLowerCase() === 'paused' && looksLikeResumeInput(userInput)) {
    const resumed = resumeRunState({
      target: targetDir,
      clearPendingGate: false,
      message: '用户通过补充输入恢复当前运行。',
    });
    return finalizeProtocolResult(targetDir, {
      kind: 'ai-protocol-input-update',
      target: targetDir,
      updated: null,
      fast_path: {
        executed: true,
        action: 'resume-paused-run',
        archived_to: null,
        run_status: resumed.state?.status || null,
        current_role: resumed.state?.current_role || null,
        requires_followup_turn: true,
      },
      runner_status: runner.buildStatus(targetDir),
      turn: buildProtocolTurn({
        target: targetDir,
        userInput: null,
      }),
    });
  }

  if (
    String(currentArtifacts.run?.status || '').trim().toLowerCase() === 'waiting-confirm' &&
    (looksLikeApprovalInput(userInput) || looksLikeResumeInput(userInput) || looksLikeConfirmProceedInput(userInput))
  ) {
    const resumed = resumeRunState({
      target: targetDir,
      clearPendingGate: true,
      message: '用户确认当前方案，恢复继续推进。',
    });
    return finalizeProtocolResult(targetDir, {
      kind: 'ai-protocol-input-update',
      target: targetDir,
      updated: null,
      fast_path: {
        executed: true,
        action: 'confirm-resume',
        archived_to: null,
        run_status: resumed.state?.status || null,
        current_role: resumed.state?.current_role || null,
        requires_followup_turn: true,
      },
      runner_status: runner.buildStatus(targetDir),
      turn: buildProtocolTurn({
        target: targetDir,
        userInput: null,
      }),
    });
  }

  const approvalGateFastPath = tryApplyApprovalGateFastPath(targetDir, userInput);
  if (approvalGateFastPath) {
    return finalizeProtocolResult(targetDir, {
      kind: 'ai-protocol-input-update',
      target: targetDir,
      updated: approvalGateFastPath.updated,
      fast_path: {
        executed: true,
        action: approvalGateFastPath.action,
        archived_to: null,
        run_status: approvalGateFastPath.final_state?.status || null,
        current_role: approvalGateFastPath.final_state?.current_role || null,
        requires_followup_turn: true,
      },
      runner_status: runner.buildStatus(targetDir),
      turn: buildProtocolTurn({
        target: targetDir,
        userInput: null,
      }),
    });
  }

  const fastPath = tryApplyBeforeArchiveFastPath(targetDir, userInput);
  if (fastPath) {
    return finalizeProtocolResult(targetDir, {
      kind: 'ai-protocol-input-update',
      target: targetDir,
      updated: fastPath.updated,
      fast_path: {
        executed: true,
        action: fastPath.action,
        archived_to: fastPath.archived_to,
        run_status: fastPath.final_state?.status || null,
        current_role: fastPath.final_state?.current_role || null,
        requires_followup_turn: false,
      },
      runner_status: runner.buildStatus(targetDir),
      turn: buildProtocolTurn({
        target: targetDir,
        userInput: null,
      }),
    });
  }

  const followupPatch = tryOpenFollowupPatchFastPath(targetDir, userInput);
  if (followupPatch) {
    return finalizeProtocolResult(targetDir, {
      kind: 'ai-protocol-input-update',
      target: targetDir,
      updated: null,
      fast_path: {
        executed: true,
        action: followupPatch.action,
        archived_to: null,
        run_status: followupPatch.bootstrap.state?.status || null,
        current_role: followupPatch.bootstrap.state?.current_role || null,
        requires_followup_turn: true,
      },
      runner_status: runner.buildStatus(targetDir),
      turn: buildProtocolTurn({
        target: targetDir,
        userInput: null,
      }),
    });
  }

  const changeDecision = classifyChangeImpact(currentArtifacts.run, userInput);

  const updated = recordRunInputUpdate({
    target: targetDir,
    userInput,
    source: 'protocol-update',
    changeContext: changeDecision.change_context,
    routeDecision: changeDecision.route_decision,
    traceMode: changeDecision.trace_mode,
    changeImpact: changeDecision.change_impact,
    reconcileStrategy: changeDecision.reconcile_strategy,
    artifactsToUpdate: changeDecision.artifacts_to_update,
    reopenReason: changeDecision.reopen_reason,
    parentChangeId: currentArtifacts.run?.task?.parent_change_id || currentArtifacts.run?.task?.change_id || null,
    toRole: changeDecision.target_role,
    handoffGate: changeDecision.handoff_gate,
  });

  return finalizeProtocolResult(targetDir, {
    kind: 'ai-protocol-input-update',
    target: targetDir,
    updated,
    fast_path: {
      executed: false,
      action: null,
      archived_to: null,
      run_status: updated.state?.status || null,
      current_role: updated.state?.current_role || null,
      requires_followup_turn: true,
    },
    runner_status: runner.buildStatus(targetDir),
    turn: buildProtocolTurn({
      target: targetDir,
      userInput,
    }),
  });
}

module.exports = {
  buildProtocolTurn,
  advanceProtocolStep,
  statusProtocolStep,
  stopProtocolStep,
  updateProtocolInput,
  loadRoleDefinition,
  parseFrontmatter,
  __test__: {
    pushCurrentRuntimeStateToVisual: pushVisualRuntimeStateSnapshotNow,
    drainVisualPushes: drainVisualRuntimeStatePushes,
  },
  drainVisualPushes: drainVisualRuntimeStatePushes,
};
