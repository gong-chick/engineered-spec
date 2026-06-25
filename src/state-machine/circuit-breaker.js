const { IncidentWriter } = require('../incident/incident-writer');
const { RunService } = require('../run/run-service');
const { DEFAULT_CIRCUIT_BREAKER_POLICY } = require('./types');

function mergePolicy(policy = {}) {
  return {
    ...DEFAULT_CIRCUIT_BREAKER_POLICY,
    ...(policy.circuitBreaker || policy),
  };
}

class CircuitBreaker {
  constructor(options = {}) {
    this.runService = options.runService || new RunService();
    this.incidentWriter = options.incidentWriter || new IncidentWriter({ visualOptions: options.visualOptions || {} });
  }

  decide(input = {}) {
    const policy = mergePolicy(input.policy || {});
    const metrics = input.metrics || {};
    if ((metrics.totalTokens || 0) > policy.maxTotalTokens) {
      return {
        shouldBreak: true,
        nextState: 'suspended',
        reason: `Token 总量 ${metrics.totalTokens} 超过预算 ${policy.maxTotalTokens}`,
        code: 'TOKEN_BUDGET_EXCEEDED',
        incidentType: 'token-budget-exceeded',
      };
    }
    if ((metrics.sameFileModificationCount || 0) > policy.maxSameFileModificationCount) {
      return {
        shouldBreak: true,
        nextState: 'diagnosing',
        reason: '同一文件重复修改次数过多，需要进入诊断',
        code: 'SAME_FILE_MODIFICATION_LIMIT_EXCEEDED',
        incidentType: 'stage-failed',
      };
    }
    if ((metrics.stageFailureCount || 0) > policy.maxStageFailureCount) {
      return {
        shouldBreak: true,
        nextState: 'diagnosing',
        reason: '同一阶段失败次数过多，需要进入诊断',
        code: 'STAGE_FAILURE_LIMIT_EXCEEDED',
        incidentType: 'stage-failed',
      };
    }
    if ((metrics.executorTimeoutCount || 0) > policy.maxExecutorTimeoutCount) {
      return {
        shouldBreak: true,
        nextState: 'suspended',
        reason: '执行器超时次数过多，已挂起',
        code: 'EXECUTOR_TIMEOUT_LIMIT_EXCEEDED',
        incidentType: 'executor-timeout',
      };
    }
    if ((metrics.autoFixAttempts || 0) > policy.maxAutoFixAttempts) {
      return {
        shouldBreak: true,
        nextState: 'human_review',
        reason: '自动修复次数过多，需要人工审核',
        code: 'AUTO_FIX_LIMIT_EXCEEDED',
        incidentType: 'stage-failed',
      };
    }
    return {
      shouldBreak: false,
      nextState: null,
      reason: '未触发熔断',
      code: 'NO_BREAK',
    };
  }

  async evaluate(input = {}) {
    const decision = this.decide(input);
    if (!decision.shouldBreak) return decision;
    const rootDir = input.rootDir;
    const run = input.run;
    const incident = this.incidentWriter.write({
      rootDir,
      runId: run.runId,
      type: decision.incidentType,
      level: decision.nextState === 'suspended' ? 'fatal' : 'error',
      stage: run.stage,
      message: decision.reason,
      suggestion: '请查看 incident 后人工判断是否继续',
    });
    this.runService.appendIncident(rootDir, run.runId, incident);
    this.runService.transition(rootDir, run.runId, decision.nextState, `熔断触发：${decision.reason}`);
    this.runService.updateRun(rootDir, run.runId, (current) => {
      current.circuitBreaker = {
        enabled: true,
        triggered: true,
        reason: decision.reason,
      };
      current.events = current.events || [];
      current.events.push({
        type: 'circuit_breaker_triggered',
        message: decision.reason,
        detail: { code: decision.code, nextState: decision.nextState },
        createdAt: new Date().toISOString(),
      });
      return current;
    });
    return decision;
  }
}

module.exports = {
  CircuitBreaker,
  mergePolicy,
};
