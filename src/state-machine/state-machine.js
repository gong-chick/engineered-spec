const { RunService } = require('../run/run-service');
const { TransitionGuard } = require('./transition-guard');

class StateMachine {
  constructor(options = {}) {
    this.runService = options.runService || new RunService();
    this.transitionGuard = options.transitionGuard || new TransitionGuard();
  }

  async transition(input = {}) {
    const run = this.runService.loadRun(input.rootDir, input.runId);
    const from = input.from || run.state;
    const to = input.to;
    this.transitionGuard.assertAllowed(from, to);
    return this.runService.transition(input.rootDir, input.runId, to, input.reason || `状态流转到 ${to}`, {
      from,
      to,
    });
  }
}

module.exports = {
  StateMachine,
};
