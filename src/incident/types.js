const INCIDENT_SCHEMA_VERSION = '1.0.0';

const INCIDENT_TYPES = [
  'token-budget-exceeded',
  'invalid-state-transition',
  'executor-timeout',
  'stage-failed',
  'asset-check-failed',
  'context-build-failed',
  'worktree-create-failed',
  'unknown',
];

function normalizeIncidentType(type) {
  return INCIDENT_TYPES.includes(type) ? type : 'unknown';
}

module.exports = {
  INCIDENT_SCHEMA_VERSION,
  INCIDENT_TYPES,
  normalizeIncidentType,
};
