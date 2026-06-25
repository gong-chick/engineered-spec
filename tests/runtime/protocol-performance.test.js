const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const protocolWorkflow = require('../../internal/ai-protocol-workflow');
const runner = require('../../bin/task-orchestrator-runner');
const { clearRegistryCache } = require('../../bin/runtime-registry');

const fixturesDir = path.join(__dirname, 'fixtures');

function copyFixture(targetDir, fixtureName, inboxName) {
  const inboxDir = path.join(targetDir, '.ai-spec', 'internal', 'tmp');
  fs.mkdirSync(inboxDir, { recursive: true });
  fs.copyFileSync(path.join(fixturesDir, fixtureName), path.join(inboxDir, inboxName));
}

function writeProjectFile(targetDir, relPath, content) {
  const filePath = path.join(targetDir, relPath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${content}\n`, 'utf8');
}

function createWorkspace() {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-spec-auto-performance-'));
  writeProjectFile(targetDir, 'package.json', JSON.stringify({
    name: 'protocol-performance-smoke',
    scripts: {
      build: 'node -e "process.exit(0)"',
      lint: 'node -e "process.exit(0)"',
      test: 'node -e "process.exit(0)"',
    },
    dependencies: {
      vue: '^3.5.0',
      'vue-router': '^4.4.0',
      pinia: '^3.0.0',
      vite: '^6.0.0',
    },
    devDependencies: {
      typescript: '^5.0.0',
    },
  }, null, 2));
  writeProjectFile(targetDir, 'pnpm-lock.yaml', 'lockfileVersion: 9.0');
  writeProjectFile(targetDir, 'src/router/index.ts', 'export const router = {}');
  writeProjectFile(targetDir, 'src/router/modules/demo.ts', 'export default []');
  writeProjectFile(targetDir, 'src/views/demo/index.vue', '<template><div /></template>');
  writeProjectFile(targetDir, 'src/api/order.ts', 'export function getOrderListApi() {}');
  writeProjectFile(targetDir, 'src/api/types/order.ts', 'export interface Order {}');
  writeProjectFile(targetDir, 'src/mock/order.ts', 'export const orderMock = [];');
  writeProjectFile(targetDir, 'src/store/modules/demo/index.ts', 'export const useDemoStore = () => ({})');
  writeProjectFile(targetDir, 'src/styles/variables.scss', ':root {}');
  writeProjectFile(targetDir, 'context/PROJECT.md', '# PROJECT');
  return targetDir;
}

function withFsCounters(fn) {
  const originalReadFileSync = fs.readFileSync;
  const originalExistsSync = fs.existsSync;
  const stats = {
    read_count: 0,
    exists_count: 0,
    registry_reads: new Map(),
  };

  fs.readFileSync = function patchedReadFileSync(filePath, ...args) {
    stats.read_count += 1;
    const resolvedPath = path.resolve(String(filePath));
    if (resolvedPath.includes(`${path.sep}.agents${path.sep}registry${path.sep}`)) {
      stats.registry_reads.set(resolvedPath, (stats.registry_reads.get(resolvedPath) || 0) + 1);
    }
    return originalReadFileSync.call(this, filePath, ...args);
  };

  fs.existsSync = function patchedExistsSync(filePath) {
    stats.exists_count += 1;
    return originalExistsSync.call(this, filePath);
  };

  try {
    return {
      result: fn(),
      stats: {
        read_count: stats.read_count,
        exists_count: stats.exists_count,
        registry_reads: [...stats.registry_reads.entries()],
      },
    };
  } finally {
    fs.readFileSync = originalReadFileSync;
    fs.existsSync = originalExistsSync;
  }
}

function main() {
  const targetDir = createWorkspace();
  protocolWorkflow.advanceProtocolStep({
    target: targetDir,
    userInput: '创建一个商品组件',
  });
  copyFixture(targetDir, 'task-orchestrator-bootstrap-reply.md', 'task-orchestrator-turn.json');
  runner.advanceRunner({ target: targetDir });

  clearRegistryCache();
  const { result, stats } = withFsCounters(() => protocolWorkflow.advanceProtocolStep({
    target: targetDir,
  }));

  assert.strictEqual(result.turn.actor.id, 'requirement-analyst');
  for (const [, count] of stats.registry_reads) {
    assert.ok(count <= 1, `expected each registry file to be read once per turn, got ${count}`);
  }
  assert.ok(
    stats.read_count + stats.exists_count <= 170,
    `expected filesystem operations to stay bounded, got ${stats.read_count + stats.exists_count}`,
  );

  console.log('protocol performance test passed: registry files are cached and expert-turn filesystem operations stay bounded');
}

main();
