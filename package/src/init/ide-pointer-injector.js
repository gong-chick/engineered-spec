const fs = require('fs');
const path = require('path');
const { ensureDir } = require('../project/json-utils');

const START_MARKER = '<!-- AI-SPEC-AUTO:START -->';
const END_MARKER = '<!-- AI-SPEC-AUTO:END -->';
const POINTER_FILES = [
  '.codex/instructions.md',
  '.cursor/rules/ai-spec-auto.mdc',
  'CLAUDE.md',
  'memory.md',
];

function buildManagedBlock() {
  return [
    START_MARKER,
    '此区域由 ai-spec-auto 管理，请勿手动修改。',
    '',
    '请优先读取以下索引文件：',
    '- .ai-spec/project.json',
    '- .ai-spec/policy.json',
    '- .ai-spec/context-index.json',
    '- .agents/registry.index.json',
    '',
    '常用命令：',
    '- ai-spec-auto scan . --explain',
    '- ai-spec-auto init . --recommend --dry-run',
    END_MARKER,
  ].join('\n');
}

function upsertManagedBlock(existingContent, managedBlock) {
  const content = existingContent || '';
  const startIndex = content.indexOf(START_MARKER);
  const endIndex = content.indexOf(END_MARKER);
  if (startIndex >= 0 && endIndex >= startIndex) {
    const before = content.slice(0, startIndex).replace(/\s+$/, '');
    const after = content.slice(endIndex + END_MARKER.length).replace(/^\s+/, '');
    return [before, managedBlock, after].filter(Boolean).join('\n\n') + '\n';
  }

  if (!content.trim()) {
    return `${managedBlock}\n`;
  }
  return `${content.replace(/\s+$/, '')}\n\n${managedBlock}\n`;
}

class IdePointerInjector {
  write(rootDir) {
    const managedBlock = buildManagedBlock();
    const results = [];
    for (const relativePath of POINTER_FILES) {
      const filePath = path.join(rootDir, relativePath);
      const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
      const next = upsertManagedBlock(existing, managedBlock);
      ensureDir(path.dirname(filePath));
      fs.writeFileSync(filePath, next, 'utf8');
      results.push({
        path: relativePath,
        fullPath: filePath,
        action: existing ? 'update' : 'create',
      });
    }
    return results;
  }
}

module.exports = {
  END_MARKER,
  IdePointerInjector,
  POINTER_FILES,
  START_MARKER,
  buildManagedBlock,
  upsertManagedBlock,
};
