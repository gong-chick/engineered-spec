const assert = require('assert');
const { PrivacyFilter } = require('../../src/visual/privacy-filter');

function testAddsPrivacyFlags() {
  const result = new PrivacyFilter().filter({ eventId: 'evt', projectId: 'proj' });
  assert.deepStrictEqual(result.privacy, {
    sourceCodeIncluded: false,
    rawPromptIncluded: false,
    rawResponseIncluded: false,
    absolutePathIncluded: false,
  });
}

function testRejectsSensitivePayload() {
  const filter = new PrivacyFilter();
  for (const payload of [
    { sourceCode: 'const a = 1;' },
    { rawPrompt: '完整提示词' },
    { rawResponse: '完整响应' },
    { path: '/Users/lizhenwei/demo/app.js' },
    { message: 'token=abc' },
    { message: 'password=abc' },
    { message: 'secret=abc' },
    { file: '.env' },
  ]) {
    assert.throws(() => filter.filter(payload), /敏感|不允许|绝对路径|changedFiles/);
  }
}

function testChangedFilesMustBeRelative() {
  const filter = new PrivacyFilter();
  assert.doesNotThrow(() => filter.assertRelativeChangedFiles([{ path: 'src/app.ts', action: 'updated' }]));
  assert.throws(() => filter.assertRelativeChangedFiles([{ path: '/tmp/app.ts', action: 'updated' }]), /changedFiles/);
}

function main() {
  testAddsPrivacyFlags();
  testRejectsSensitivePayload();
  testChangedFilesMustBeRelative();
  console.log('visual privacy-filter tests passed');
}

main();
