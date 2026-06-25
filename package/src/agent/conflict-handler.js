/**
 * Conflict Handler — 多 Agent 冲突处理与人工门禁
 *
 * 处理多 Agent 同时修改同一文件的冲突，提供文件锁和人工审批队列。
 */

// ============================================================
// 文件锁
// ============================================================

class FileLockManager {
  constructor() {
    /** @type {Map<string, FileLock>} filePath → lock */
    this.locks = new Map();
  }

  /**
   * 尝试获取文件锁
   * @param {string} filePath
   * @param {string} agentId
   * @returns {{ ok: boolean, error?: string }}
   */
  acquire(filePath, agentId) {
    const existing = this.locks.get(filePath);

    if (existing && existing.agentId !== agentId) {
      return { ok: false, error: `文件 ${filePath} 已被 Agent ${existing.agentId} 锁定` };
    }

    if (existing && existing.agentId === agentId) {
      // 同一 Agent 重复获取，刷新时间
      existing.acquiredAt = new Date().toISOString();
      return { ok: true };
    }

    this.locks.set(filePath, {
      filePath,
      agentId,
      acquiredAt: new Date().toISOString(),
    });

    return { ok: true };
  }

  /**
   * 释放文件锁
   * @param {string} filePath
   * @param {string} agentId
   * @returns {{ ok: boolean, error?: string }}
   */
  release(filePath, agentId) {
    const existing = this.locks.get(filePath);

    if (!existing) {
      return { ok: true }; // 已释放
    }

    if (existing.agentId !== agentId) {
      return { ok: false, error: `文件 ${filePath} 由 Agent ${existing.agentId} 锁定，不能由 ${agentId} 释放` };
    }

    this.locks.delete(filePath);
    return { ok: true };
  }

  /**
   * 强制释放文件锁
   * @param {string} filePath
   */
  forceRelease(filePath) {
    this.locks.delete(filePath);
  }

  /**
   * 释放指定 Agent 的所有锁
   * @param {string} agentId
   * @returns {string[]} 被释放的文件列表
   */
  releaseAll(agentId) {
    const released = [];
    for (const [filePath, lock] of this.locks) {
      if (lock.agentId === agentId) {
        this.locks.delete(filePath);
        released.push(filePath);
      }
    }
    return released;
  }

  /**
   * 检查文件是否被锁定
   * @param {string} filePath
   * @returns {FileLock|null}
   */
  getLock(filePath) {
    return this.locks.get(filePath) || null;
  }

  /**
   * 获取指定 Agent 锁定的所有文件
   * @param {string} agentId
   * @returns {string[]}
   */
  getAgentLocks(agentId) {
    const files = [];
    for (const [filePath, lock] of this.locks) {
      if (lock.agentId === agentId) {
        files.push(filePath);
      }
    }
    return files;
  }

  /**
   * 获取所有锁
   * @returns {Array<FileLock>}
   */
  getAllLocks() {
    return [...this.locks.values()];
  }
}

// ============================================================
// 冲突检测
// ============================================================

/**
 * 检测文件修改冲突
 * @param {Array<{ agentId: string, files: string[] }>} agentFileLists - 各 Agent 计划修改的文件列表
 * @returns {Array<ConflictEntry>}
 */
function detectConflicts(agentFileLists) {
  const conflicts = [];
  const fileAgents = new Map();

  for (const { agentId, files } of agentFileLists) {
    for (const filePath of files) {
      if (!fileAgents.has(filePath)) {
        fileAgents.set(filePath, []);
      }
      fileAgents.get(filePath).push(agentId);
    }
  }

  for (const [filePath, agents] of fileAgents) {
    if (agents.length > 1) {
      conflicts.push({
        filePath,
        agents: [...new Set(agents)],
        detectedAt: new Date().toISOString(),
      });
    }
  }

  return conflicts;
}

// ============================================================
// 人工审批队列
// ============================================================

class ApprovalQueue {
  constructor() {
    /** @type {Array<ApprovalRequest>} */
    this.pending = [];
    /** @type {Array<ApprovalRequest>} */
    this.processed = [];
  }

