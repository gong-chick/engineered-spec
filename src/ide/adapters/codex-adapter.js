const { IDEAdapter, createAdapterOutput } = require('./adapter-protocol');

/**
 * CodexAdapter — Codex IDE 协议预留
 *
 * 当前仅实现协议接口占位，不包含真实文件生成逻辑。
 * 后续 P1.3+ 或独立阶段可根据 Codex 协议规范补全实现。
 */
class CodexAdapter extends IDEAdapter {
  get adapterId() {
    return 'codex';
  }

  detect(input) {
    return {
      applicable: false,
      reason: 'Codex 适配尚未实现，仅保留协议入口',
    };
  }

  generateFiles(input = {}) {
    return createAdapterOutput(this.adapterId, [], [
      'Codex 适配尚未实现，当前返回空文件列表',
    ]);
  }

  validate(rootDir) {
    return {
      ok: true,
      issues: [{
        severity: 'info',
        path: '',
        message: 'Codex 适配尚未实现，跳过校验',
        rule: 'codex-not-implemented',
      }],
      errorCount: 0,
      warningCount: 0,
    };
  }

  diff(rootDir) {
    return [];
  }

  rollback(rootDir) {
    return { deletedFiles: [], errors: [] };
  }

  write(rootDir, options = {}) {
    return [];
  }

  check(rootDir) {
    return [];
  }
}

module.exports = {
  CodexAdapter,
};
