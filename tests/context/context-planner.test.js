const assert = require('assert');
const { ContextPlanner } = require('../../src/context/context-planner');

function createRegistry() {
  return {
    schemaVersion: '1.0.0',
    assets: {
      roles: [
        { kind: 'role', slug: 'product-owner', version: '1.0.0', checksum: 'sha256:role' },
      ],
      flows: [
        { kind: 'flow', slug: 'planning-flow', version: '1.0.0', checksum: 'sha256:flow' },
        { kind: 'flow', slug: 'verify-flow', version: '1.0.0', checksum: 'sha256:verify' },
      ],
      rules: [
        { kind: 'rule', slug: 'impl-rule', version: '1.0.0', checksum: 'sha256:rule' },
        { kind: 'rule', slug: 'verify-rule', version: '1.0.0', checksum: 'sha256:verify-rule' },
      ],
      skills: [
        { kind: 'skill', slug: 'create-test', version: '1.0.0', checksum: 'sha256:skill' },
      ],
      agentProfiles: [
        { kind: 'agent-profile', slug: 'diagnostic-agent', version: '1.0.0', checksum: 'sha256:agent' },
      ],
    },
  };
}

function createContextIndex(overrides = {}) {
  return {
    schemaVersion: '1.0.0',
    contextStrategy: 'progressive',
    stageLoadRules: [
      { stage: 'planning', loadKinds: ['role', 'flow'], maxAssets: 2 },
      { stage: 'implementation', loadKinds: ['rule', 'skill', 'agent-profile'], maxAssets: 8 },
      { stage: 'verification', loadKinds: ['rule', 'flow'], maxAssets: 6 },
      { stage: 'diagnosing', loadKinds: ['rule', 'skill', 'agent-profile'], requiredAgents: ['diagnostic-agent'], maxAssets: 6 },
      ...(overrides.stageLoadRules || []),
    ],
  };
}

function assertKinds(plan, expectedKinds) {
  assert.deepStrictEqual(plan.assetsToLoad.map((asset) => asset.kind), expectedKinds);
}

function testPlanningLoadsOnlyRoleAndFlow() {
  const plan = new ContextPlanner().plan({
    stage: 'planning',
    contextIndex: createContextIndex(),
    registryIndex: createRegistry(),
    lockFile: { assets: [] },
  });

  assertKinds(plan, ['role', 'flow']);
  assert.strictEqual(plan.assetsToLoad.length, 2);
  assert(plan.reasons.some((reason) => reason.includes('planning')));
}

function testImplementationLoadsRuleSkillAgentProfile() {
  const plan = new ContextPlanner().plan({
    stage: 'implementation',
    contextIndex: createContextIndex(),
    registryIndex: createRegistry(),
    lockFile: { assets: [] },
  });

  assert(plan.assetsToLoad.every((asset) => ['rule', 'skill', 'agent-profile'].includes(asset.kind)));
  assert(plan.assetsToLoad.some((asset) => asset.kind === 'rule'));
  assert(plan.assetsToLoad.some((asset) => asset.kind === 'skill'));
  assert(plan.assetsToLoad.some((asset) => asset.kind === 'agent-profile'));
}

function testVerificationLoadsRuleAndFlow() {
  const plan = new ContextPlanner().plan({
    stage: 'verification',
    contextIndex: createContextIndex(),
    registryIndex: createRegistry(),
    lockFile: { assets: [] },
  });

  assert(plan.assetsToLoad.every((asset) => ['rule', 'flow'].includes(asset.kind)));
  assert(plan.assetsToLoad.some((asset) => asset.kind === 'rule'));
  assert(plan.assetsToLoad.some((asset) => asset.kind === 'flow'));
}

function testDiagnosingLoadsDiagnosticAgent() {
  const plan = new ContextPlanner().plan({
    stage: 'diagnosing',
    contextIndex: createContextIndex(),
    registryIndex: createRegistry(),
    lockFile: { assets: [] },
  });

  assert(plan.assetsToLoad.some((asset) => asset.slug === 'diagnostic-agent'));
  assert.strictEqual(plan.requiredAgents[0], 'diagnostic-agent');
}

function testMissingStageUsesDefaultRule() {
  const contextIndex = createContextIndex();
  contextIndex.stageLoadRules = contextIndex.stageLoadRules.filter((item) => item.stage !== 'review');

  const plan = new ContextPlanner().plan({
    stage: 'review',
    contextIndex,
    registryIndex: createRegistry(),
    lockFile: { assets: [] },
  });

  assert.strictEqual(plan.maxAssets, 6);
  assert.deepStrictEqual(plan.loadKinds, ['rule']);
  assert(plan.assetsToLoad.every((asset) => asset.kind === 'rule'));
}

function testIllegalStageFailsInChinese() {
  assert.throws(() => new ContextPlanner().plan({
    stage: 'bad-stage',
    contextIndex: createContextIndex(),
    registryIndex: createRegistry(),
    lockFile: { assets: [] },
  }), /非法 Context stage/);
}

function main() {
  testPlanningLoadsOnlyRoleAndFlow();
  testImplementationLoadsRuleSkillAgentProfile();
  testVerificationLoadsRuleAndFlow();
  testDiagnosingLoadsDiagnosticAgent();
  testMissingStageUsesDefaultRule();
  testIllegalStageFailsInChinese();
  console.log('context-planner tests passed');
}

main();
