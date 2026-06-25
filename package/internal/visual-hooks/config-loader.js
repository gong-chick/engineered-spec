/**
 * Visual Config Loader
 * 
 * 功能：加载 .ai-spec/visual-config.json 配置文件
 * 优先级：
 * 1. .ai-spec/visual-config.json（项目级）
 * 2. ~/.ai-spec/visual-config.json（用户级）
 * 3. 环境变量覆盖
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * 加载 visual 配置
 *
 * 历史背景：项目里同时存在两份 visual 相关 JSON
 *   - .ai-spec/visual-bridge.json（由 br-ai-spec CLI sync/init 自动生成，字段名：server_url / enabled / workspace_id / connect_token）
 *   - .ai-spec/visual-config.json（早期 internal/visual-hooks 设计的独立配置，字段名：visual_url / enabled / workspace_id）
 * 为避免用户必须维护两份配置，本 loader 同时识别两种文件并做字段映射：
 *   visual-bridge.json.server_url ⇄ visual-config.json.visual_url
 * 加载优先级（越靠前越高）：
 *   1. 项目级 .ai-spec/visual-config.json（显式配置，向后兼容）
 *   2. 项目级 .ai-spec/visual-bridge.json（CLI 自动产物，零配置默认值）
 *   3. 用户级 ~/.ai-spec/visual-config.json
 *   4. 环境变量覆盖（最终）
 *
 * @returns {VisualConfig | null}
 */
function loadVisualConfig(options = {}) {
  const cwd = path.resolve(options.targetDir || process.cwd());
  let configSource = null;

  // 优先级 1: 项目级 visual-config.json（用户显式配置）
  let config = loadConfigFromFile(path.join(cwd, '.ai-spec/visual-config.json'));
  if (config) configSource = path.join(cwd, '.ai-spec/visual-config.json');

  // 优先级 2: 项目级 visual-bridge.json（CLI 自动产物，自动映射字段名）
  if (!config) {
    const bridgeRaw = loadConfigFromFile(path.join(cwd, '.ai-spec/visual-bridge.json'));
    if (bridgeRaw) {
      config = mapBridgeStateToVisualConfig(bridgeRaw);
      configSource = path.join(cwd, '.ai-spec/visual-bridge.json');
    }
  }

  // 优先级 3: 用户级配置
  if (!config) {
    const userConfigPath = path.join(os.homedir(), '.ai-spec/visual-config.json');
    config = loadConfigFromFile(userConfigPath);
    if (config) configSource = userConfigPath;
  }

  if (!config) {
    return null;
  }

  // 优先级 4: 环境变量覆盖
  config = applyEnvironmentOverrides({
    ...config,
    target_dir: cwd,
    config_source: configSource,
  });

  // 校验必填字段
  if (!validateConfig(config)) {
    console.warn('[visual-hooks] config validation failed');
    return null;
  }

  return config;
}

/**
 * 把 visual-bridge.json 的 schema 映射成 visual-hooks 期待的 VisualConfig schema
 *
 * @param {object} bridgeState
 * @returns {VisualConfig | null}
 */
function mapBridgeStateToVisualConfig(bridgeState) {
  if (!bridgeState || typeof bridgeState !== 'object') {
    return null;
  }
  // 桥接状态文件里 enabled=false / server_url=null 都是合法状态，
  // 但对 hooks 而言这就等于"未配置"，让 validateConfig 决定。
  return {
    enabled: bridgeState.enabled === true,
    visual_url: bridgeState.server_url || null,
    workspace_id: bridgeState.workspace_id || null,
    workspace_name: bridgeState.workspace_name || null,
    push_mode: 'hook',
    push_timeout_ms: bridgeState.push_timeout_ms || 3000,
    retry_times: bridgeState.retry_times != null ? bridgeState.retry_times : 1,
    collector_schedule: null,
    // 透传一些 hooks 可能要消费的桥接字段
    connect_token: bridgeState.connect_token || null,
    agent_id: bridgeState.agent_id || 'ai-spec-auto',
    fail_open: bridgeState.fail_open !== false,
  };
}

/**
 * 从文件加载配置
 * @param {string} filePath
 * @returns {VisualConfig | null}
 */
function loadConfigFromFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const config = JSON.parse(content);
    console.warn(`[visual-hooks] config loaded from: ${filePath}`);
    return config;
  } catch (err) {
    console.warn(`[visual-hooks] failed to load config from ${filePath}:`, err.message);
    return null;
  }
}

/**
 * 应用环境变量覆盖
 * @param {VisualConfig} config
 * @returns {VisualConfig}
 */
function applyEnvironmentOverrides(config) {
  const overrides = { ...config };

  if (process.env.AI_SPEC_VISUAL_ENABLED !== undefined) {
    overrides.enabled = process.env.AI_SPEC_VISUAL_ENABLED === 'true';
  }

  if (process.env.AI_SPEC_VISUAL_URL) {
    overrides.visual_url = process.env.AI_SPEC_VISUAL_URL;
  }

  if (process.env.AI_SPEC_VISUAL_WORKSPACE_ID) {
    overrides.workspace_id = process.env.AI_SPEC_VISUAL_WORKSPACE_ID;
  }

  if (process.env.AI_SPEC_VISUAL_PUSH_TIMEOUT_MS) {
    overrides.push_timeout_ms = parseInt(process.env.AI_SPEC_VISUAL_PUSH_TIMEOUT_MS, 10);
  }

  return overrides;
}

/**
 * 校验配置
 * @param {VisualConfig} config
 * @returns {boolean}
 */
function validateConfig(config) {
  if (!config.visual_url) {
    console.warn('[visual-hooks] config missing: visual_url');
    return false;
  }

  if (!config.workspace_id) {
    console.warn('[visual-hooks] config missing: workspace_id');
    return false;
  }

  // 校验 visual_url 格式
  try {
    new URL(config.visual_url);
  } catch (err) {
    console.warn('[visual-hooks] invalid visual_url:', config.visual_url);
    return false;
  }

  return true;
}

/**
 * 创建默认配置示例文件
 * @param {string} targetPath
 */
function createConfigExample(targetPath) {
  const exampleConfig = {
    $schema: 'https://schemas.br-ai-spec.internal/visual-config.schema.json',
    enabled: false,
    visual_url: 'http://localhost:3000',
    workspace_id: 'my-project',
    workspace_name: '项目显示名称',
    push_mode: 'hook',
    push_timeout_ms: 3000,
    retry_times: 1,
    collector_schedule: null
  };

  try {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(
      targetPath,
      JSON.stringify(exampleConfig, null, 2),
      'utf-8'
    );

    console.warn(`[visual-hooks] config example created: ${targetPath}`);
    return true;
  } catch (err) {
    console.warn(`[visual-hooks] failed to create config example:`, err.message);
    return false;
  }
}

module.exports = {
  loadVisualConfig,
  createConfigExample
};
