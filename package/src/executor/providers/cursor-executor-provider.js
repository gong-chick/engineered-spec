const fs = require('fs');
const path = require('path');
const {
  ExecutorCapability,
  ExecutorStatus,
  ExecutorType,
  IExecutorProvider,
  createExecutionResult,
} = require('../types');
const {
  commandExists,
  getExecutionRoot,
  hasCursorConfig,
  renderCommonTaskMarkdown,
  toRelative,
  writeText,
} = require('./base-provider-utils');

class CursorExecutorProvider extends IExecutorProvider {
  get name() {
    return ExecutorType.CURSOR;
  }

  get displayName() {
    return 'Cursor';
  }

  get capabilities() {
    return [
      ExecutorCapability.READ,
      ExecutorCapability.WRITE,
      ExecutorCapability.INTERACTIVE,
    ];
  }

  async checkAvailability(input = {}) {
    const available = commandExists('cursor', input.env || process.env) || hasCursorConfig();
    return {
      available,
      reason: available ? null : '未检测到 Cursor CLI 或 Cursor 配置',
      fixSuggestion: available ? null : '请安装 Cursor，或切换为 codex / claude-code。',
      version: available ? 'unknown' : null,
    };
  }

  async prepare(input = {}) {
    const executionRoot = getExecutionRoot(input.projectRoot, input.worktreePath);
    const runId = input.run && input.run.runId ? input.run.runId : 'unknown-run';
    const taskPath = path.join(executionRoot, '.cursor/tmp', runId, 'task.md');
    const warnings = [];
    const rulePath = path.join(executionRoot, '.cursor/rules/ai-spec-auto.mdc');
    if (!fs.existsSync(rulePath)) {
      warnings.push({
        code: 'CURSOR_RULE_MISSING',
        message: '未检测到 .cursor/rules/ai-spec-auto.mdc，请先执行 init 或在 Cursor 中确认指针文件。',
      });
    }
    writeText(taskPath, renderCommonTaskMarkdown(input, 'Cursor'));
    return {
      prepared: true,
      executorInputPath: null,
      instructionFilePath: toRelative(executionRoot, taskPath),
      warnings,
      errors: [],
    };
  }

  async execute(input = {}) {
    if (input.dryRun) {
      return createExecutionResult({
        success: true,
        status: ExecutorStatus.SKIPPED,
        summary: 'Cursor dry-run 已完成：仅生成任务文件，未进行无头执行。',
      });
    }
    return createExecutionResult({
      success: false,
      status: ExecutorStatus.HUMAN_REVIEW_REQUIRED,
      summary: '当前 Cursor 环境更适合人工辅助模式，请在 IDE 中打开任务文件继续。',
      error: {
        code: 'EXECUTOR_PERMISSION_DENIED',
        message: '当前 Cursor 环境不支持无头自动执行。',
        suggestion: '请切换 Codex / Claude Code，或在 Cursor 中手动执行任务文件。',
      },
    });
  }

  async verify() {
    return { executed: false, passed: null, command: null, summary: '本轮未接入 Cursor verify。' };
  }

  async cleanup() {
    return { cleaned: true, warnings: [] };
  }
}

module.exports = {
  CursorExecutorProvider,
};
