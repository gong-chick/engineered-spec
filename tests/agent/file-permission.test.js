/**
 * File Permission 测试
 */

const assert = require('assert');

const { createAgentProfile } = require('../../src/agent/agent-profile');
const {
  globMatch,
  matchesAnyGlob,
  checkFilePermission,
  checkBatchFilePermission,
} = require('../../src/agent/file-permission');

// ============================================================
// 测试用例
// ============================================================

async function testGlobMatchDoubleStar() {
  console.log('  TC01: ** 匹配任意路径');
  assert.strictEqual(globMatch('**', 'src/main.js'), true);
  assert.strictEqual(globMatch('**', 'a/b/c.txt'), true);
  assert.strictEqual(globMatch('**', ''), true);
}

async function testGlobMatchStar() {
  console.log('  TC02: * 匹配单层非斜杠字符');
  assert.strictEqual(globMatch('src/*.js', 'src/main.js'), true);
  assert.strictEqual(globMatch('src/*.js', 'src/util.js'), true);
  assert.strictEqual(globMatch('src/*.js', 'src/sub/a.js'), false);
}

async function testGlobMatchDoubleStarDir() {
  console.log('  TC03: **/*.js 匹配任意深度的 js 文件');
  assert.strictEqual(globMatch('**/*.js', 'src/main.js'), true);
  assert.strictEqual(globMatch('**/*.js', 'src/lib/util.js'), true);
  assert.strictEqual(globMatch('**/*.js', 'src/a/b/c.js'), true);
  assert.strictEqual(globMatch('**/*.js', 'src/main.ts'), false);
}

async function testGlobMatchQuestionMark() {
  console.log('  TC04: ? 匹配单个字符');
  assert.strictEqual(globMatch('file?.txt', 'file1.txt'), true);
  assert.strictEqual(globMatch('file?.txt', 'fileA.txt'), true);
  assert.strictEqual(globMatch('file?.txt', 'file12.txt'), false);
}

async function testGlobMatchSpecificDir() {
  console.log('  TC05: 特定目录匹配');
  assert.strictEqual(globMatch('src/**', 'src/main.js'), true);
  assert.strictEqual(globMatch('src/**', 'src/lib/util.js'), true);
  assert.strictEqual(globMatch('src/**', 'tests/main.js'), false);
}

async function testGlobMatchNegation() {
  console.log('  TC06: 路径分隔符正确处理');
  assert.strictEqual(globMatch('src/components/**', 'src/components/Button.tsx'), true);
  assert.strictEqual(globMatch('src/components/**', 'src/utils/helper.js'), false);
}

async function testMatchesAnyGlob() {
  console.log('  TC07: matchesAnyGlob 匹配任一模式');
  assert.strictEqual(matchesAnyGlob(['src/**', 'tests/**'], 'src/main.js'), true);
  assert.strictEqual(matchesAnyGlob(['src/**', 'tests/**'], 'tests/main.test.js'), true);
  assert.strictEqual(matchesAnyGlob(['src/**', 'tests/**'], 'docs/README.md'), false);
}

async function testFilePermissionDeniedPriority() {
  console.log('  TC08: deniedFileScopes 优先于 allowedFileScopes');
  const profile = createAgentProfile({
    agentId: 'test',
    name: 'test',
    allowedFileScopes: ['src/**'],
    deniedFileScopes: ['src/secrets/**'],
  });
  assert.strictEqual(checkFilePermission(profile, 'src/main.js').allowed, true);
  assert.strictEqual(checkFilePermission(profile, 'src/secrets/key.js').allowed, false);
}

async function testFilePermissionAllowedMatch() {
  console.log('  TC09: 文件匹配 allowedFileScopes 时允许');
  const profile = createAgentProfile({
    agentId: 'test',
    name: 'test',
    allowedFileScopes: ['src/**', 'tests/**'],
    deniedFileScopes: [],
  });
  assert.strictEqual(checkFilePermission(profile, 'src/main.js').allowed, true);
  assert.strictEqual(checkFilePermission(profile, 'tests/main.test.js').allowed, true);
}

