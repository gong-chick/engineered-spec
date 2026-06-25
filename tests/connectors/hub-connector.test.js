const assert = require('assert');
const { normalizeAssetPackage, normalizeAssetUsageFeedback, buildUsageFeedbackList } = require('../../src/connectors/hub');

function testAssetPackageNormalizer() {
  const asset = normalizeAssetPackage({
    kind: 'skill',
    assetId: 'execute-task',
    version: '1.0.0',
    installPath: '.agents/skills/execute-task/SKILL.md',
    checksum: 'sha256:file',
    generatedFiles: [{ path: '.agents/skills/execute-task/SKILL.md', checksum: 'sha256:file' }],
  });
  assert.strictEqual(asset.assetId, 'execute-task');
  assert.strictEqual(asset.assetType, 'skill');
  assert.strictEqual(asset.name, 'execute-task');
  assert.strictEqual(asset.source, 'skill-q-platform');
  assert.deepStrictEqual(asset.files, [{ path: '.agents/skills/execute-task/SKILL.md', checksum: 'sha256:file' }]);
}

function testAssetPackageRejectsAbsolutePath() {
  assert.throws(
    () => normalizeAssetPackage({ kind: 'rule', assetId: 'bad', files: [{ path: '/Users/demo/bad.md' }] }),
    /资产文件路径非法/,
  );
}

function testUsageFeedbackNormalizer() {
  const feedback = normalizeAssetUsageFeedback({
    runId: 'run_1',
    projectId: 'project_1',
    asset: { assetId: 'rule.react.basic', kind: 'rule' },
    result: { status: 'success', success: true },
    timestamp: '2026-05-07T00:00:00Z',
  });
  assert.strictEqual(feedback.runId, 'run_1');
  assert.strictEqual(feedback.assetId, 'rule.react.basic');
  assert.strictEqual(feedback.assetType, 'rule');
  assert.strictEqual(feedback.status, 'success');
  assert.strictEqual(feedback.metrics.testPassed, true);
  assert.strictEqual(feedback.timestamp, '2026-05-07T00:00:00Z');
}

function testUsageFeedbackListFromAssetsUsed() {
  const feedback = buildUsageFeedbackList({
    runId: 'run_1',
    projectId: 'project_1',
    status: 'failed',
    assetsUsed: [
      { assetId: 'rule.a', kind: 'rule' },
      { assetId: 'skill.b', kind: 'skill' },
    ],
  });
  assert.strictEqual(feedback.length, 2);
  assert.strictEqual(feedback[0].status, 'failure');
  assert.strictEqual(feedback[1].assetType, 'skill');
}

function main() {
  testAssetPackageNormalizer();
  testAssetPackageRejectsAbsolutePath();
  testUsageFeedbackNormalizer();
  testUsageFeedbackListFromAssetsUsed();
  console.log('hub-connector tests passed');
}

main();
