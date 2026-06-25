#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const protocolWorkflow = require('../internal/ai-protocol-workflow');
const { archiveChange } = require('./archive-change');
const runner = require('./task-orchestrator-runner');

const pkgRoot = path.join(__dirname, '..');
const defaultTarget = path.join(process.cwd(), '.tmp', 'runtime-smoke-demo');

function parseArgs(argv) {
  const args = [...argv];
  const options = {
    target: defaultTarget,
    userInput: '新增一个商品 mock 页面',
    json: false,
    pretty: true,
  };

  while (args.length > 0) {
    const arg = args.shift();

    if (!arg.startsWith('-') && options.target === defaultTarget) {
      options.target = arg;
      continue;
    }

    switch (arg) {
      case '--target':
        options.target = args.shift();
        break;
      case '--user-input':
        options.userInput = args.shift();
        break;
      case '--json':
        options.json = true;
        options.pretty = false;
        break;
      case '--pretty':
        options.pretty = true;
        options.json = false;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function printUsage() {
  console.log(`Usage:
  ai-spec-auto demo-runtime-smoke [target] [options]

Options:
  --target <dir>         Demo target directory (default: ./.tmp/runtime-smoke-demo)
  --user-input <text>    Demo requirement text
  --json                 Print JSON only
  --pretty               Print readable summary (default)
  --help                 Show this help
`);
}

function ensureEmptyTarget(targetDir) {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
    return;
  }

  const entries = fs.readdirSync(targetDir);
  if (entries.length > 0) {
    throw new Error(`Demo target is not empty: ${targetDir}`);
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeFile(targetDir, relPath, content) {
  const filePath = path.join(targetDir, relPath);
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
}

function writeJson(targetDir, relPath, value) {
  writeFile(targetDir, relPath, `${JSON.stringify(value, null, 2)}\n`);
}

function copyDirRecursive(sourceDir, targetDir) {
  ensureDir(targetDir);
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(sourcePath, targetPath);
      continue;
    }
    ensureDir(path.dirname(targetPath));
    fs.copyFileSync(sourcePath, targetPath);
  }
}

function buildRunId() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return [
    'run',
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`,
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`,
    'demo',
  ].join('_');
}

function scaffoldDemoTarget(targetDir) {
  ensureEmptyTarget(targetDir);

  writeFile(targetDir, 'package.json', JSON.stringify({
    name: 'runtime-smoke-demo',
    private: true,
    scripts: {
      build: 'node -e "process.exit(0)"',
      lint: 'node -e "process.exit(0)"',
      test: 'node -e "process.exit(0)"',
    },
    dependencies: {
      vue: '^3.5.0',
      'vue-router': '^4.4.0',
      pinia: '^3.0.0',
      vite: '^6.0.0',
    },
    devDependencies: {
      typescript: '^5.0.0',
    },
  }, null, 2));
  writeFile(targetDir, 'pnpm-lock.yaml', 'lockfileVersion: 9.0');
  writeFile(targetDir, 'src/router/index.ts', [
    'export const routes = [];',
    'export const router = { routes };',
  ].join('\n'));
  writeFile(targetDir, 'src/router/modules/demo.ts', 'export default [];');
  writeFile(targetDir, 'src/views/demo/index.vue', '<template><div>demo entry</div></template>');
  writeFile(targetDir, 'src/api/order.ts', 'export function getOrderListApi() { return []; }');
  writeFile(targetDir, 'src/api/types/order.ts', 'export interface Order { id: string; }');
  writeFile(targetDir, 'src/mock/order.ts', 'export const orderMock = [];');
  writeFile(targetDir, 'src/store/modules/demo/index.ts', 'export const useDemoStore = () => ({})');
  writeFile(targetDir, 'src/styles/variables.scss', ':root {}');
  writeFile(targetDir, 'context/PROJECT.md', [
    '# PROJECT',
    '',
    '- Framework: Vue 3',
    '- Language: TypeScript',
    '- Goal: runtime smoke demo for expert-delivery flow',
  ].join('\n'));

  const configTemplate = path.join(pkgRoot, 'openspec', 'config.yaml.template');
  writeFile(targetDir, path.join('openspec', 'config.yaml'), fs.readFileSync(configTemplate, 'utf8'));

  const schemaSource = path.join(pkgRoot, 'openspec', 'schemas', 'expert-delivery');
  const schemaTarget = path.join(targetDir, 'openspec', 'schemas', 'expert-delivery');
  copyDirRecursive(schemaSource, schemaTarget);
}

function createBootstrapPayload(runId, userInput, changeId) {
  return {
    schema_version: 1,
    kind: 'task-orchestrator-bootstrap',
    run_plan: {
      schema_version: 1,
      kind: 'run-plan',
      run_id: runId,
      status: 'planned',
      review_policy: 'main-flow-blocking',
      task: {
        type: 'page-development',
        raw_input: userInput,
        input_kind: 'natural-language',
        risk_level: 'low',
      },
      flow: {
        id: 'prd-to-delivery',
        name: '需求到交付',
        source: 'runtime-smoke-demo',
      },
      artifacts: [
        `openspec/changes/${changeId}/proposal.md`,
        `openspec/changes/${changeId}/specs/`,
        `openspec/changes/${changeId}/design.md`,
        `openspec/changes/${changeId}/tasks.md`,
        'code',
        `openspec/changes/${changeId}/checklist.md`,
        `openspec/changes/${changeId}/iterations.md`,
      ],
      plan: {
        required_roles: [
          'requirement-analyst',
          'frontend-implementer',
          'code-guardian',
        ],
        activated_optional_roles: [],
        skipped_optional_roles: [],
        first_handoff: 'requirement-analyst',
        approval_gates: ['before-implementation', 'before-archive'],
        review_policy: 'main-flow-blocking',
      },
      missing_inputs: [
        '组件目录位置未明确，采用最小 mock 页面默认结构',
      ],
      warnings: [],
      errors: [],
      next_action: '先交给 requirement-analyst 收敛任务',
    },
    task_anchor: {
      schema_version: 1,
      kind: 'task-anchor',
      run_id: runId,
      task: {
        raw_goal: userInput,
        change_id: changeId,
        input_kind: 'natural-language',
      },
      stage: {
        flow_id: 'prd-to-delivery',
        current_role: 'requirement-analyst',
        next_role: 'frontend-implementer',
      },
      constraints: {
        rules: ['component-standard'],
        must_not: ['不要跳过规则检查'],
      },
      artifacts: {
        proposal: `openspec/changes/${changeId}/proposal.md`,
        specs: `openspec/changes/${changeId}/specs/`,
        design: `openspec/changes/${changeId}/design.md`,
        tasks: `openspec/changes/${changeId}/tasks.md`,
      },
      expected_output: [
        '补齐 proposal',
        '输出 specs',
        '输出 design',
        '输出 tasks',
        '列出缺失输入',
      ],
    },
  };
}

function createExecutionPayload(runId, roleId, roleName, executionSteps) {
  return {
    schema_version: 1,
    kind: 'expert-execution',
    run_id: runId,
    status: 'completed',
    role: {
      id: roleId,
      name: roleName,
    },
    flow: {
      id: 'prd-to-delivery',
    },
    execution_plan: {
      execution_steps: executionSteps,
    },
    markdown: `# ${roleId} execution`,
  };
}

function writeRequirementArtifacts(targetDir, changeId) {
  writeFile(targetDir, `openspec/changes/${changeId}/proposal.md`, [
    `# 变更提案：${changeId}`,
    '',
    '## 目标',
    '',
    '### 业务目标',
    '- 新增一个商品 mock 页面，用于验证 expert-delivery 主链可运行。',
    '',
    '### 工程目标',
    '- 验证 proposal、design、tasks、checklist、iterations 这组模板化产物可以支撑主链闭环。',
    '',
    '### 变更对象与入口',
    '- 页面入口：`src/views/products/mock/index.vue`',
    '- 路由入口：`src/router/modules/products.ts`',
    '- 数据入口：`src/mock/products.ts`',
    '',
    '### 设计链接',
    '- 当前示例没有独立 Figma(设计稿)，以 runtime smoke 需求文案和仓库约定作为设计输入。',
    '',
    '### 组件复用约束（可选）',
    '- 当前示例优先复用现有 Vue 目录结构和最小页面约定，不额外引入组件库封装。',
    '',
    '## 范围',
    '',
    '### In Scope(纳入范围)',
    '- 新增商品 mock 页面。',
    '- 新增最小路由模块。',
    '- 新增最小 mock 数据。',
    '- 输出结构化的 design、tasks、checklist 和 iterations。',
    '',
    '### Out of Scope(排除范围)',
    '- 不接真实 API(接口)。',
    '- 不引入真实浏览器脚本或复杂状态管理。',
    '',
    '## 非目标',
    '- 不接真实 API。',
    '- 不引入复杂状态管理。',
    '- 不在本次示例中抽象新的通用组件。',
    '',
    '## 默认假设',
    '- 仓库已有 Vue 3 + TypeScript 基础结构，可直接承接页面、路由和 mock 文件。',
    '- 当前示例只要求最小验证闭环，不要求真实组件库和真实浏览器验证接入。',
    '',
    '## 风险与待确认项',
    '- 当前演示为确定性 replay(回放)，不代表真实 AI IDE 全自动执行。',
    '- 真实业务接入时仍需补浏览器验证证据和组件复用决策。',
  ].join('\n'));

  writeFile(targetDir, `openspec/changes/${changeId}/specs/ui/spec.md`, [
    '## 新增需求',
    '',
    '### 需求：商品 mock 页面',
    '',
    '系统必须提供一个商品 mock 页面，用于验证 expert-delivery 主链可运行。',
    '',
    '#### 场景：进入商品 mock 页面',
    '',
    '- **已知** 当前场景只使用本地 mock 数据',
    '- **当** 用户进入商品 mock 页面',
    '- **则** 页面展示本地商品列表，不请求真实接口',
  ].join('\n'));

  writeFile(targetDir, `openspec/changes/${changeId}/specs/api/spec.md`, [
    '## 新增需求',
    '',
    '### 需求：演示接口约束',
    '',
    '系统必须明确当前示例只消费本地 mock 数据，不发起真实商品接口请求。',
    '',
    '#### 场景：页面初始化',
    '',
    '- **已知** 当前为 runtime smoke 演示',
    '- **当** 页面初始化',
    '- **则** 只读取本地 mock 模块，不调用远程 API',
  ].join('\n'));

  writeFile(targetDir, `openspec/changes/${changeId}/design.md`, [
    '# 技术设计',
    '',
    '## 方案概览',
    '- 在现有 Vue 目录约定下落一个最小商品页面、路由模块和 mock 数据文件。',
    '- 通过结构化的 proposal、design、tasks、checklist、iterations 验证模板增强后的主链产物。',
    '',
    '## 仓库对齐',
    '',
    '### 页面与路由落点',
    '- 页面落在 `src/views/products/mock/index.vue`',
    '- 路由落在 `src/router/modules/products.ts`',
    '',
    '### 接口与数据落点',
    '- mock 数据落在 `src/mock/products.ts`',
    '- 当前示例不新增真实 API(接口) 封装',
    '',
    '### 状态与样式落点',
    '- 页面使用局部静态数据，不引入额外状态管理',
    '- 样式直接放在页面 SFC(单文件组件) 内，保持最小实现',
    '',
    '### 测试与组件库落点',
    '- 由 runtime smoke 和模板回归用例验证产物结构',
    '- 当前示例不额外接入组件库，只复用仓库现有目录约定',
    '',
    '## 关键决策',
    '',
    '### 信息结构',
    '- 页面只保留标题和商品列表，用最小信息结构证明页面可交付。',
    '',
    '### 状态管理方案',
    '- 商品数据直接从本地 mock 文件导入，避免在示例里引入无关状态层。',
    '',
    '### 组件复用策略',
    '- 优先复用现有 Vue 页面、路由和 mock 组织方式，不额外封装新组件。',
    '',
    '### 禁止重复实现的能力',
    '- 不重复实现路由基础设施、构建配置和全局状态容器。',
    '',
    '### 组件缺口',
    '- 当前示例未识别必须补齐的组件缺口，真实业务接入时再补充。',
    '',
    '## 数据与接口变更',
    '- 页面只读取本地 `productMock` 数据，不新增请求或响应契约。',
    '- 不引入新的 props(属性)、事件或跨模块状态同步。',
    '',
    '## 验证说明',
    '',
    '### 本地验证',
    '- 通过 runtime smoke 命令推进主链，确认产物、代码和归档目录都能落盘。',
    '',
    '### 浏览器验证',
    '- 当前示例不接真实浏览器脚本，以页面文件、路由文件和 mock 文件的落盘作为最小替代证据。',
    '',
    '### 关键验收路径',
    '- 生成 proposal、specs、design、tasks 后进入实现专家。',
    '- 页面、路由、mock 文件落盘后补齐 checklist 和 iterations，再完成归档。',
  ].join('\n'));

  writeFile(targetDir, `openspec/changes/${changeId}/tasks.md`, [
    '# 实施任务',
    '',
    '## 执行总原则',
    '- [ ] 任务必须限定在 proposal.md、design.md 和 specs 已批准范围内',
    '- [ ] 每个子任务都要写明目标、输入、输出、验证点和依赖或前置条件',
    '- [ ] 未完成验证前不得宣称任务完成或继续交接',
    '',
    '## 子任务清单',
    '',
    '### 子任务 1',
    '- [ ] 目标：创建商品 mock 页面与最小组件结构',
    '- [ ] 输入：proposal.md、specs/ui/spec.md、现有 `src/views` 目录约定',
    '- [ ] 输出：`src/views/products/mock/index.vue`',
    '- [ ] 验证点：页面文件存在，能引用本地 mock 数据并展示列表',
    '- [ ] 依赖或前置条件：requirement-analyst 已产出 proposal、specs、design',
    '',
    '### 子任务 2',
    '- [ ] 目标：补齐路由模块和 mock 数据文件',
    '- [ ] 输入：design.md、现有 `src/router/modules` 与 `src/mock` 目录约定',
    '- [ ] 输出：`src/router/modules/products.ts`、`src/mock/products.ts`',
    '- [ ] 验证点：路由指向商品 mock 页面，mock 数据文件可被页面导入',
    '- [ ] 依赖或前置条件：子任务 1 的页面路径已确定',
    '',
    '### 子任务 3',
    '- [ ] 目标：补齐 checklist 和 iterations，完成交付闭环',
    '- [ ] 输入：实现结果、proposal.md、design.md、tasks.md',
    '- [ ] 输出：`checklist.md`、`iterations.md`',
    '- [ ] 验证点：检查结论、验证摘要、残留风险和交接提醒都已记录',
    '- [ ] 依赖或前置条件：页面、路由和 mock 数据文件已落盘',
  ].join('\n'));
}

function writeImplementationArtifacts(targetDir) {
  writeFile(targetDir, 'src/views/products/mock/index.vue', [
    '<template>',
    '  <section class="product-mock-page">',
    '    <h1>商品 Mock 页面</h1>',
    '    <ul>',
    '      <li v-for="item in productMock" :key="item.id">',
    '        <strong>{{ item.name }}</strong>',
    '        <span>{{ item.price }}</span>',
    '      </li>',
    '    </ul>',
    '  </section>',
    '</template>',
    '',
    '<script setup lang="ts">',
    "import { productMock } from '../../../mock/products';",
    '</script>',
    '',
    '<style scoped>',
    '.product-mock-page {',
    '  padding: 24px;',
    '}',
    '',
    '.product-mock-page ul {',
    '  display: grid;',
    '  gap: 12px;',
    '  list-style: none;',
    '  padding: 0;',
    '}',
    '</style>',
  ].join('\n'));

  writeFile(targetDir, 'src/router/modules/products.ts', [
    'export default [',
    '  {',
    "    path: '/products/mock',",
    "    name: 'ProductsMock',",
    "    component: () => import('../../views/products/mock/index.vue'),",
    '  },',
    '];',
  ].join('\n'));

  writeFile(targetDir, 'src/mock/products.ts', [
    'export const productMock = [',
    "  { id: 'p-001', name: '演示商品 A', price: '99.00' },",
    "  { id: 'p-002', name: '演示商品 B', price: '129.00' },",
    '];',
  ].join('\n'));
}

function writeGuardianArtifacts(targetDir, changeId) {
  writeFile(targetDir, `openspec/changes/${changeId}/checklist.md`, [
    '# 检查清单',
    '',
    '## 通过项',
    '- [x] proposal、specs、design 与实现结果保持一致',
    '- [x] 已完成任务已真实反映在代码和配套文件中',
    '- [x] 项目的目录、路由、接口、样式、测试等规则已满足当前示例边界',
    '',
    '### 本地验证摘要',
    '- [x] lint(静态检查)：通过，示例项目使用最小占位脚本返回成功',
    '- [x] typecheck(类型检查)：通过，示例目录结构满足仓库约定',
    '- [x] test(测试)：通过，runtime smoke 主链推进完成',
    '- [x] build(构建)：通过，示例项目占位构建脚本返回成功',
    '',
    '### 浏览器验证摘要',
    '- [x] 页面可访问：通过，页面文件、路由文件和 mock 文件均已落盘',
    '- [x] 关键路径可执行：通过，商品页面、路由和归档链路均已完成',
    '- [x] console(控制台) 检查：通过，当前示例未引入浏览器脚本报错',
    '',
    '### 范围一致性',
    '- [x] 当前实现未超出 proposal、design、tasks 已批准范围',
    '',
    '### 组件复用检查',
    '- [x] 已记录当前示例优先复用仓库既有目录约定，暂无额外组件库缺口',
    '',
    '## 未通过项',
    '- [ ] 记录未满足需求或项目规则的项',
    '',
    '## 阻断项',
    '- [ ] 记录在继续交付、放行或归档前必须解决的项',
    '',
    '## 是否建议继续推进',
    '建议继续推进：当前示例已达到 runtime smoke 演示目标，可继续归档。',
  ].join('\n'));

  writeFile(targetDir, `openspec/changes/${changeId}/iterations.md`, [
    '# 迭代记录',
    '',
    '## 本轮问题',
    '- [x] 当前示例只覆盖最小 mock 交付链，不覆盖真实浏览器验证和真实接口接入。',
    '- 问题来源：runtime smoke 以确定性 replay(回放) 为主，验证重点是主链闭环而不是业务复杂度。',
    '- 影响范围：只能证明模板产物、代码落盘和归档流程可运行。',
    '- 关联证据：checklist.md、`.ai-spec/current-run.json` 和归档后的 `openspec/changes/archive/` 目录。',
    '',
    '## 修正动作',
    '- [x] 已补齐 proposal、design、tasks、checklist、iterations 的结构化示例内容。',
    '- 已完成动作：新增页面、路由、mock 数据，并补录验证摘要和交付结论。',
    '- 待跟进动作：后续可替换为真实业务页面或真实 AI IDE 执行回合。',
    '',
    '## 残留风险',
    '- [ ] 真实浏览器验证、真实 API 和更严格的组件复用约束尚未纳入本次示例。',
    '- 风险说明：如果直接把该示例当成业务实现模板，仍需补真实业务约束和验证脚本。',
    '- 触发条件：进入真实业务项目、引入真实接口或涉及复杂状态管理时。',
    '- 建议缓解方式：在业务项目中补齐 design、checklist 和浏览器验证证据，再推进归档。',
    '',
    '## 下轮提醒',
    '- [ ] 下一轮可将最小示例替换成真实页面或真实 AI IDE 执行输入。',
    '- 下一轮关注点：真实接口契约、组件复用策略和浏览器验证脚本接入。',
    '- 交接说明：当前示例已可作为模板增强后的最小演示基线。',
  ].join('\n'));
}

function writeBootstrapTurn(targetDir, payload) {
  writeJson(targetDir, '.ai-spec/internal/tmp/task-orchestrator-turn.json', payload);
}

function writeExecutionInbox(targetDir, payload) {
  writeJson(targetDir, '.ai-spec/internal/tmp/current-execution.json', payload);
}

function runDemoRuntimeSmoke(options = {}) {
  const targetDir = path.resolve(options.target || defaultTarget);
  const userInput = options.userInput || '新增一个商品 mock 页面';
  const runId = options.runId || buildRunId();
  const changeId = options.changeId || 'runtime-smoke-demo';

  scaffoldDemoTarget(targetDir);

  const start = protocolWorkflow.advanceProtocolStep({
    target: targetDir,
    userInput,
    reviewPolicy: 'main-flow-blocking',
  });

  writeBootstrapTurn(targetDir, createBootstrapPayload(runId, userInput, changeId));
  const afterBootstrap = runner.advanceRunner({ target: targetDir });

  const requirementTurn = protocolWorkflow.advanceProtocolStep({ target: targetDir });
  writeRequirementArtifacts(targetDir, changeId);
  writeExecutionInbox(targetDir, createExecutionPayload(
    runId,
    'requirement-analyst',
    '需求解析专家',
    ['补齐 proposal', '输出 spec', '输出 tasks'],
  ));
  const afterRequirement = runner.advanceRunner({ target: targetDir });

  const implementationApprovalGate = protocolWorkflow.advanceProtocolStep({ target: targetDir });
  writeJson(targetDir, '.ai-spec/internal/tmp/current-runtime-action.json', {
    schema_version: 1,
    kind: 'task-orchestrator-runtime-action',
    action: 'approve',
    gate: 'before-implementation',
    to_role: 'frontend-implementer',
    message: 'demo implementation approved',
  });
  const afterImplementationApproval = runner.advanceRunner({ target: targetDir });

  const implementationTurn = protocolWorkflow.advanceProtocolStep({ target: targetDir });
  writeImplementationArtifacts(targetDir);
  writeExecutionInbox(targetDir, createExecutionPayload(
    runId,
    'frontend-implementer',
    '前端实现专家',
    ['完成最小页面实现', '补齐路由与 mock 数据'],
  ));
  const afterImplementation = runner.advanceRunner({ target: targetDir });

  const guardianApprovalGate = protocolWorkflow.advanceProtocolStep({ target: targetDir });
  writeJson(targetDir, '.ai-spec/internal/tmp/current-runtime-action.json', {
    schema_version: 1,
    kind: 'task-orchestrator-runtime-action',
    action: 'approve',
    gate: 'before-guardian',
    to_role: 'code-guardian',
    message: 'demo guardian approved',
  });
  const afterGuardianApproval = runner.advanceRunner({ target: targetDir });

  const guardianTurn = protocolWorkflow.advanceProtocolStep({ target: targetDir });
  writeGuardianArtifacts(targetDir, changeId);
  writeExecutionInbox(targetDir, createExecutionPayload(
    runId,
    'code-guardian',
    '规范守护者',
    ['检查范围与产物', '输出 checklist 与 iterations', '等待归档确认'],
  ));
  const afterGuardian = runner.advanceRunner({ target: targetDir });

  const archiveGate = protocolWorkflow.advanceProtocolStep({ target: targetDir });
  writeJson(targetDir, '.ai-spec/internal/tmp/current-runtime-action.json', {
    schema_version: 1,
    kind: 'task-orchestrator-runtime-action',
    action: 'approve',
    gate: 'before-archive',
    to_role: 'archive-change',
    message: 'demo archive approved',
  });
  const afterArchiveApproval = runner.advanceRunner({ target: targetDir });

  const archiveTurn = protocolWorkflow.advanceProtocolStep({ target: targetDir });
  const afterArchive = archiveChange({
    target: targetDir,
    changeId,
    completeRun: true,
  });

  const terminal = protocolWorkflow.advanceProtocolStep({ target: targetDir });
  const currentRun = JSON.parse(fs.readFileSync(path.join(targetDir, '.ai-spec', 'current-run.json'), 'utf8'));

  return {
    kind: 'demo-runtime-smoke-result',
    target: targetDir,
    user_input: userInput,
    run_id: runId,
    change_id: changeId,
    turns: {
      start: {
        actor: start.turn.actor?.id || null,
        command: start.turn.command || null,
        mode: start.turn.mode || null,
      },
      requirement_analyst: {
        actor: requirementTurn.turn.actor?.id || null,
        command: requirementTurn.turn.command || null,
      },
      frontend_implementer: {
        actor: implementationTurn.turn.actor?.id || null,
        command: implementationTurn.turn.command || null,
      },
      code_guardian: {
        actor: guardianTurn.turn.actor?.id || null,
        command: guardianTurn.turn.command || null,
      },
      archive_gate: {
        status: archiveGate.turn.status || null,
        gate: archiveGate.turn.guidance?.approval_gate?.gate || null,
      },
      archive_change: {
        actor: archiveTurn.turn.actor?.id || null,
        command: archiveTurn.turn.command || null,
      },
      terminal: {
        status: terminal.turn.status || null,
        actor: terminal.turn.actor?.id || null,
      },
    },
    applied: {
      bootstrap: afterBootstrap.applied.adapter_action,
      requirement: afterRequirement.applied.adapter_action,
      implementation: afterImplementation.applied.adapter_action,
      guardian: afterGuardian.applied.adapter_action,
      implementation_approval: afterImplementationApproval.applied.adapter_action,
      guardian_approval: afterGuardianApproval.applied.adapter_action,
      archive_approval: afterArchiveApproval.applied.adapter_action,
      archive: afterArchive.runtime_transition?.state?.status || afterArchive.status,
    },
    current_run: {
      status: currentRun.status,
      current_role: currentRun.current_role,
      events: Array.isArray(currentRun.events) ? currentRun.events.length : 0,
      artifacts: currentRun.artifacts || null,
    },
    outputs: [
      '.ai-spec/current-run.json',
      'openspec/specs/ui/spec.md',
      'openspec/specs/api/spec.md',
      'src/views/products/mock/index.vue',
      'src/router/modules/products.ts',
      'src/mock/products.ts',
    ],
    note: 'This demo replays deterministic expert outputs to verify the current expert-delivery runtime chain.',
  };
}

function printPretty(result) {
  console.log('runtime smoke demo completed');
  console.log(`target: ${result.target}`);
  console.log(`run_id: ${result.run_id}`);
  console.log(`change_id: ${result.change_id}`);
  console.log(`current_run.status: ${result.current_run.status}`);
  console.log(`current_run.events: ${result.current_run.events}`);
  console.log('outputs:');
  for (const item of result.outputs) {
    console.log(`  - ${item}`);
  }
  console.log('note:');
  console.log(`  ${result.note}`);
}

function main(argv = process.argv.slice(2)) {
  try {
    const options = parseArgs(argv);
    if (options.help) {
      printUsage();
      return 0;
    }

    const result = runDemoRuntimeSmoke(options);
    if (options.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      printPretty(result);
    }
    return 0;
  } catch (error) {
    console.error(error.message || error);
    return 1;
  }
}

module.exports = {
  runDemoRuntimeSmoke,
  main,
};

if (require.main === module) {
  process.exit(main());
}
