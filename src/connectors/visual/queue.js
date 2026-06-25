const fs = require('fs');
const os = require('os');
const path = require('path');

function defaultVisualQueueDir(homeDir = os.homedir()) {
  return path.join(homeDir, '.ai-spec-auto', 'visual-queue');
}

function sanitizeName(value) {
  return String(value || 'event').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 80);
}

class VisualFailureQueue {
  constructor(options = {}) {
    this.queueDir = options.queueDir || defaultVisualQueueDir(options.homeDir);
  }

  enqueue(record = {}) {
    fs.mkdirSync(this.queueDir, { recursive: true });
    const now = new Date().toISOString();
    const type = sanitizeName(record.type || record.payload?.eventType || record.payload?.type);
    const id = sanitizeName(record.payload?.eventId || record.payload?.runId || Date.now());
    const filePath = path.join(this.queueDir, `${now.replace(/[:.]/g, '-')}-${type}-${id}.json`);
    const entry = {
      schemaVersion: '1.0.0',
      queuedAt: now,
      type: record.type || 'run-event',
      endpoint: record.endpoint || '',
      reason: record.reason || '',
      code: record.code || 'VISUAL_REPORT_FAILED',
      payload: record.payload || {},
    };
    fs.writeFileSync(filePath, `${JSON.stringify(entry, null, 2)}\n`, 'utf8');
    return { filePath, entry };
  }
}

module.exports = {
  VisualFailureQueue,
  defaultVisualQueueDir,
};