async function testFilePermissionNotAllowed() {
  console.log('  TC10: 文件不匹配 allowedFileScopes 时拒绝');
  const profile = createAgentProfile({
    agentId: 'test',
    name: 'test',
    allowedFileScopes: ['src/**'],
    deniedFileScopes: [],
  });
  assert.strictEqual(checkFilePermission(profile, 'docs/README.md').allowed, false);
}

async function testFilePermissionEmptyScopesMeansAll() {
  console.log('  TC11: 空 allowedFileScopes 表示全部允许');
  const profile = createAgentProfile({
    agentId: 'test',
    name: 'test',
    allowedFileScopes: [],
    deniedFileScopes: ['**/.env*'],
  });
  assert.strictEqual(checkFilePermission(profile, 'src/main.js').allowed, true);
  assert.strictEqual(checkFilePermission(profile, '.env').allowed, false);
  assert.strictEqual(checkFilePermission(profile, '.env.local').allowed, false);
}

async function testFilePermissionInvalidProfile() {
  console.log('  TC12: 无效 profile 返回拒绝');
  assert.strictEqual(checkFilePermission(null, 'src/main.js').allowed, false);
}

async function testFilePermissionInvalidPath() {
  console.log('  TC13: 无效 filePath 返回拒绝');
  const profile = createAgentProfile({ agentId: 'test', name: 'test' });
  assert.strictEqual(checkFilePermission(profile, '').allowed, false);
}

async function testBatchFilePermission() {
  console.log('  TC14: 批量文件权限校验');
  const profile = createAgentProfile({
    agentId: 'test',
    name: 'test',
    allowedFileScopes: ['src/**'],
    deniedFileScopes: ['src/secrets/**'],
  });
  const result = checkBatchFilePermission(profile, ['src/main.js', 'src/secrets/key.js', 'docs/readme.md']);
  assert.strictEqual(result.allAllowed, false);
  assert.strictEqual(result.results['src/main.js'].allowed, true);
  assert.strictEqual(result.results['src/secrets/key.js'].allowed, false);
  assert.strictEqual(result.results['docs/readme.md'].allowed, false);
}

async function testFilePermissionSecurityScope() {
  console.log('  TC15: 安全审查者的文件作用域');
  const profile = createAgentProfile({
    agentId: 'security-reviewer',
    name: '安全审查者',
    allowedFileScopes: ['src/**', 'tests/**', 'docs/**', '**/*.json', '**/*.yml'],
    deniedFileScopes: ['**/secrets/**', '**/.env*', '**/node_modules/**'],
  });
  assert.strictEqual(checkFilePermission(profile, 'src/main.js').allowed, true);
  assert.strictEqual(checkFilePermission(profile, 'config.yml').allowed, true);
  assert.strictEqual(checkFilePermission(profile, 'package.json').allowed, true);
  assert.strictEqual(checkFilePermission(profile, 'secrets/key.pem').allowed, false);
  assert.strictEqual(checkFilePermission(profile, '.env').allowed, false);
  assert.strictEqual(checkFilePermission(profile, 'node_modules/pkg/index.js').allowed, false);
}

// ============================================================
// 主测试入口
// ============================================================

async function main() {
  console.log('=== file-permission.test.js ===');

  const tests = [
    testGlobMatchDoubleStar,
    testGlobMatchStar,
    testGlobMatchDoubleStarDir,
    testGlobMatchQuestionMark,
    testGlobMatchSpecificDir,
    testGlobMatchNegation,
    testMatchesAnyGlob,
    testFilePermissionDeniedPriority,
    testFilePermissionAllowedMatch,
    testFilePermissionNotAllowed,
    testFilePermissionEmptyScopesMeansAll,
    testFilePermissionInvalidProfile,
    testFilePermissionInvalidPath,
    testBatchFilePermission,
    testFilePermissionSecurityScope,
  ];

  let passed = 0;
  let failed = 0;

  for (const testFn of tests) {
    try {
      await testFn();
      passed++;
    } catch (err) {
      failed++;
      console.error(`  FAIL: ${testFn.name} — ${err.message}`);
    }
  }

  console.log(`\n结果: ${passed} 通过, ${failed} 失败, 共 ${tests.length} 个`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('测试执行失败:', err);
  process.exit(1);
});
