const fs = require('fs');
const path = require('path');
const { DEFAULT_CONFIG } = require('./defaults');

// ============================================================
// 层定义 — 从低优先级到高优先级排列
// ============================================================

/**
 * 配置层顺序（priority 越小越先合并，越后合并越优先覆盖）
 *
 * default → enterprise → global → manifest → agentProfile →
 * workspace → project → team → policy → run → cli
 */
const CONFIG_LAYERS = Object.freeze([
  { id: 'default',      name: '默认配置',     priority: 0 },
  { id: 'enterprise',   name: '企业配置',     priority: 1 },
  { id: 'global',       name: '全局配置',     priority: 2 },
  { id: 'manifest',     name: 'Manifest 配置', priority: 3 },
  { id: 'agentProfile', name: 'Agent Profile', priority: 4 },
  { id: 'workspace',    name: '工作区配置',   priority: 5 },
  { id: 'project',      name: '项目配置',     priority: 6 },
  { id: 'team',         name: '团队配置',     priority: 7 },
  { id: 'policy',       name: '策略配置',     priority: 8 },
  { id: 'run',          name: '运行时配置',   priority: 9 },
  { id: 'cli',          name: 'CLI 参数',     priority: 10 },
]);

const LAYER_IDS = Object.freeze(CONFIG_LAYERS.map((l) => l.id));

// ============================================================
// 只读字段 — 企业级安全底线，任何层不得覆盖
// ============================================================

const READONLY_FIELDS = Object.freeze([
  'privacyPolicy.uploadSourceCode',
  'privacyPolicy.uploadAbsolutePath',
  'privacyPolicy.uploadUserName',
  'privacyPolicy.uploadRawPrompt',
  'privacyPolicy.uploadRawResponse',
  'privacyPolicy.uploadFileContent',
]);

// ============================================================
// 工具函数
// ============================================================

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(...objects) {
  const output = {};
  for (const object of objects) {
    if (!isPlainObject(object)) continue;
    for (const [key, value] of Object.entries(object)) {
      if (isPlainObject(value) && isPlainObject(output[key])) {
        output[key] = deepMerge(output[key], value);
      } else if (Array.isArray(value)) {
        output[key] = [...value];
      } else if (isPlainObject(value)) {
        output[key] = deepMerge(value);
      } else if (value !== undefined) {
        output[key] = value;
      }
    }
  }
  return output;
}

function getNestedValue(obj, dottedPath) {
  const parts = dottedPath.split('.');
  let current = obj;
  for (const part of parts) {
    if (!isPlainObject(current)) return undefined;
    current = current[part];
  }
  return current;
}

function setNestedValue(obj, dottedPath, value) {
  const parts = dottedPath.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!isPlainObject(current[parts[i]])) {
      current[parts[i]] = {};
    }
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
}

// ============================================================
// LayerRegistry — 配置层注册表
// ============================================================

class LayerRegistry {
  constructor() {
    this._layers = new Map();
    for (const layer of CONFIG_LAYERS) {
      this._layers.set(layer.id, { ...layer });
    }
  }

  /**
   * 获取所有层（按优先级升序）
   * @returns {Array<{id: string, name: string, priority: number}>}
   */
  getAll() {
    return [...this._layers.values()].sort((a, b) => a.priority - b.priority);
  }

  /**
   * 获取指定层
   * @param {string} layerId
   * @returns {{id: string, name: string, priority: number}|undefined}
   */
  get(layerId) {
    return this._layers.get(layerId);
  }

  /**
   * 检查层是否存在
   * @param {string} layerId
   * @returns {boolean}
   */
  has(layerId) {
    return this._layers.has(layerId);
  }

  /**
   * 获取层 ID 列表（按优先级升序）
   * @returns {string[]}
   */
  getOrderedIds() {
    return this.getAll().map((l) => l.id);
  }
}

// ============================================================
// 隐私策略强制覆盖
// ============================================================

function forcePrivacyPolicy(config) {
  return deepMerge(config, {
    privacyPolicy: {
      uploadSourceCode: false,
      uploadAbsolutePath: false,
      uploadUserName: false,
      uploadRawPrompt: false,
      uploadRawResponse: false,
      uploadFileContent: false,
    },
  });
}

// ============================================================
// 只读字段保护
// ============================================================

/**
 * 检查只读字段是否被覆盖
 * @param {Object} defaultConfig - 默认配置
 * @param {Object} mergedConfig - 合并后的配置
 * @returns {{ ok: boolean, violations: string[] }}
 */