  /**
   * 提交审批请求
   * @param {Object} params
   * @param {string} params.agentId - 请求 Agent
   * @param {string} params.type - 请求类型 (file-conflict/manual-review/tool-override)
   * @param {Object} params.details - 请求详情
   * @returns {ApprovalRequest}
   */
  submit({ agentId, type, details = {} }) {
    const request = {
      id: `approval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      agentId,
      type,
      details,
      status: 'pending',
      submittedAt: new Date().toISOString(),
      resolvedAt: null,
      resolvedBy: null,
      resolution: null,
    };
    this.pending.push(request);
    return request;
  }

  /**
   * 批准请求
   * @param {string} requestId
   * @param {string} [resolvedBy] - 审批人
   * @param {string} [comment] - 审批意见
   * @returns {{ ok: boolean, error?: string }}
   */
  approve(requestId, resolvedBy = 'human', comment = '') {
    const request = this.pending.find((r) => r.id === requestId);
    if (!request) {
      return { ok: false, error: `审批请求不存在: ${requestId}` };
    }

    request.status = 'approved';
    request.resolvedAt = new Date().toISOString();
    request.resolvedBy = resolvedBy;
    request.resolution = comment || '已批准';

    this.pending = this.pending.filter((r) => r.id !== requestId);
    this.processed.push(request);
    return { ok: true };
  }

  /**
   * 拒绝请求
   * @param {string} requestId
   * @param {string} [resolvedBy] - 审批人
   * @param {string} [comment] - 拒绝原因
   * @returns {{ ok: boolean, error?: string }}
   */
  reject(requestId, resolvedBy = 'human', comment = '') {
    const request = this.pending.find((r) => r.id === requestId);
    if (!request) {
      return { ok: false, error: `审批请求不存在: ${requestId}` };
    }

    request.status = 'rejected';
    request.resolvedAt = new Date().toISOString();
    request.resolvedBy = resolvedBy;
    request.resolution = comment || '已拒绝';

    this.pending = this.pending.filter((r) => r.id !== requestId);
    this.processed.push(request);
    return { ok: true };
  }

  /**
   * 获取待审批列表
   * @param {string} [agentId] - 可选，按 Agent 过滤
   * @returns {Array<ApprovalRequest>}
   */
  getPending(agentId) {
    if (agentId) {
      return this.pending.filter((r) => r.agentId === agentId);
    }
    return [...this.pending];
  }

  /**
   * 获取已处理列表
   * @returns {Array<ApprovalRequest>}
   */
  getProcessed() {
    return [...this.processed];
  }

  /**
   * 获取统计
   * @returns {{ pending: number, approved: number, rejected: number }}
   */
  getStats() {
    return {
      pending: this.pending.length,
      approved: this.processed.filter((r) => r.status === 'approved').length,
      rejected: this.processed.filter((r) => r.status === 'rejected').length,
    };
  }
}

// ============================================================
// ConflictHandler — 整合管理器
// ============================================================

class ConflictHandler {
  constructor() {
    this.fileLockManager = new FileLockManager();
    this.approvalQueue = new ApprovalQueue();
  }

  /**
   * 尝试锁定文件（冲突时自动提交审批）
   * @param {string} filePath
   * @param {string} agentId
   * @param {Object} [conflictDetails] - 冲突详情
   * @returns {{ ok: boolean, locked: boolean, approvalId?: string, error?: string }}
   */
  lockOrQueue(filePath, agentId, conflictDetails = {}) {
    const lockResult = this.fileLockManager.acquire(filePath, agentId);

    if (lockResult.ok) {
      return { ok: true, locked: true };
    }

    // 锁冲突 — 提交审批
    const approval = this.approvalQueue.submit({
      agentId,
      type: 'file-conflict',
      details: {
        filePath,
        currentLock: this.fileLockManager.getLock(filePath),
        ...conflictDetails,
      },
    });

    return { ok: true, locked: false, approvalId: approval.id };
  }

  /**
   * 释放 Agent 的所有锁和资源
   * @param {string} agentId
   */
  releaseAgent(agentId) {
    this.fileLockManager.releaseAll(agentId);
  }

  /**
   * 获取总体状态
   * @returns {Object}
   */
  getStatus() {
    return {
      activeLocks: this.fileLockManager.getAllLocks().length,
      pendingApprovals: this.approvalQueue.getPending().length,
      processedApprovals: this.approvalQueue.getProcessed().length,
    };
  }
}

/**
 * @typedef {Object} FileLock
 * @property {string} filePath
 * @property {string} agentId
 * @property {string} acquiredAt
 */

/**
 * @typedef {Object} ApprovalRequest
 * @property {string} id
 * @property {string} agentId
 * @property {string} type
 * @property {Object} details
 * @property {string} status - pending/approved/rejected
 * @property {string} submittedAt
 * @property {string|null} resolvedAt
 * @property {string|null} resolvedBy
 * @property {string|null} resolution
 */

/**
 * @typedef {Object} ConflictEntry
 * @property {string} filePath
 * @property {string[]} agents
 * @property {string} detectedAt
 */

module.exports = {
  FileLockManager,
  ApprovalQueue,
  ConflictHandler,
  detectConflicts,
};
