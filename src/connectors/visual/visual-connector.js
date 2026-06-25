const { VisualClient } = require('../../visual/visual-client');
const { normalizeEvidenceReport } = require('./evidence-report');
const { normalizeRunEvent } = require('./run-event');
const { VisualFailureQueue } = require('./queue');

function skipped(message, code) {
  return { ok: false, skipped: true, warning: message, code };
}

class VisualConnector {
  constructor(options = {}) {
    this.client = options.client || options.visualClient || new VisualClient(options);
    this.queue = options.queue || new VisualFailureQueue(options);
  }

  async reportRunEvent(payload = {}, options = {}) {
    return this.report('run-event', normalizeRunEvent(payload), options);
  }

  async reportEvidenceReport(payload = {}, options = {}) {
    return this.report('evidence-report', normalizeEvidenceReport(payload), {
      endpoint: '/api/collector/evidence-report',
      ...options,
    });
  }

  async report(type, payload = {}, options = {}) {
    if (options.enabled === false) {
      return skipped('Visual 上报开关已关闭，已跳过。', 'VISUAL_DISABLED');
    }
    const visualUrl = options.visualUrl || payload.visualUrl || '';
    if (!visualUrl) {
      return skipped('未配置 Visual URL，已跳过运行态上报。', 'VISUAL_URL_MISSING');
    }
    const endpoint = options.endpoint || '/api/collector/run-event';
    let safePayload = payload;
    try {
      if (this.client.privacyFilter && typeof this.client.privacyFilter.filter === 'function') {
        safePayload = this.client.privacyFilter.filter(payload);
      }
    } catch (error) {
      return {
        ok: false,
        skipped: true,
        queued: false,
        warning: `Visual 上报因隐私策略被拦截：${error.message}`,
        code: error.code || 'PRIVACY_POLICY_VIOLATED',
      };
    }
    try {
      const data = type === 'run-event'
        ? await this.client.sendRunEvent(safePayload, { visualUrl })
        : await this.client.post(endpoint, safePayload, { visualUrl });
      return { ok: true, skipped: false, data, warning: null };
    } catch (error) {
      const queued = this.queue.enqueue({
        type,
        endpoint,
        payload: safePayload,
        reason: error.message,
        code: error.code || 'VISUAL_REPORT_FAILED',
      });
      return {
        ok: false,
        skipped: true,
        queued: true,
        queueFile: queued.filePath,
        warning: `Visual 上报失败，已写入失败队列：${error.message}`,
        code: error.code || 'VISUAL_REPORT_FAILED',
      };
    }
  }
}

module.exports = {
  VisualConnector,
};
