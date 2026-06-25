const { HubClient } = require('./hub-client');
const { resolveHubConfig } = require('./hub-config');
const { readProjectState } = require('../project/project-files');

class RuntimeFeedbackReporter {
  constructor(options = {}) {
    this.hubClient = options.hubClient || new HubClient();
  }

  async report(rootDir, run, executorResult = {}, options = {}) {
    const hubConfig = resolveHubConfig(rootDir, options);
    if (!hubConfig.url || hubConfig.enabled === false) {
      return {
        ok: false,
        skipped: true,
        warning: '未配置 Hub URL，已跳过 Runtime Feedback 上报',
      };
    }
    const state = readProjectState(rootDir);
    const payload = {
      projectId: state.project?.projectId || state.lock?.projectId || '',
      runId: run.runId || '',
      manifest: {
        slug: state.project?.manifest?.slug || state.lock?.manifest?.slug || '',
        version: state.project?.manifest?.version || state.lock?.manifest?.version || '1.0.0',
      },
      assetsUsed: [],
      executor: executorResult.selection?.executor || run.executor?.type || '',
      result: {
        status: executorResult.status || 'unknown',
        success: executorResult.success === true,
        durationMs: 0,
      },
      issues: (executorResult.riskList || []).map((item) => ({
        code: item.code || item.level || 'RISK',
        message: item.message || item.summary || String(item),
      })),
    };
    try {
      const data = await this.hubClient.sendRuntimeFeedback(payload, { hubUrl: hubConfig.url });
      return { ok: true, skipped: false, data, warning: null };
    } catch (error) {
      return {
        ok: false,
        skipped: true,
        warning: `Runtime Feedback 上报失败，已忽略：${error.message}`,
        code: error.code || 'RUNTIME_FEEDBACK_FAILED',
      };
    }
  }
}

module.exports = {
  RuntimeFeedbackReporter,
};
