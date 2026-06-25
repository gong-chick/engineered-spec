const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  safeJsonHash,
  sha256File,
  sha256Text,
} = require('../../src/security/checksum');

function createWorkspace(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

async function main() {
  assert.strictEqual(
    sha256Text('hello'),
    'sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
  );
  assert.strictEqual(sha256Text(''), 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');

  const root = createWorkspace('ai-spec-checksum-');
  const filePath = path.join(root, 'content.md');
  fs.writeFileSync(filePath, 'hello', 'utf8');
  assert.strictEqual(sha256File(filePath), sha256Text('hello'));
  assert.throws(() => sha256File(path.join(root, 'missing.md')), /文件不存在/);

  const first = safeJsonHash({ b: 2, a: 1 });
  const second = safeJsonHash({ a: 1, b: 2 });
  assert.strictEqual(first, second);
  assert(first.startsWith('sha256:'));
  assert.throws(() => safeJsonHash(undefined), /JSON 内容不能为空/);

  console.log('checksum tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
