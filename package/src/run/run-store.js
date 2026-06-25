const fs = require('fs');
const path = require('path');

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

class RunStore {
  resolveLocalStateDir(rootDir) {
    const configPath = path.join(rootDir, '.ai-spec', 'config.json');
    const config = readJson(configPath);
    if (config && config.localStateDir) {
      return config.localStateDir;
    }
    return null;
  }

  getRunsDir(rootDir) {
    const localStateDir = this.resolveLocalStateDir(rootDir);
    if (localStateDir) {
      return path.join(localStateDir, 'runs');
    }
    return path.join(rootDir, '.ai-spec', 'runs');
  }

  getRunDir(rootDir, runId) {
    return path.join(this.getRunsDir(rootDir), runId);
  }

  getRunPath(rootDir, runId) {
    return path.join(this.getRunDir(rootDir, runId), 'run.json');
  }

  save(rootDir, run) {
    const now = new Date().toISOString();
    const next = {
      ...run,
      updatedAt: now,
    };
    writeJson(this.getRunPath(rootDir, run.runId), next);
    return next;
  }

  load(rootDir, runId) {
    const run = readJson(this.getRunPath(rootDir, runId));
    if (!run) {
      throw new Error(`未找到 run.json：${runId}`);
    }
    return run;
  }

  list(rootDir) {
    const runsDir = this.getRunsDir(rootDir);
    if (!fs.existsSync(runsDir)) return [];
    return fs.readdirSync(runsDir)
      .filter((runId) => fs.existsSync(this.getRunPath(rootDir, runId)))
      .map((runId) => this.load(rootDir, runId))
      .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  }

  loadLatest(rootDir) {
    const runs = this.list(rootDir);
    if (runs.length === 0) {
      throw new Error('未找到任何 run，请先执行 spec-start');
    }
    return runs[runs.length - 1];
  }
}

module.exports = {
  RunStore,
  readJson,
  writeJson,
};
