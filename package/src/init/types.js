const INIT_SCHEMA_VERSION = '1.0.0';

const INIT_FILE_ACTIONS = Object.freeze({
  CREATE: 'create',
  UPDATE: 'update',
  SKIP: 'skip',
});

const PROJECT_KINDS = Object.freeze({
  APPLICATION: 'application',
  CLI_TOOL: 'cli-tool',
  LIBRARY: 'library',
  UNKNOWN: 'unknown',
});

const MANIFEST_CONFIDENCE = Object.freeze({
  AUTO_SELECT: 80,
  REQUIRE_CONFIRM: 60,
});

module.exports = {
  INIT_SCHEMA_VERSION,
  INIT_FILE_ACTIONS,
  MANIFEST_CONFIDENCE,
  PROJECT_KINDS,
};
