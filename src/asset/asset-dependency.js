/**
 * AssetDependency — 资产依赖模型
 *
 * 管理资产间依赖关系的声明、查询、树解析和循环检测，
 * 支持 NDJSON 文件持久化。
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// AssetDependency 类
// ============================================================

class AssetDependency {
  /**
   * @param {object} [options]
   * @param {string} [options.storagePath] - NDJSON 持久化路径
   */
  constructor(options = {}) {
    /** @type {Map<string, object[]>} assetId -> dependency records */
    this._deps = new Map();
    /** @type {string|null} */
    this.storagePath = options.storagePath || null;
    /** @type {object[]} */
    this.loadErrors = [];

    if (this.storagePath) {
      this._loadFromFile();
    }
  }

  // ============================================================
  // NDJSON 持久化
  // ============================================================

  _loadFromFile() {
    if (!this.storagePath) return;

    try {
      if (!fs.existsSync(this.storagePath)) return;
    } catch {
      return;
    }

    let content;
    try {
      content = fs.readFileSync(this.storagePath, 'utf-8');
    } catch {
      return;
    }

    if (!content || !content.trim()) return;

    const lines = content.split('\n');
    this._deps.clear();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      try {
        const entry = JSON.parse(line);

        // tombstone：移除依赖
        if (entry._action === 'remove' && entry.assetId && entry.dependsOn) {
          const list = this._deps.get(entry.assetId);
          if (list) {
            const idx = list.findIndex(d => d.dependsOn === entry.dependsOn);
            if (idx !== -1) list.splice(idx, 1);
            if (list.length === 0) this._deps.delete(entry.assetId);
          }
          continue;
        }

        // 正常记录
        if (entry.assetId && entry.dependsOn) {
          if (!this._deps.has(entry.assetId)) {
            this._deps.set(entry.assetId, []);
          }
          this._deps.get(entry.assetId).push(entry);
        }
      } catch (err) {
        this.loadErrors.push({
          lineNumber: i + 1,
          line: line.substring(0, 200),
          message: err.message || 'JSON 解析失败',
        });
      }
    }
  }

  _appendToFile(entry) {
    if (!this.storagePath) return;

    const dir = path.dirname(this.storagePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const line = JSON.stringify(entry) + '\n';
    fs.appendFileSync(this.storagePath, line, 'utf-8');
  }

  // ============================================================
  // add — 添加依赖
  // ============================================================

  /**
   * 声明依赖关系
   * @param {string} assetId - 资产 ID
   * @param {string} dependsOn - 依赖的资产 ID
   * @param {string} [constraint] - 版本约束
   * @param {object} [options]
   * @param {boolean} [options.optional] - 是否可选
   * @returns {object} 依赖记录
   */
  add(assetId, dependsOn, constraint, options = {}) {
    if (!assetId || typeof assetId !== 'string') {
      throw new Error('assetId 必须为非空字符串');
    }
    if (!dependsOn || typeof dependsOn !== 'string') {
      throw new Error('dependsOn 必须为非空字符串');
    }
    if (assetId === dependsOn) {
      throw new Error('不允许声明自身依赖');
    }

    const list = this._deps.get(assetId) || [];
    if (list.some(d => d.dependsOn === dependsOn)) {
      throw new Error(`依赖已存在: ${assetId} -> ${dependsOn}`);
    }

    const record = {
      assetId,
      dependsOn,
      constraint: constraint || '*',
      optional: options.optional || false,
      createdAt: new Date().toISOString(),
    };

    if (!this._deps.has(assetId)) {
      this._deps.set(assetId, []);
    }
    this._deps.get(assetId).push(record);

    this._appendToFile(record);

    return { ...record };
  }

  // ============================================================
  // remove — 移除依赖
  // ============================================================

  /**
   * 移除依赖关系
   * @param {string} assetId
   * @param {string} dependsOn
   * @returns {boolean}
   */
  remove(assetId, dependsOn) {
    const list = this._deps.get(assetId);
    if (!list) {
      throw new Error(`依赖不存在: ${assetId} -> ${dependsOn}`);
    }

    const idx = list.findIndex(d => d.dependsOn === dependsOn);
    if (idx === -1) {
      throw new Error(`依赖不存在: ${assetId} -> ${dependsOn}`);
    }

    list.splice(idx, 1);
    if (list.length === 0) {
      this._deps.delete(assetId);
    }

    this._appendToFile({ _action: 'remove', assetId, dependsOn, timestamp: new Date().toISOString() });

    return true;
  }

  // ============================================================
  // getDependencies — 获取依赖列表
  // ============================================================

  /**
   * 获取资产的依赖列表
   * @param {string} assetId
   * @returns {object[]}
   */
  getDependencies(assetId) {
    const list = this._deps.get(assetId);
    if (!list) return [];
    return list.map(d => ({ ...d }));
  }

  // ============================================================
  // getDependents — 获取反向依赖
  // ============================================================

  /**
   * 获取依赖此资产的资产列表
   * @param {string} dependsOn
   * @returns {object[]}
   */
  getDependents(dependsOn) {
    const result = [];
    for (const [assetId, list] of this._deps) {
      for (const dep of list) {
        if (dep.dependsOn === dependsOn) {
          result.push({ ...dep });
        }
      }
    }
    return result;
  }

  // ============================================================
  // resolve — 依赖树解析（拓扑序，去重）
  // ============================================================

  /**
   * 解析完整依赖树（BFS，去重，拓扑序）
   * @param {string} assetId
   * @returns {string[]} 依赖资产 ID 列表
   */
  resolve(assetId) {
    const visited = new Set();
    const result = [];
    const queue = [assetId];

    while (queue.length > 0) {
      const current = queue.shift();
      const list = this._deps.get(current) || [];

      for (const dep of list) {
        if (!visited.has(dep.dependsOn)) {
          visited.add(dep.dependsOn);
          result.push(dep.dependsOn);
          queue.push(dep.dependsOn);
        }
      }
    }

    return result;
  }

  // ============================================================
  // hasConflict — 循环依赖检测
  // ============================================================

  /**
   * 检测循环依赖
   * @param {string} assetId
   * @returns {{ hasConflict: boolean, cycle: string[] }}
   */
  hasConflict(assetId) {
    const visited = new Set();
    const inStack = new Set();
    const cyclePath = [];

    const dfs = (node) => {
      if (inStack.has(node)) {
        // 找到循环
        const cycleStart = cyclePath.indexOf(node);
        if (cycleStart !== -1) {
          return cyclePath.slice(cycleStart).concat(node);
        }
        return [node, node];
      }
      if (visited.has(node)) return null;

      visited.add(node);
      inStack.add(node);
      cyclePath.push(node);

      const list = this._deps.get(node) || [];
      for (const dep of list) {
        const result = dfs(dep.dependsOn);
        if (result) return result;
      }

      cyclePath.pop();
      inStack.delete(node);
      return null;
    };

    const cycle = dfs(assetId);
    return {
      hasConflict: cycle !== null,
      cycle: cycle || [],
    };
  }

  // ============================================================
  // getLoadErrors
  // ============================================================

  /** @returns {object[]} */
  getLoadErrors() {
    return this.loadErrors.map(e => ({ ...e }));
  }
}

// ============================================================
// 工厂函数
// ============================================================

/**
 * 创建资产依赖管理器
 * @param {object} [options]
 * @returns {AssetDependency}
 */
function createAssetDependency(options) {
  return new AssetDependency(options);
}

module.exports = {
  createAssetDependency,
  AssetDependency,
};
