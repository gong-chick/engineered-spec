const assert = require('assert');
const { ContextBudget } = require('../../src/context/context-budget');

function testEstimateTokensIsStable() {
  const budget = new ContextBudget();
  assert.strictEqual(budget.estimateTextTokens(''), 0);
  assert.strictEqual(budget.estimateTextTokens('abcd'), 1);
  assert.strictEqual(budget.estimateTextTokens('abcde'), 2);
}

function testWarningThreshold() {
  const budget = new ContextBudget({
    maxInputTokens: 100,
    warningThreshold: 2,
  });
  const result = budget.evaluate([
    { slug: 'long-rule', content: 'abcdefghijkl' },
  ]);

  assert.strictEqual(result.tokenEstimate.inputTokens, 3);
  assert.strictEqual(result.tokenEstimate.warning, true);
  assert.strictEqual(result.errors.length, 0);
  assert(result.warnings.some((item) => item.message.includes('超过 warningThreshold')));
}

function testMaxInputTokensError() {
  const budget = new ContextBudget({
    maxInputTokens: 2,
    warningThreshold: 1,
  });
  const result = budget.evaluate([
    { slug: 'too-long-rule', content: 'abcdefghijkl' },
  ]);

  assert.strictEqual(result.tokenEstimate.inputTokens, 3);
  assert.strictEqual(result.errors.length, 1);
  assert(result.errors[0].message.includes('超过 maxInputTokens'));
}

function main() {
  testEstimateTokensIsStable();
  testWarningThreshold();
  testMaxInputTokensError();
  console.log('context-budget tests passed');
}

main();