function checkReadonlyFields(defaultConfig, mergedConfig) {
  const violations = [];

  for (const field of READONLY_FIELDS) {
    const defaultVal = getNestedValue(defaultConfig, field);
    const mergedVal = getNestedValue(mergedConfig, field);

    // 只在字段被显式设置且值不同时才算违规（undefined 表示字段未被设置）
    if (
      mergedVal !== undefined &&
      defaultVal !== undefined &&
      mergedVal !== defaultVal
    ) {
      violations.push(field);
    }
  }

  return { ok: violations.length === 0, violations };
}

// ============================================================
// 冲突检测
// ============================================================

/**
 * 检测层间配置冲突
 * @param {Object} layerData - { layerId: configObj } 的映射
 * @returns {Array<{ field: string, layers: string[], values: any[] }>}
 */
function detectConflicts(layerData) {
  const conflicts = [];
  const fieldLayerMap = new Map();

  // 收集每个字段在哪些层被设置
  for (const [layerId, config] of Object.entries(layerData)) {
    if (!isPlainObject(config)) continue;
    collectFields(config, '', layerId, fieldLayerMap);
  }

  // 检测被多个层设置的字段
  for (const [field, layers] of fieldLayerMap) {
    if (layers.length > 1) {
      // 只有当值不同时才算冲突
      const values = layers.map((l) => ({
        layer: l.layerId,
        value: l.value,
      }));
      const uniqueValues = new Set(values.map((v) => JSON.stringify(v.value)));
      if (uniqueValues.size > 1) {
        conflicts.push({
          field,
          layers: values.map((v) => v.layer),
          values: values.map((v) => v.value),
        });
      }
    }
  }

  return conflicts;
}

function collectFields(obj, prefix, layerId, fieldLayerMap) {
  for (const [key, value] of Object.entries(obj)) {
    const fieldPath = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(value)) {
      collectFields(value, fieldPath, layerId, fieldLayerMap);
    } else {
      if (!fieldLayerMap.has(fieldPath)) {
        fieldLayerMap.set(fieldPath, []);
      }
      fieldLayerMap.get(fieldPath).push({ layerId, value });
    }
  }
}

// ============================================================
// 配置合并 — 按层顺序合并并收集元数据
// ============================================================

/**
 * 合并多层配置
 * @param {Object} layerData - { layerId: configObj } 的映射
 * @returns {{ config: Object, conflicts: Array, readonlyViolations: string[] }}
 */
function mergeConfigs(layerData) {
  const registry = new LayerRegistry();
  const orderedIds = registry.getOrderedIds();

  // 按层顺序合并
  const objects = [];
  for (const layerId of orderedIds) {
    const data = layerData[layerId];
    if (isPlainObject(data)) {
      objects.push(data);
    }
  }

  let merged = deepMerge(...objects);

  // 检测冲突
  const conflicts = detectConflicts(layerData);

  // 只读字段保护
  const defaultConfig = layerData.default || DEFAULT_CONFIG;
  const readonlyCheck = checkReadonlyFields(defaultConfig, merged);
  const readonlyViolations = readonlyCheck.violations;

  // 强制隐私策略
  merged = forcePrivacyPolicy(merged);

  return { config: merged, conflicts, readonlyViolations };
}

// ============================================================
// 从文件加载企业/团队配置
// ============================================================

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    const wrapped = new Error(`配置文件解析失败：${filePath}。请检查 JSON 格式。`);
    wrapped.code = 'VALIDATION_FAILED';
    wrapped.cause = error;
    throw wrapped;
  }
}

/**
 * 从文件系统加载企业配置
 * @param {string} rootDir
 * @returns {Object|null}
 */
function loadEnterpriseConfig(rootDir) {
  // 优先从项目内读取，再从全局读取
  const localPath = path.join(rootDir, '.ai-spec', 'enterprise.json');
  if (fs.existsSync(localPath)) return readJsonIfExists(localPath);

  const globalPath = path.join(
    require('os').homedir(),
    '.ai-spec-auto',
    'enterprise.json',
  );
  return readJsonIfExists(globalPath);
}

/**
 * 从文件系统加载团队配置
 * @param {string} rootDir
 * @returns {Object|null}
 */
function loadTeamConfig(rootDir) {
  const teamPath = path.join(rootDir, '.ai-spec', 'team.json');
  return readJsonIfExists(teamPath);
}

// ============================================================
// 导出
// ============================================================

module.exports = {
  CONFIG_LAYERS,
  LAYER_IDS,
  READONLY_FIELDS,
  LayerRegistry,
  deepMerge,
  mergeConfigs,
  detectConflicts,
  checkReadonlyFields,
  forcePrivacyPolicy,
  loadEnterpriseConfig,
  loadTeamConfig,
  readJsonIfExists,
  getNestedValue,
  setNestedValue,
};
