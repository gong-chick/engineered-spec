const fs = require('fs');
const path = require('path');
const { ensureDir } = require('./json-utils');

const LOCAL_STATE_SUBDIRS = [
  'runs',
  'cache',
  'logs',
  'context',
  'repair',
  'secrets',
  'workspaces',
  'telemetry',
  'tmp',
];

class LocalStateWriter {
  /**
   * 创建用户本机运行态目录
   * @param {string} localStateDir 本机运行态根目录（~/.ai-spec-auto/projects/{projectId}）
   * @returns {{ created: string[], existed: string[] }}
   */
  write(localStateDir) {
    const created = [];
    const existed = [];

    for (const subdir of LOCAL_STATE_SUBDIRS) {
      const dirPath = path.join(localStateDir, subdir);
      if (fs.existsSync(dirPath)) {
        existed.push(subdir);
      } else {
        ensureDir(dirPath);
        created.push(subdir);
      }
    }

    // 确保 secrets 目录有 .gitignore
    const secretsGitignore = path.join(localStateDir, 'secrets', '.gitignore');
    if (!fs.existsSync(secretsGitignore)) {
      fs.writeFileSync(secretsGitignore, '*\n!.gitignore\n', 'utf8');
    }

    return { created, existed };
  }
}

module.exports = {
  LOCAL_STATE_SUBDIRS,
  LocalStateWriter,
};
