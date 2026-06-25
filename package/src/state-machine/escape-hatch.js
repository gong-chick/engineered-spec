const { IncidentWriter } = require('../incident/incident-writer');
const { RunService } = require('../run/run-service');

function chooseNextState(failure = {}) {
  if (failure.code === 'WORKTREE_CREATE_FAILED') return 'suspended';
  if (failure.code === 'INVALID_STATE_TRANSITION') return 'human_review';
  return 'diagnosing';
}

class EscapeHatch {
  constructor(options = {}) {
    this.runService = options.runService || new RunService();
    this.incidentWriter = options.incidentWriter || new IncidentWriter({ visualOptions: options.visualOptions || {} });
  }

  async handle(input = {}) {
    const failure = input.failure || {};
    const run = input.run;
    const nextState = chooseNextState(failure);
    const diagnosticSummary = `阶段 ${failure.stage || run.stage} 发生异常：${failure.message || '未知错误'}`;
    const suggestedActions = [
      '检查 run.json 中的状态和事件时间线',
      '检查 incident 文件中的错误类型和建议',
      '确认 lock / registry / context-index 是否一致',
    ];
    const incident = this.incidentWriter.write({
      rootDir: input.rootDir,
      runId: run.runId,
      type: failure.code === 'CONTEXT_BUILD_FAILED' ? 'context-build-failed' : 'unknown',
      level: nextState === 'suspended' ? 'fatal' : 'error',
      stage: failure.stage || run.stage,
      message: diagnosticSummary,
      suggestion: suggestedActions.join('；'),
    });
    this.runService.appendIncident(input.rootDir, run.runId, incident);
    this.runService.transition(input.rootDir, run.runId, nextState, `异常逃逸：${diagnosticSummary}`);
    return {
      nextState,
      diagnosticSummary,
      suggestedActions,
      canAutoRecover: false,
    };
  }
}

module.exports = {
  EscapeHatch,
  chooseNextState,
};
