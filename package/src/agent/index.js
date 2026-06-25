/**
 * Agent 模块 — barrel 导出
 */

const agentTypes = require('./agent-types');
const agentProfile = require('./agent-profile');
const agentTemplates = require('./agent-templates');
const toolPermission = require('./tool-permission');
const filePermission = require('./file-permission');
const { PermissionAuditLog } = require('./permission-audit');
const { AgentContext } = require('./agent-context');
const { AgentState, AgentCollaborationProtocol } = require('./collaboration-protocol');
const { ReviewRepairLoop } = require('./review-repair-loop');
const { FileLockManager, ApprovalQueue, ConflictHandler, detectConflicts } = require('./conflict-handler');

module.exports = {
  // 类型与常量
  ...agentTypes,
  // Profile
  ...agentProfile,
  ...agentTemplates,
  // 权限
  ...toolPermission,
  ...filePermission,
  PermissionAuditLog,
  // 上下文
  AgentContext,
  // 协作
  AgentState,
  AgentCollaborationProtocol,
  // Review/Repair
  ReviewRepairLoop,
  // 冲突处理
  FileLockManager,
  ApprovalQueue,
  ConflictHandler,
  detectConflicts,
};
