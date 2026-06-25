/**
 * Collaboration Protocol — Agent 协作协议
 *
 * 定义 Agent 间消息传递、任务分配和状态机管理。
 * Agent 状态机独立于 Run 状态机。
 */

const { AGENT_STATES, VALID_AGENT_STATES, ESCALATION_POLICIES } = require('./agent-types');

// ============================================================
// 状态转换规则
// ============================================================

/** 合法的状态转换表 */
const STATE_TRANSITIONS = Object.freeze({
  [AGENT_STATES.IDLE]: [AGENT_STATES.ASSIGNED],
  [AGENT_STATES.ASSIGNED]: [AGENT_STATES.EXECUTING, AGENT_STATES.IDLE],
  [AGENT_STATES.EXECUTING]: [AGENT_STATES.REVIEWING, AGENT_STATES.COMPLETED, AGENT_STATES.FAILED, AGENT_STATES.BLOCKED],
  [AGENT_STATES.REVIEWING]: [AGENT_STATES.REPAIRING, AGENT_STATES.COMPLETED, AGENT_STATES.FAILED],
  [AGENT_STATES.REPAIRING]: [AGENT_STATES.EXECUTING, AGENT_STATES.REVIEWING, AGENT_STATES.FAILED, AGENT_STATES.BLOCKED],
  [AGENT_STATES.BLOCKED]: [AGENT_STATES.ASSIGNED, AGENT_STATES.EXECUTING, AGENT_STATES.FAILED],
  [AGENT_STATES.COMPLETED]: [],
  [AGENT_STATES.FAILED]: [AGENT_STATES.ASSIGNED],
});

// ============================================================
// AgentState — 单个 Agent 的运行时状态
// ============================================================

class AgentState {
  /**
   * @param {string} agentId
   * @param {Object} [profile]
   */
  constructor(agentId, profile = {}) {
    this.agentId = agentId;
    this.profile = profile;
    this.state = AGENT_STATES.IDLE;
    this.taskId = null;
    this.history = [];
    this.startedAt = null;
    this.updatedAt = new Date().toISOString();
    this.metadata = {};
  }

  /**
   * 尝试转换状态
   * @param {string} newState - 目标状态
   * @param {string} [reason] - 转换原因
   * @returns {{ ok: boolean, error?: string }}
   */
  transition(newState, reason = '') {
    if (!VALID_AGENT_STATES.has(newState)) {
      return { ok: false, error: `非法状态: ${newState}` };
    }

    const allowed = STATE_TRANSITIONS[this.state] || [];
    if (!allowed.includes(newState)) {
      return { ok: false, error: `不允许从 ${this.state} 转换到 ${newState}` };
    }

    this.history.push({
      from: this.state,
      to: newState,
      reason,
      timestamp: new Date().toISOString(),
    });

    this.state = newState;
    this.updatedAt = new Date().toISOString();

    if (newState === AGENT_STATES.EXECUTING && !this.startedAt) {
      this.startedAt = new Date().toISOString();
    }

    return { ok: true };
  }

  /**
   * 检查是否处于终态
   * @returns {boolean}
   */
  isTerminal() {
    return this.state === AGENT_STATES.COMPLETED || this.state === AGENT_STATES.FAILED;
  }

  /**
   * 重置为空闲状态
   */
  reset() {
    this.state = AGENT_STATES.IDLE;
    this.taskId = null;
    this.startedAt = null;
    this.updatedAt = new Date().toISOString();
    this.metadata = {};
  }
}

// ============================================================
// AgentCollaborationProtocol — 协作协议管理器
// ============================================================

class AgentCollaborationProtocol {
  constructor() {
    /** @type {Map<string, AgentState>} */
    this.agents = new Map();
    /** @type {Array<CollaborationMessage>} */
    this.messageQueue = [];
    /** @type {Map<string, string>} taskId → agentId */
    this.taskAssignments = new Map();
  }

  // ============================================================
  // Agent 注册与管理
  // ============================================================

  /**
   * 注册 Agent
   * @param {Object} profile - AgentProfile
   * @returns {AgentState}
   */
  registerAgent(profile) {
    const state = new AgentState(profile.agentId, profile);
    this.agents.set(profile.agentId, state);
    return state;
  }

  /**
   * 注销 Agent
   * @param {string} agentId
   * @returns {boolean}
   */
  unregisterAgent(agentId) {
    return this.agents.delete(agentId);
  }

  /**
   * 获取 Agent 状态
   * @param {string} agentId
   * @returns {AgentState|null}
   */
  getAgentState(agentId) {
    return this.agents.get(agentId) || null;
  }

