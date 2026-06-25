const { IDEAdapter, createAdapterInput, createAdapterOutput, createValidationResult, validateAdapterConsistency } = require('./adapter-protocol');
const { CursorAdapter, buildCursorRuleContent, buildCommandContent } = require('./cursor-adapter');
const { ClaudeAdapter, buildClaudeEntryContent, buildClaudeCommandContent } = require('./claude-adapter');
const { CodexAdapter } = require('./codex-adapter');

module.exports = {
  // 协议层
  IDEAdapter,
  createAdapterInput,
  createAdapterOutput,
  createValidationResult,
  validateAdapterConsistency,

  // 适配器实现
  CursorAdapter,
  ClaudeAdapter,
  CodexAdapter,

  // 工具函数（向后兼容）
  buildCursorRuleContent,
  buildCommandContent,
  buildClaudeEntryContent,
  buildClaudeCommandContent,
};
