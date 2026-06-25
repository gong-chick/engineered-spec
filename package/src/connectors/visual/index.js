const { normalizeEvidenceReport, normalizeFinalStatus } = require('./evidence-report');
const { VisualFailureQueue, defaultVisualQueueDir } = require('./queue');
const { normalizeRunEvent, normalizeSeverity, normalizeStatus } = require('./run-event');
const { VisualConnector } = require('./visual-connector');

module.exports = {
  VisualConnector,
  VisualFailureQueue,
  defaultVisualQueueDir,
  normalizeEvidenceReport,
  normalizeFinalStatus,
  normalizeRunEvent,
  normalizeSeverity,
  normalizeStatus,
};
