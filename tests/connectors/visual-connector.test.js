const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { VisualConnector, VisualFailureQueue, normalizeEvidenceReport, normalizeRunEvent } = require('../../src/connectors/visual');
const { startVisualServer, createTempDir } = require('../visual/visual-test-utils');

async function testRunEventUsesFrozenContractAndKeepsLegacyFields() {
  const server = await startVisualServer();
  try {
    const connector = new VisualConnector();
    const result = await connector.reportRunEvent({
      eventId: 'evt_contract',
      runId: 'run_contract',
      projectId: 'proj_contract',
      type: 'hook.finished',
      state: 'post-test',
      level: 'info',
      status: 'passed',
      payload: { hookId: 'post-test' },
      occurredAt: '2026-05-07T00:00:00Z',
    }, { visualUrl: server.url });

    assert.strictEqual(result.ok, true);
    const request = server.requests.find((item) => item.url === '/api/collector/run-event');
    assert(request);
    assert.strictEqual(request.body.eventType, 'hook.finished');
    assert.strictEqual(request.body.type, 'hook.finished');
    assert.strictEqual(request.body.stage, 'post-test');
    assert.strictEqual(request.body.status, 'success');
    assert.strictEqual(request.body.severity, 'info');
    assert.strictEqual(request.body.timestamp, '2026-05-07T00:00:00Z');
    assert.strictEqual(request.body.metadata.hookId, 'post-test');
  } finally {
    await server.close();
  }
}

async function testFailureWritesRecoverableQueueWithoutBlocking() {
  const server = await startVisualServer({ failAll: true });
  const queueDir = createTempDir('ai-spec-visual-queue-');
  try {
    const connector = new VisualConnector({ queue: new VisualFailureQueue({ queueDir }) });
    const result = await connector.reportRunEvent({
      eventId: 'evt_fail',
      runId: 'run_fail',
      projectId: 'proj_fail',
      eventType: 'test.failed',
      stage: 'test',
      status: 'failed',
      timestamp: '2026-05-07T00:00:00Z',
    }, { visualUrl: server.url });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.queued, true);
    const queuedFiles = fs.readdirSync(queueDir);
    assert.strictEqual(queuedFiles.length, 1);
    const queued = JSON.parse(fs.readFileSync(path.join(queueDir, queuedFiles[0]), 'utf8'));
    assert.strictEqual(queued.type, 'run-event');
    assert.strictEqual(queued.payload.eventType, 'test.failed');
    assert(!JSON.stringify(queued).includes('/Users/'));
  } finally {
    await server.close();
  }
}

function testNormalizers() {
  const runEvent = normalizeRunEvent({ runId: 'run', projectId: 'project', type: 'repair.done', status: '通过', occurredAt: '2026-05-07T00:00:00Z' });
  assert.strictEqual(runEvent.eventType, 'repair.done');
  assert.strictEqual(runEvent.status, 'success');
  assert.strictEqual(runEvent.timestamp, '2026-05-07T00:00:00Z');

  const evidence = normalizeEvidenceReport({
    runId: 'run',
    projectId: 'project',
    finalStatus: '阻塞',
    changedFiles: [{ path: 'src/index.js', action: 'updated' }],
  });
  assert.strictEqual(evidence.finalStatus, 'blocked');
  assert.strictEqual(evidence.changedFiles[0].changeType, 'updated');
}

async function main() {
  testNormalizers();
  await testRunEventUsesFrozenContractAndKeepsLegacyFields();
  await testFailureWritesRecoverableQueueWithoutBlocking();
  console.log('visual-connector tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
