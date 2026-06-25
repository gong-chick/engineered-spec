/**
 * Agent 类型常量与枚举
 *
 * 定义 Agent 角色、状态、升级策略等常量，
 * 为 Agent Profile Schema 和协作协议提供统一类型基础。
 */

// ============================================================
// Agent 角色枚举
// ============================================================

/** Agent 角色类型 */
const AGENT_ROLES = Object.freeze({
  /** 架构审查者 — 负责架构边界审查和设计决策 */
  ARCHITECT_REVIEWER: 'architect-reviewer',
  /** 前端实现者 — 负责前端代码实现 */
  FRONTEND_IMPLEMENTER: 'frontend-implementer',
  /** 测试审查者 — 负责测试覆盖和质量审查 */
  TEST_REVIEWER: 'test-reviewer',
  /** 安全审查者 — 负责安全风险审查 */
  SECURITY_REVIEWER: 'security-reviewer',
  /** 自定义角色 */
  CUSTOM: 'custom',
});

/** 所有合法角色值 */
const VALID_AGENT_ROLES = new Set(Object.values(AGENT_ROLES));

// ============================================================
// Agent 状态枚举
// ============================================================

/** Agent 运行时状态 */
const AGENT_STATES = Object.freeze({
  /** 空闲 — 等待分配任务 */
  IDLE: 'idle',
  /** 已分配 — 任务已分配但未开始执行 */
  ASSIGNED: 'assigned',
  /** 执行中 — 正在执行任务 */
  EXECUTING: 'executing',
  /** 审查中 — 正在审查代码或结果 */
  REVIEWING: 'reviewing',
  /** 修复中 — 正在修复问题 */
  REPAIRING: 'repairing',
  /** 阻塞 — 等待外部输入或审批 */
  BLOCKED: 'blocked',
  /** 已完成 — 任务成功完成 */
  COMPLETED: 'completed',
  /** 失败 — 任务执行失败 */
  FAILED: 'failed',
});

/** 所有合法状态值 */
const VALID_AGENT_STATES = new Set(Object.values(AGENT_STATES));

// ============================================================
// 升级策略枚举
// ============================================================

/** 升级策略 — 当 Agent 无法完成任务时的处理方式 */
const ESCALATION_POLICIES = Object.freeze({
  /** 阻塞等待人工介入 */
  BLOCK: 'block',
  /** 重新尝试 */
  RETRY: 'retry',
  /** 跳过当前步骤 */
  SKIP: 'skip',
  /** 终止整个流程 */
  ABORT: 'abort',
});

/** 所有合法升级策略值 */
const VALID_ESCALATION_POLICIES = new Set(Object.values(ESCALATION_POLICIES));

// ============================================================
// 内存访问级别枚举
// ============================================================

/** Agent 对项目内存的访问级别 */
const MEMORY_ACCESS_LEVELS = Object.freeze({
  /** 只读 */
  READ: 'read',
  /** 读写 */
  READ_WRITE: 'read-write',
  /** 无访问权限 */
  NONE: 'none',
});

/** 所有合法内存访问级别 */
const VALID_MEMORY_ACCESS_LEVELS = new Set(Object.values(MEMORY_ACCESS_LEVELS));

// ============================================================
// Agent Profile 版本
// ============================================================

const AGENT_PROFILE_VERSION = '1.0.0';

module.exports = {
  AGENT_PROFILE_VERSION,
  AGENT_ROLES,
  VALID_AGENT_ROLES,
  AGENT_STATES,
  VALID_AGENT_STATES,
  ESCALATION_POLICIES,
  VALID_ESCALATION_POLICIES,
  MEMORY_ACCESS_LEVELS,
  VALID_MEMORY_ACCESS_LEVELS,
};
