const { createIssue, normalizeTokenBudget } = require('./types');

class ContextBudget {
  constructor(tokenBudget = {}) {
    this.tokenBudget = normalizeTokenBudget(tokenBudget);
  }

  estimateTextTokens(text) {
    if (!text) return 0;
    return Math.ceil(String(text).length / 4);
  }

  evaluate(loadedAssets = [], tokenBudget = this.tokenBudget) {
    const normalizedBudget = normalizeTokenBudget(tokenBudget);
    const warnings = [];
    const errors = [];
    let inputTokens = 0;

    for (const asset of loadedAssets) {
      const tokenEstimate = Number.isFinite(asset.tokenEstimate)
        ? asset.tokenEstimate
        : this.estimateTextTokens(asset.content || '');
      asset.tokenEstimate = tokenEstimate;
      inputTokens += tokenEstimate;
    }

    if (inputTokens > normalizedBudget.warningThreshold) {
      warnings.push(createIssue(
        'warning',
        'CONTEXT_TOKEN_WARNING_THRESHOLD_EXCEEDED',
        `Context token 估算 ${inputTokens} 已超过 warningThreshold ${normalizedBudget.warningThreshold}`,
        '请减少阶段资产数量或下调加载规则',
      ));
    }

    if (inputTokens > normalizedBudget.maxInputTokens) {
      errors.push(createIssue(
        'error',
        'CONTEXT_TOKEN_BUDGET_EXCEEDED',
        `Context token 估算 ${inputTokens} 已超过 maxInputTokens ${normalizedBudget.maxInputTokens}`,
        '请减少加载资产或提高预算上限',
      ));
    }

    return {
      tokenEstimate: {
        inputTokens,
        maxInputTokens: normalizedBudget.maxInputTokens,
        warning: inputTokens > normalizedBudget.warningThreshold,
      },
      warnings,
      errors,
    };
  }
}

module.exports = {
  ContextBudget,
};
