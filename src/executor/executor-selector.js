const { ExecutorError } = require('./types');

const MODE_DEFAULTS = {
  'local-assisted': 'cursor',
  'local-auto': 'codex',
  'remote-orchestrated': 'codex',
};

const DEFAULT_FALLBACK_EXECUTORS = ['claude-code', 'codex', 'cursor'];

function normalizeExecutorName(name) {
  return String(name || '').trim();
}

function pushCandidate(candidates, name, source, reason) {
  const executor = normalizeExecutorName(name);
  if (!executor) return;
  candidates.push({ executor, source, reason });
}

function uniqueCandidates(candidates) {
  const seen = new Set();
  const result = [];
  for (const item of candidates) {
    if (seen.has(item.executor)) continue;
    seen.add(item.executor);
    result.push(item);
  }
  return result;
}

class ExecutorSelector {
  async select(input = {}) {
    const registry = input.registry;
    if (!registry) {
      throw new ExecutorError('EXECUTOR_REGISTRY_REQUIRED', '缺少 ExecutorRegistry，无法选择执行器。');
    }

    const warnings = [];
    const fallbackTried = [];
    const candidates = [];
    const mode = input.mode || 'local-assisted';
    const policyExecution = input.policy && input.policy.execution ? input.policy.execution : {};
    const agentProfile = input.agentProfile || {};

    pushCandidate(candidates, input.cliExecutor, 'cli', 'CLI 显式指定 executor');
    pushCandidate(candidates, agentProfile.defaultExecutor || agentProfile.executor, 'agent-profile', 'Agent Profile 指定 defaultExecutor');
    pushCandidate(candidates, policyExecution.defaultExecutor, 'policy', 'policy.execution.defaultExecutor 指定执行器');
    pushCandidate(candidates, MODE_DEFAULTS[mode] || MODE_DEFAULTS['local-assisted'], 'mode', `${mode} 模式默认执行器`);

    const fallbackExecutors = agentProfile.fallbackExecutors ||
      policyExecution.fallbackExecutors ||
      DEFAULT_FALLBACK_EXECUTORS;
    for (const fallback of fallbackExecutors) {
      pushCandidate(candidates, fallback, 'fallback', 'fallbackExecutors 候选执行器');
    }

    for (const candidate of uniqueCandidates(candidates)) {
      const provider = registry.get(candidate.executor);
      if (!provider) {
        fallbackTried.push(candidate.executor);
        warnings.push({
          code: 'EXECUTOR_NOT_REGISTERED',
          message: `执行器 ${candidate.executor} 未注册，已尝试下一个候选。`,
        });
        continue;
      }

      if (input.dryRun === true) {
        return {
          executor: candidate.executor,
          provider,
          reason: `${candidate.reason}（dry-run 仅验证选择和 prepare）`,
          availability: {
            available: true,
            reason: null,
            fixSuggestion: null,
            version: 'dry-run',
          },
          fallbackTried,
          warnings,
        };
      }

      let availability;
      try {
        availability = await provider.checkAvailability({
          projectRoot: input.projectRoot,
          worktreePath: input.worktreePath || null,
          env: input.env || process.env,
        });
      } catch (error) {
        availability = {
          available: false,
          reason: `执行器可用性检查失败：${error.message}`,
          fixSuggestion: '请检查执行器安装状态，或切换其他执行器。',
          version: null,
        };
      }

      if (availability.available) {
        if (fallbackTried.length > 0 && input.cliExecutor) {
          warnings.push({
            code: 'CLI_EXECUTOR_FALLBACK',
            message: 'CLI 指定的执行器不可用，已尝试 fallback 执行器。',
          });
        }
        return {
          executor: candidate.executor,
          provider,
          reason: candidate.reason,
          availability,
          fallbackTried,
          warnings,
        };
      }

      fallbackTried.push(candidate.executor);
      if (candidate.source === 'cli') {
        warnings.push({
          code: 'CLI_EXECUTOR_UNAVAILABLE',
          message: `CLI 指定的执行器不可用：${availability.reason || candidate.executor}`,
        });
      }
    }

    throw new ExecutorError(
      'EXECUTOR_NOT_AVAILABLE',
      '没有可用执行器，请安装 Codex / Cursor / Claude Code，或调整 policy.execution.defaultExecutor。',
      '请执行 ai-spec-auto executor check 查看修复建议。'
    );
  }
}

module.exports = {
  DEFAULT_FALLBACK_EXECUTORS,
  ExecutorSelector,
  MODE_DEFAULTS,
};
