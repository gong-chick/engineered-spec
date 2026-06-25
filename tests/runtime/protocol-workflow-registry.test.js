const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const protocolWorkflow = require('../../internal/ai-protocol-workflow');
const runner = require('../../bin/task-orchestrator-runner');

const fixturesDir = path.join(__dirname, 'fixtures');

function copyFixture(targetDir, fixtureName, inboxName) {
  const inboxDir = path.join(targetDir, '.ai-spec', 'internal', 'tmp');
  fs.mkdirSync(inboxDir, { recursive: true });
  fs.copyFileSync(path.join(fixturesDir, fixtureName), path.join(inboxDir, inboxName));
}

function writeProjectFile(targetDir, relPath, content) {
  const filePath = path.join(targetDir, relPath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${content}\n`, 'utf8');
}

function writeJsonFile(targetDir, relPath, value) {
  writeProjectFile(targetDir, relPath, JSON.stringify(value, null, 2));
}

function readJsonFile(targetDir, relPath) {
  return JSON.parse(fs.readFileSync(path.join(targetDir, relPath), 'utf8'));
}

function createWorkspace() {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-spec-auto-protocol-registry-test-'));
  writeProjectFile(targetDir, 'package.json', JSON.stringify({
    name: 'protocol-registry-smoke',
    scripts: {
      build: 'node -e "process.exit(0)"',
      lint: 'node -e "process.exit(0)"',
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
  writeProjectFile(targetDir, 'pnpm-lock.yaml', 'lockfileVersion: 9.0');
  writeProjectFile(targetDir, 'src/router/index.ts', 'export const router = {}');
  writeProjectFile(targetDir, 'src/router/modules/demo.ts', 'export default []');
  writeProjectFile(targetDir, 'src/views/demo/index.vue', '<template><div /></template>');
  writeProjectFile(targetDir, 'src/api/order.ts', 'export function getOrderListApi() {}');
  writeProjectFile(targetDir, 'src/api/types/order.ts', 'export interface Order {}');
  writeProjectFile(targetDir, 'src/styles/variables.scss', ':root {}');
  writeProjectFile(targetDir, 'context/PROJECT.md', '# PROJECT');
  return targetDir;
}

function main() {
  const flowOverrideTarget = createWorkspace();
  writeJsonFile(flowOverrideTarget, '.agents/registry/flows.json', {
    version: 1,
    flows: {
      'prd-to-delivery': {
        required_roles: ['requirement-analyst', 'code-guardian'],
        first_handoff: 'code-guardian',
        approval_gates: ['before-delivery'],
        required_artifacts: ['proposal.md', 'checklist.md'],
        handoff_policy: 'task-orchestrator -> code-guardian -> terminal',
        completion_policy: 'proposal.md, checklist.md 缺一不可',
      },
    },
  });

  let workflow = protocolWorkflow.advanceProtocolStep({
    target: flowOverrideTarget,
    userInput: '创建一个商品组件',
  });

  assert.deepStrictEqual(
    workflow.turn.guidance.routing_constraints.required_experts,
    ['requirement-analyst', 'code-guardian'],
  );
  assert.strictEqual(workflow.turn.guidance.routing_constraints.first_handoff, 'code-guardian');
  assert.deepStrictEqual(workflow.turn.guidance.approval_contract.gates, ['before-delivery']);
  assert.deepStrictEqual(workflow.turn.guidance.orchestration_contract.required_artifacts, ['proposal.md', 'checklist.md']);
  assert.strictEqual(
    workflow.turn.guidance.orchestration_contract.handoff_policy,
    'task-orchestrator -> code-guardian -> terminal',
  );
  assert.strictEqual(
    workflow.turn.guidance.orchestration_contract.completion_policy,
    'proposal.md, checklist.md 缺一不可',
  );

  const roleOverrideTarget = createWorkspace();
  writeProjectFile(roleOverrideTarget, '.agents/rules/custom-overview.md', '# custom overview');
  writeProjectFile(roleOverrideTarget, '.agents/skills/custom-design-analysis/SKILL.md', '# custom design analysis');
  writeJsonFile(roleOverrideTarget, '.agents/registry/rules.json', {
    version: 1,
    rules: {
      'project-overview': {
        source: '.agents/rules/custom-overview.md',
      },
    },
  });
  writeJsonFile(roleOverrideTarget, '.agents/registry/skills.json', {
    version: 1,
    skills: {
      'design-analysis': {
        source: '.agents/skills/custom-design-analysis/SKILL.md',
      },
    },
  });
  writeJsonFile(roleOverrideTarget, '.agents/registry/roles.json', {
    version: 1,
    roles: {
      'requirement-analyst': {
        rule_ids: ['project-overview'],
        skill_priority: ['design-analysis', 'create-proposal'],
        rule_contract_profiles: {
          default: {
            must_follow: ['先按本地项目约束收敛需求。'],
            blocked_when: ['若关键上下文缺失则维持门禁。'],
          },
        },
        openspec_rule_sections: ['proposal'],
      },
      'design-collaborator': {
        skill_priority: ['ui-ux-pro-max', 'design-analysis'],
      },
    },
  });
  copyFixture(roleOverrideTarget, 'task-orchestrator-bootstrap-reply.md', 'task-orchestrator-turn.json');
  const bootstrap = runner.advanceRunner({ target: roleOverrideTarget });
  assert.strictEqual(bootstrap.applied.adapter_action, 'bootstrap');

  workflow = protocolWorkflow.advanceProtocolStep({
    target: roleOverrideTarget,
  });

  assert.strictEqual(workflow.turn.actor.id, 'requirement-analyst');
  assert.deepStrictEqual(
    workflow.turn.guidance.role_rule_contract.source_rules.map((item) => item.id),
    ['project-overview'],
  );
  assert.strictEqual(
    workflow.turn.guidance.role_rule_contract.source_rules[0].path,
    '.agents/rules/custom-overview.md',
  );
  assert.deepStrictEqual(
    workflow.turn.guidance.role_skill_contract.primary_skills,
    ['design-analysis', 'create-proposal'],
  );
  assert.strictEqual(workflow.turn.guidance.artifact_contract[0].artifact, 'proposal.md');
  assert.deepStrictEqual(
    workflow.turn.guidance.skill_selection_policy.primary_order,
    ['design-analysis', 'create-proposal'],
  );
  assert.ok(workflow.turn.guidance.handoff_checklist.some((item) => item.includes('默认假设')));
  assert.ok(workflow.turn.guidance.optional_role_triggers.some((item) => item.role_id === 'design-collaborator'));
  assert.deepStrictEqual(
    workflow.turn.guidance.role_rule_contract.must_follow,
    ['先按本地项目约束收敛需求。', '页面任务优先对齐 src/views/<page>/index.vue 与 src/router/modules/<module>.ts 的落点约定。', '若为 mock 或占位页，明确写清 src/mock 或本地 mock 方案，以及“不接真实 API”的边界。', '样式和视觉约束需对齐主题 CSS 变量，不要把硬编码颜色或自由样式当默认方案。'],
  );
  assert.deepStrictEqual(
    workflow.turn.guidance.role_rule_contract.blocked_when,
    ['若关键上下文缺失则维持门禁。'],
  );
  assert.ok(
    workflow.turn.guidance.role_skill_contract.read_targets.some(
      (item) => item.rel_path === '.agents/skills/custom-design-analysis/SKILL.md' && item.exists,
    ),
  );
  assert.deepStrictEqual(
    workflow.turn.guidance.openspec_rules.sections.map((item) => item.name),
    ['proposal'],
  );

  const currentRun = readJsonFile(roleOverrideTarget, '.ai-spec/current-run.json');
  currentRun.current_role = 'design-collaborator';
  if (currentRun.anchor?.stage) {
    currentRun.anchor.stage.current_role = 'design-collaborator';
    currentRun.anchor.stage.next_role = 'requirement-analyst';
  }
  writeJsonFile(roleOverrideTarget, '.ai-spec/current-run.json', currentRun);
  writeJsonFile(roleOverrideTarget, '.ai-spec/internal/current-dispatch.json', {
    schema_version: 1,
    kind: 'expert-dispatch',
    run_id: currentRun.run_id,
    status: 'running',
    role: {
      id: 'design-collaborator',
      name: '设计协作专家',
      source: '.agents/roles/domains/demand-design/design-collaborator.md',
      preferred_skills: [],
    },
    task: {
      raw_goal: '分析一个 Figma 设计稿并收口样式约束',
      change_id: currentRun.anchor?.task?.change_id || 'runtime-smoke-demo',
    },
    flow: {
      id: 'prd-to-delivery',
    },
    execution: {
      profile: 'vue',
      current_role: 'design-collaborator',
      next_role: 'requirement-analyst',
      pending_gate: null,
      expected_output: ['补充 UI 分析清单', '列出设计待确认项'],
      skills: [],
    },
    anchor: currentRun.anchor,
    instructions: {
      source: '.agents/roles/domains/demand-design/design-collaborator.md',
      markdown: '# design-collaborator',
    },
  });

  workflow = protocolWorkflow.advanceProtocolStep({
    target: roleOverrideTarget,
  });

  assert.strictEqual(workflow.turn.actor.id, 'design-collaborator');
  assert.deepStrictEqual(
    workflow.turn.guidance.role_skill_contract.primary_skills,
    ['ui-ux-pro-max', 'design-analysis'],
  );
  assert.ok(
    workflow.turn.guidance.role_skill_contract.read_targets.some(
      (item) => item.rel_path === '.agents/skills/domains/ui-ux-pro-max/SKILL.md' && item.exists,
    ),
  );

  writeProjectFile(
    roleOverrideTarget,
    '.agents/skills/domains/ui-ux-pro-max/SKILL.md',
    '# local ui-ux-pro-max',
  );

  workflow = protocolWorkflow.advanceProtocolStep({
    target: roleOverrideTarget,
  });

  assert.ok(
    workflow.turn.guidance.role_skill_contract.read_targets.some(
      (item) =>
        item.rel_path === '.agents/skills/domains/ui-ux-pro-max/SKILL.md'
        && item.path === path.join(roleOverrideTarget, '.agents/skills/domains/ui-ux-pro-max/SKILL.md'),
    ),
  );

  const superpowersTarget = createWorkspace();
  writeJsonFile(superpowersTarget, '.ai-spec/superpowers.json', {
    schema_version: 1,
    enabled: true,
    mode: 'host-enhanced',
    bindings: {
      cursor: { enabled: true, entry_mode: 'project-minimal' },
      claude: { enabled: true, entry_mode: 'host-enhanced' },
      codex: { enabled: true, entry_mode: 'agents-skill-wrapper' },
    },
    host: {
      capabilities: {
        cursor: false,
        claude: true,
        codex: true,
      },
    },
    allowed_roles: ['requirement-analyst', 'frontend-implementer', 'code-guardian'],
    fallback_strategy: 'graceful-degrade',
    last_fallback_reason: null,
    cli_version: '2.0.0',
  });

  workflow = protocolWorkflow.advanceProtocolStep({
    target: superpowersTarget,
    userInput: '新增一个订单详情页，接真实接口并补状态流转说明',
  });

  assert.strictEqual(workflow.turn.summary.superpowers_mode, 'host-enhanced');
  assert.strictEqual(workflow.turn.guidance.superpowers_contract.enabled, true);
  assert.strictEqual(workflow.turn.guidance.superpowers_contract.mode, 'host-enhanced');
  assert.ok(workflow.turn.guidance.superpowers_contract.allowed_roles.includes('frontend-implementer'));

  copyFixture(superpowersTarget, 'task-orchestrator-bootstrap-reply.md', 'task-orchestrator-turn.json');
  runner.advanceRunner({ target: superpowersTarget });
  workflow = protocolWorkflow.advanceProtocolStep({
    target: superpowersTarget,
  });

  assert.strictEqual(workflow.turn.actor.id, 'requirement-analyst');
  assert.strictEqual(workflow.turn.summary.superpowers_mode, 'host-enhanced');
  assert.deepStrictEqual(
    workflow.turn.guidance.role_skill_contract.primary_skills.slice(0, 3),
    ['using-superpowers', 'create-proposal', 'design-analysis'],
  );
  assert.ok(workflow.turn.guidance.superpowers_contract.host_enhanced_hints.includes('using-superpowers'));
  assert.ok(workflow.turn.guidance.superpowers_contract.host_enhanced_hints.includes('brainstorming'));
  assert.ok(workflow.turn.guidance.superpowers_contract.host_enhanced_hints.includes('plan'));
  assert.deepStrictEqual(
    workflow.turn.guidance.superpowers_contract.recommended_sequence,
    ['using-superpowers', 'brainstorming', 'plan', 'create-proposal'],
  );
  assert.ok(workflow.turn.guidance.superpowers_contract.user_prompt.includes('using-superpowers'));
  assert.ok(workflow.turn.guidance.superpowers_contract.user_prompt.includes('brainstorming'));
  assert.ok(workflow.turn.guidance.superpowers_contract.user_prompt.includes('create-proposal'));
  assert.ok(workflow.turn.announcements.enter.includes('using-superpowers'));
  assert.ok(workflow.turn.announcements.enter.includes('brainstorming'));
  assert.ok(workflow.turn.announcements.enter.includes('create-proposal'));

  const futureProfileTarget = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-spec-auto-protocol-future-profile-'));
  writeProjectFile(futureProfileTarget, 'package.json', JSON.stringify({
    name: 'protocol-future-profile',
    dependencies: {
      '@nestjs/core': '^10.0.0',
    },
  }, null, 2));
  writeJsonFile(futureProfileTarget, '.ai-spec/manifest.json', {
    schema_version: 1,
    manifest_type: 'hub-install',
    profile: 'nest',
    ides: ['cursor'],
    scenario_packages: [],
    roles: ['task-orchestrator'],
    skills: [],
    rules: ['project-structure'],
  });
  writeJsonFile(futureProfileTarget, '.agents/registry/profiles.json', {
    version: 1,
    profiles: {
      nest: {
        status: 'active',
        label: 'NestJS',
        rules_dir: '.agents/rules/profiles/nest',
        skills_dir: '.agents/skills/profiles/nest',
      },
    },
  });
  writeJsonFile(futureProfileTarget, '.agents/registry/rules.json', {
    version: 1,
    rules: {
      'project-structure': {
        sourceByProfile: {
          nest: '.agents/rules/profiles/nest/03-项目结构.md',
        },
      },
    },
  });
  writeJsonFile(futureProfileTarget, '.agents/registry/roles.json', {
    version: 1,
    roles: {
      'task-orchestrator': {
        source: '.agents/roles/common/task-orchestrator.md',
        rule_ids: ['project-structure'],
        rule_contract_profiles: {
          default: {
            must_follow: ['先读通用结构规则。'],
          },
          nest: {
            must_follow: ['按 Nest 模块结构组织实现。'],
          },
        },
      },
    },
  });
  writeProjectFile(futureProfileTarget, '.agents/roles/common/task-orchestrator.md', '# task-orchestrator');
  writeProjectFile(futureProfileTarget, '.agents/rules/profiles/nest/03-项目结构.md', '# nest project structure');

  workflow = protocolWorkflow.advanceProtocolStep({
    target: futureProfileTarget,
    userInput: '创建一个订单模块',
  });

  assert.strictEqual(workflow.turn.guidance.project_context.framework, 'nest');
  assert.strictEqual(workflow.turn.guidance.role_rule_contract.profile, 'nest');
  assert.strictEqual(
    workflow.turn.guidance.role_rule_contract.source_rules[0].path,
    '.agents/rules/profiles/nest/03-项目结构.md',
  );
  assert.ok(
    workflow.turn.guidance.role_rule_contract.must_follow.includes('按 Nest 模块结构组织实现。'),
  );

  console.log('protocol workflow registry test passed: task-orchestrator and expert turns honor local flow, rule, and skill overrides');
}

main();