  /**
   * 列出所有已注册 Agent
   * @returns {Array<{ agentId: string, state: string, taskId: string|null }>}
   */
  listAgents() {
    const list = [];
    for (const [agentId, agentState] of this.agents) {
      list.push({
        agentId,
        state: agentState.state,
        taskId: agentState.taskId,
      });
    }
    return list;
  }

  /**
   * 获取空闲 Agent 列表
   * @returns {AgentState[]}
   */
  getIdleAgents() {
    const idle = [];
    for (const agentState of this.agents.values()) {
      if (agentState.state === AGENT_STATES.IDLE) {
        idle.push(agentState);
      }
    }
    return idle;
  }

  // ============================================================
  // 任务分配
  // ============================================================

  /**
   * 分配任务给 Agent
   * @param {string} agentId
   * @param {string} taskId
   * @param {Object} [taskMeta] - 任务元数据
   * @returns {{ ok: boolean, error?: string }}
   */
  assignTask(agentId, taskId, taskMeta = {}) {
    const agentState = this.agents.get(agentId);
    if (!agentState) {
      return { ok: false, error: `Agent 不存在: ${agentId}` };
    }

    if (agentState.state !== AGENT_STATES.IDLE) {
      return { ok: false, error: `Agent ${agentId} 当前状态 ${agentState.state}，无法分配任务` };
    }

    if (this.taskAssignments.has(taskId)) {
      const existingAgent = this.taskAssignments.get(taskId);
      return { ok: false, error: `任务 ${taskId} 已分配给 ${existingAgent}` };
    }

    agentState.taskId = taskId;
    agentState.metadata = { ...taskMeta };

    const transitionResult = agentState.transition(AGENT_STATES.ASSIGNED, `分配任务 ${taskId}`);
    if (!transitionResult.ok) {
      agentState.taskId = null;
      return transitionResult;
    }

    this.taskAssignments.set(taskId, agentId);
    return { ok: true };
  }

  /**
   * 释放任务
   * @param {string} taskId
   * @returns {{ ok: boolean, error?: string }}
   */
  releaseTask(taskId) {
    const agentId = this.taskAssignments.get(taskId);
    if (!agentId) {
      return { ok: false, error: `任务 ${taskId} 未分配` };
    }

    const agentState = this.agents.get(agentId);
    if (agentState) {
      agentState.taskId = null;
      agentState.reset();
    }

    this.taskAssignments.delete(taskId);
    return { ok: true };
  }

  // ============================================================
  // 消息传递
  // ============================================================

  /**
   * 发送消息
   * @param {Object} params
   * @param {string} params.fromAgentId - 发送者
   * @param {string} params.toAgentId - 接收者
   * @param {string} params.type - 消息类型 (task/result/review/repair/escalation)
   * @param {Object} params.payload - 消息内容
   * @returns {CollaborationMessage}
   */
  sendMessage({ fromAgentId, toAgentId, type, payload }) {
    const message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      fromAgentId,
      toAgentId,
      type,
      payload,
      timestamp: new Date().toISOString(),
      read: false,
    };
    this.messageQueue.push(message);
    return message;
  }

  /**
   * 获取指定 Agent 的未读消息
   * @param {string} agentId
   * @returns {Array<CollaborationMessage>}
   */
  getUnreadMessages(agentId) {
    return this.messageQueue.filter((m) => m.toAgentId === agentId && !m.read);
  }

  /**
   * 标记消息为已读
   * @param {string} messageId
   * @returns {boolean}
   */
  markMessageRead(messageId) {
    const msg = this.messageQueue.find((m) => m.id === messageId);
    if (!msg) return false;
    msg.read = true;
    return true;
  }

  // ============================================================
  // 查询与统计
  // ============================================================

  /**
   * 获取协议统计
   * @returns {{ totalAgents: number, byState: Record<string, number>, totalTasks: number, totalMessages: number }}
   */
  getStats() {
    const byState = {};
    for (const agentState of this.agents.values()) {
      byState[agentState.state] = (byState[agentState.state] || 0) + 1;
    }

    return {
      totalAgents: this.agents.size,
      byState,
      totalTasks: this.taskAssignments.size,
      totalMessages: this.messageQueue.length,
    };
  }

  /**
   * 重置协议状态
   */
  reset() {
    for (const agentState of this.agents.values()) {
      agentState.reset();
    }
    this.messageQueue = [];
    this.taskAssignments = new Map();
  }
}

/**
 * @typedef {Object} CollaborationMessage
 * @property {string} id
 * @property {string} fromAgentId
 * @property {string} toAgentId
 * @property {string} type
 * @property {Object} payload
 * @property {string} timestamp
 * @property {boolean} read
 */

module.exports = {
  AgentState,
  AgentCollaborationProtocol,
  STATE_TRANSITIONS,
};
