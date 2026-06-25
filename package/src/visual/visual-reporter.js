const { resolveVisualConfig } = require('./visual-config');
const { VisualClient } = require('./visual-client');
const { VisualConnector } = require('../connectors/visual');
const {
  buildHistoryPayload,
  buildIncidentPayload,
  buildProjectStatePayload,
  buildRunEventPayload,
} = require('./event-mapper');

function warning(message, code = 'VISUAL_REPORT_WARNING') {
  return { ok: false, skipped: true, warning: message, code };
}

class VisualReporter {
  constructor(options = {}) {
    this.visualClient = options.visualClient || new VisualClient();
    this.visualConnector = options.visualConnector || new VisualConnector({
      visualClient: this.visualClient,
      queueDir: options.queueDir,
    });
  }

  resolve(rootDir, options = {}) {
    return resolveVisualConfig(rootDir, options);
  }

  async send(rootDir, type, payload, options = {}) {
    const config = this.resolve(rootDir, options);
    if (!config.url || config.enabled === false) {
      return warning('未配置 Visual URL，已跳过运行态上报', 'VISUAL_URL_MISSING');
    }
    try {
      let data;
      if (type === 'project-state') {
        data = await this.visualClient.sendProjectState(payload, { visualUrl: config.url });
      } else if (type === 'run-event') {
        const result = await this.visualConnector.reportRunEvent(payload, {
          visualUrl: config.url,
          enabled: config.enabled !== false,
        });
        if (!result.ok) return result;
        data = result.data;
      } else if (type === 'history') {
        data = await this.visualClient.sendHistory(payload, { visualUrl: config.url });
      } else if (type === 'incident') {
        data = await this.visualClient.sendIncident(payload, { visualUrl: config.url });
      } else {
        return warning(`未知 Visual 上报类型：${type}`, 'VISUAL_TYPE_UNKNOWN');
      }
      return { ok: true, skipped: false, data, warning: null };
    } catch (error) {
      return warning(`Visual 上报失败，已忽略：${error.message}`, error.code || 'VISUAL_REPORT_FAILED');
    }
  }

  reportProjectState(rootDir, options = {}) {
    return this.send(rootDir, 'project-state', buildProjectStatePayload(rootDir, options), options);
  }

  reportRunEvent(rootDir, run, event, options = {}) {
    return this.send(rootDir, 'run-event', buildRunEventPayload(rootDir, run, event, options), options);
  }

  reportHistory(rootDir, run, options = {}) {
    return this.send(rootDir, 'history', buildHistoryPayload(rootDir, run, options), options);
  }

  reportIncident(rootDir, incident, options = {}) {
    return this.send(rootDir, 'incident', buildIncidentPayload(rootDir, incident, options), options);
  }

  reportRunEventNonBlocking(rootDir, run, event, options = {}) {
    this.reportRunEvent(rootDir, run, event, options).catch(() => {});
  }

  reportHistoryNonBlocking(rootDir, run, options = {}) {
    this.reportHistory(rootDir, run, options).catch(() => {});
  }

  reportIncidentNonBlocking(rootDir, incident, options = {}) {
    this.reportIncident(rootDir, incident, options).catch(() => {});
  }
}

module.exports = {
  VisualReporter,
};
