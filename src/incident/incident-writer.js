const crypto = require('crypto');
const path = require('path');
const { writeJson } = require('../run/run-store');
const { INCIDENT_SCHEMA_VERSION, normalizeIncidentType } = require('./types');
const { VisualReporter } = require('../visual/visual-reporter');

function createIncidentId(type) {
  return `incident-${Date.now()}-${crypto.createHash('sha256').update(`${type}-${Math.random()}`).digest('hex').slice(0, 6)}`;
}

function sanitizeText(value) {
  return String(value || '')
    .replace(/\/Users\/[^/\s]+/g, '<user-home>')
    .slice(0, 1000);
}

class IncidentWriter {
  constructor(options = {}) {
    this.visualReporter = options.visualReporter || new VisualReporter();
    this.visualOptions = options.visualOptions || {};
  }

  write(input = {}) {
    const incident = {
      schemaVersion: INCIDENT_SCHEMA_VERSION,
      incidentId: input.incidentId || createIncidentId(input.type || 'unknown'),
      runId: input.runId || '',
      type: normalizeIncidentType(input.type),
      level: input.level || 'error',
      stage: input.stage || '',
      message: sanitizeText(input.message || '发生未知异常'),
      suggestion: sanitizeText(input.suggestion || '请查看 run.json 和相关日志后人工处理'),
      createdAt: new Date().toISOString(),
    };
    const filePath = path.join(input.rootDir, '.ai-spec/runs', incident.runId, 'incidents', `${incident.incidentId}.json`);
    writeJson(filePath, incident);
    this.visualReporter.reportIncidentNonBlocking(input.rootDir, incident, {
      ...this.visualOptions,
      visualUrl: input.visualUrl || this.visualOptions.visualUrl,
    });
    return incident;
  }
}

module.exports = {
  IncidentWriter,
};
