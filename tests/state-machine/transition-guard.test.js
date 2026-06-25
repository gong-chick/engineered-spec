const assert = require('assert');
const { TransitionGuard } = require('../../src/state-machine/transition-guard');

function assertAllowed(from, to) {
  assert.strictEqual(new TransitionGuard().isAllowed(from, to), true, `${from} -> ${to} 应合法`);
}

function testAllowedTransitions() {
  assertAllowed('initialized', 'planning');
  assertAllowed('planning', 'branch_preparing');
  assertAllowed('branch_preparing', 'context_building');
  assertAllowed('context_building', 'human_review');
  assertAllowed('context_building', 'executing');
  assertAllowed('executing', 'verifying');
  assertAllowed('executing', 'diagnosing');
  assertAllowed('executing', 'human_review');
  assertAllowed('verifying', 'completed');
  assertAllowed('diagnosing', 'recovering');
  assertAllowed('human_review', 'cancelled');
  assertAllowed('completed', 'archived');
  assertAllowed('planning', 'failed');
  assertAllowed('planning', 'suspended');
  assertAllowed('planning', 'cancelled');
}

function testInvalidTransitionThrows() {
  assert.throws(() => new TransitionGuard().assertAllowed('initialized', 'completed'), (error) => {
    assert.strictEqual(error.code, 'INVALID_STATE_TRANSITION');
    assert(error.message.includes('不允许从 initialized 流转到 completed'));
    return true;
  });
  assert.throws(() => new TransitionGuard().assertAllowed('completed', 'executing'), /不允许从 completed 流转到 executing/);
}

function main() {
  testAllowedTransitions();
  testInvalidTransitionThrows();
  console.log('transition-guard tests passed');
}

main();
