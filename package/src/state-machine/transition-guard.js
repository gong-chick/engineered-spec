const { StateMachineError } = require('./types');

const TRANSITIONS = new Map([
  ['initialized', ['planning']],
  ['planning', ['branch_preparing']],
  ['branch_preparing', ['context_building']],
  ['context_building', ['human_review', 'executing']],
  ['executing', ['verifying', 'diagnosing', 'human_review']],
  ['verifying', ['completed', 'diagnosing']],
  ['diagnosing', ['recovering', 'human_review']],
  ['recovering', ['executing', 'human_review']],
  ['human_review', ['executing', 'cancelled']],
  ['suspended', ['diagnosing', 'cancelled']],
  ['completed', ['archived']],
]);

const ANY_TARGETS = new Set(['failed', 'suspended', 'cancelled']);

class TransitionGuard {
  isAllowed(from, to) {
    if (ANY_TARGETS.has(to)) return true;
    return (TRANSITIONS.get(from) || []).includes(to);
  }

  assertAllowed(from, to) {
    if (!this.isAllowed(from, to)) {
      throw new StateMachineError('INVALID_STATE_TRANSITION', `不允许从 ${from} 流转到 ${to}`);
    }
    return true;
  }
}

module.exports = {
  TRANSITIONS,
  TransitionGuard,
};
