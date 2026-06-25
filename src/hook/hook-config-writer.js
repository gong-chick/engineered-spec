const fs = require('fs');
const path = require('path');
const { writeJson } = require('../run/run-store');

const HOOK_TYPES = ['pre-task', 'pre-edit', 'post-edit', 'pre-test', 'post-test', 'repair-hook', 'archive-hook'];

const FAILURE_POLICIES = ['block', 'warn', 'ignore', 'escalate'];

function buildDefaultHooks(projectId) {
  return [
    {
      hookId: 'pre-task',
      hookType: 'pre-task',
      enabled: true,
      blocking: true,
      command: 'ai-spec-auto check .',
      timeout: 60,
      retry: 0,
      failurePolicy: 'block',
      outputTarget: `~/.ai-spec-auto/projects/${projectId}/runs/{runId}/events.ndjson`,
    },
    {
      hookId: 'pre-edit',
      hookType: 'pre-edit',
      enabled: true,
      blocking: false,
      command: 'echo "pre-edit: 准备编辑代码"',
      timeout: 30,
      retry: 0,
      failurePolicy: 'warn',
      outputTarget: `~/.ai-spec-auto/projects/${projectId}/runs/{runId}/events.ndjson`,
    },
    {
      hookId: 'post-edit',
      hookType: 'post-edit',
      enabled: true,
      blocking: false,
      command: 'echo "post-edit: 编辑完成"',
      timeout: 30,
      retry: 0,
      failurePolicy: 'warn',
      outputTarget: `~/.ai-spec-auto/projects/${projectId}/runs/{runId}/events.ndjson`,
    },
    {
      hookId: 'pre-test',
      hookType: 'pre-test',
      enabled: true,
      blocking: false,
      command: 'echo "pre-test: 准备执行测试"',
      timeout: 30,
      retry: 0,
      failurePolicy: 'warn',
      outputTarget: `~/.ai-spec-auto/projects/${projectId}/runs/{runId}/events.ndjson`,
    },
    {
      hookId: 'post-test',
      hookType: 'post-test',
      enabled: true,
      blocking: true,
      command: 'ai-spec-auto check .',
      timeout: 120,
      retry: 0,
      failurePolicy: 'block',
      outputTarget: `~/.ai-spec-auto/projects/${projectId}/runs/{runId}/events.ndjson`,
    },
    {
      hookId: 'repair-hook',
      hookType: 'repair-hook',
      enabled: true,
      blocking: true,
      command: 'ai-spec-auto check .',
      timeout: 120,
      retry: 1,
      failurePolicy: 'block',
      outputTarget: `~/.ai-spec-auto/projects/${projectId}/runs/{runId}/events.ndjson`,
    },
    {
      hookId: 'archive-hook',
      hookType: 'archive-hook',
      enabled: true,
      blocking: false,
      command: 'echo "archive-hook: 准备归档"',
      timeout: 30,
      retry: 0,
      failurePolicy: 'warn',
      outputTarget: `~/.ai-spec-auto/projects/${projectId}/runs/{runId}/events.ndjson`,
    },
  ];
}

class HookConfigWriter {
  /**
   * 生成 .harness/hooks.config.json
   * @param {string} rootDir
   * @param {object} context
   * @param {string} context.projectId
   * @returns {{ path: string, action: string, data: object }}
   */
  write(rootDir, context = {}) {
    const filePath = path.join(rootDir, '.harness', 'hooks.config.json');
    const existing = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : null;

    const doc = {
      schemaVersion: '1.0.0',
      projectId: context.projectId || '',
      maxRepairAttempts: 2,
      hooks: buildDefaultHooks(context.projectId || ''),
      generatedAt: new Date().toISOString(),
    };

    writeJson(filePath, doc);
    return {
      path: '.harness/hooks.config.json',
      fullPath: filePath,
      action: existing ? 'update' : 'create',
      data: doc,
    };
  }
}

module.exports = {
  HookConfigWriter,
  HOOK_TYPES,
  FAILURE_POLICIES,
};
