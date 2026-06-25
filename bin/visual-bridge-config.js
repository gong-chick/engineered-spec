const fs = require('fs');
const path = require('path');

const VISUAL_BRIDGE_STATE_REL_PATH = '.ai-spec/visual-bridge.json';

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath, label) {
  const raw = fs.readFileSync(filePath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (_error) {
    throw new Error(`${label} 不是合法 JSON: ${filePath}`);
  }
}

function normalizeOptionalString(value) {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function normalizeBoolean(value, fallback = false) {
  if (value == null) return fallback;
  return Boolean(value);
}

function getVisualBridgeStatePath(targetDir) {
  return path.join(targetDir, VISUAL_BRIDGE_STATE_REL_PATH);
}

function readVisualBridgeState(targetDir) {
  const statePath = getVisualBridgeStatePath(targetDir);
  if (!fs.existsSync(statePath)) {
    return null;
  }
  return readJson(statePath, 'visual bridge state');
}

function normalizeVisualBridgeManifest(value, fallbackValue = null) {
  const raw = value === undefined ? fallbackValue : value;
  if (raw == null) {
    return null;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Manifest visual_bridge（可视化桥接配置）必须是对象');
  }

  return {
    enabled: normalizeBoolean(raw.enabled, false),
    server_url: normalizeOptionalString(raw.server_url),
    workspace_id: normalizeOptionalString(raw.workspace_id),
    agent_id: normalizeOptionalString(raw.agent_id) || 'ai-spec-auto',
    push_on_runtime_state: normalizeBoolean(raw.push_on_runtime_state, true),
    push_on_sync: normalizeBoolean(raw.push_on_sync, false),
    fail_open: normalizeBoolean(raw.fail_open, true),
  };
}

function buildVisualBridgeState({
  targetDir = null,
  manifestConfig = null,
  cliVersion = 'workspace',
  source = 'sync',
  previousState = null,
} = {}) {
  const normalizedManifest = normalizeVisualBridgeManifest(manifestConfig);
  if (!normalizedManifest) {
    return null;
  }

  // 关键：update / sync 走到这里时，如果调用方（CLI 参数 / manifest）没有显式给出
  // server_url / workspace_id / agent_id，应该保留历史 state 里的值，而不是清成 null。
  // 否则一次普通 `auto update` 就会把用户在 init 时配好的桥接参数全部抹掉。
  const previousServerUrl = normalizeOptionalString(previousState?.server_url);
  const previousWorkspaceId = normalizeOptionalString(previousState?.workspace_id);
  const previousAgentId = normalizeOptionalString(previousState?.agent_id);

  const state = {
    schema_version: 1,
    enabled: normalizedManifest.enabled,
    server_url: normalizedManifest.server_url ?? previousServerUrl,
    workspace_id: normalizedManifest.workspace_id ?? previousWorkspaceId,
    agent_id: normalizedManifest.agent_id || previousAgentId || 'ai-spec-auto',
    connect_token: normalizeOptionalString(previousState?.connect_token),
    push_on_runtime_state: normalizedManifest.push_on_runtime_state,
    push_on_sync: normalizedManifest.push_on_sync,
    fail_open: normalizedManifest.fail_open,
    source,
    cli_version: cliVersion,
    updated_at: new Date().toISOString(),
  };

  if (targetDir) {
    state.target_dir = path.resolve(targetDir);
  }

  return state;
}

function writeVisualBridgeState(targetDir, state) {
  const statePath = getVisualBridgeStatePath(targetDir);
  ensureDir(path.dirname(statePath));
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  return statePath;
}

module.exports = {
  VISUAL_BRIDGE_STATE_REL_PATH,
  getVisualBridgeStatePath,
  readVisualBridgeState,
  normalizeVisualBridgeManifest,
  buildVisualBridgeState,
  writeVisualBridgeState,
};
