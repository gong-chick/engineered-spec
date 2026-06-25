const fs = require('fs');
const path = require('path');
const { ensureDir } = require('../../project/json-utils');
const { START_MARKER, END_MARKER, upsertManagedBlock } = require('../../init/ide-pointer-injector');

function buildAgentsMdBlock() {
  return [
    START_MARKER,
    '# ai-spec-auto 项目规范入口',
    '',
    '本项目已接入 `ai-spec-auto`。执行任何需求开发前，必须先读取以下索引文件，不要直接全量扫描项目。',
    '',
    '## 必读顺序',
    '',
    '1. `.ai-spec/project.json`：项目基本信息。',
    '2. `.ai-spec/workspace.json`：工作区与包结构。',
    '3. `.ai-spec/policy.json`：执行策略与安全边界。',
    '4. `.ai-spec/ai-spec.lock.json`：已锁定资产版本。',
    '5. `.agents/registry.index.json`：Rule / Skill / Command 注册表。',
    '6. `.agents/registry/ide-registry.json`：IDE 指针索引。',
    '7. `.ai-spec/context-index.json`：上下文分级索引。',
    '',
    '## 执行原则',
    '',
    '- 不要跳过注册表直接猜测规则。',
    '- 不要一次性读取所有 Rule / Skill 正文。',
    '- 先读索引，再按任务阶段读取需要的资产。',
    '- 不要上传源码、原始提示词、原始响应、绝对路径或密钥。',
    '- Vue / React 项目优先读取前端实现相关 Rule / Skill。',
    END_MARKER,
  ].join('\n');
}

function buildClaudeMdBlock() {
  return [
    START_MARKER,
    '# Claude Code 执行入口',
    '',
    '你正在一个已接入 `ai-spec-auto` 的项目中工作。',
    '',
    '## 启动前必须读取',
    '',
    '1. `.agents/registry/ide-registry.json`',
    '2. `.agents/registry.index.json`',
    '3. `.ai-spec/context-index.json`',
    '4. `.ai-spec/ai-spec.lock.json`',
    '',
    '## 常用命令',
    '',
    '- `/project-init`：初始化项目规范。',
    '- `/spec-start`：启动新需求。',
    '- `/spec-update`：补充或修正当前需求。',
    '- `/spec-status`：查看当前状态。',
    '- `/spec-continue`：继续当前 run。',
    '',
    '## 上下文策略',
    '',
    '只读取当前阶段需要的 Rule / Skill，不要全量展开全部资产。',
    END_MARKER,
  ].join('\n');
}

function buildMemoryMdBlock() {
  return [
    START_MARKER,
    '# ai-spec-auto 记忆锚点',
    '',
    '本文件只保存长期稳定的项目规范指针，不保存业务实现细节。',
    '',
    '## 稳定索引',
    '',
    '- 项目配置：`.ai-spec/project.json`',
    '- 工作区配置：`.ai-spec/workspace.json`',
    '- 策略配置：`.ai-spec/policy.json`',
    '- 资产锁文件：`.ai-spec/ai-spec.lock.json`',
    '- IDE 注册表：`.agents/registry/ide-registry.json`',
    '- 资产注册表：`.agents/registry.index.json`',
    '- 上下文索引：`.ai-spec/context-index.json`',
    '',
    '## 禁止写入',
    '',
    '- 不要把源码片段写入 memory。',
    '- 不要把接口密钥写入 memory。',
    '- 不要把一次性执行日志写入 memory。',
    '- 不要把完整 Rule / Skill 正文写入 memory。',
    END_MARKER,
  ].join('\n');
}

const ANCHOR_BLOCKS = {
  'AGENTS.md': buildAgentsMdBlock,
  'CLAUDE.md': buildClaudeMdBlock,
  'memory.md': buildMemoryMdBlock,
};

class MarkdownAnchorWriter {
  /**
   * 向指定 markdown 文件注入 AI 管理锚点
   * @param {string} rootDir - 项目根目录
   * @param {string} fileName - 文件名（AGENTS.md / CLAUDE.md / memory.md）
   * @param {{ dryRun?: boolean }} options
   * @returns {{ path: string, action: string, fullPath: string }}
   */
  write(rootDir, fileName, options = {}) {
    const buildBlock = ANCHOR_BLOCKS[fileName];
    if (!buildBlock) {
      throw new Error(`不支持的文件：${fileName}，仅支持 AGENTS.md、CLAUDE.md、memory.md`);
    }

    const filePath = path.join(rootDir, fileName);
    const managedBlock = buildBlock();
    const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
    const next = upsertManagedBlock(existing, managedBlock);
    const action = existing ? 'update' : 'create';

    if (!options.dryRun) {
      ensureDir(path.dirname(filePath));
      fs.writeFileSync(filePath, next, 'utf8');
    }

    return {
      path: fileName,
      fullPath: filePath,
      action,
    };
  }

  /**
   * 检查指定 markdown 文件是否包含有效锚点
   * @param {string} rootDir
   * @param {string} fileName
   * @returns {{ exists: boolean, hasAnchor: boolean, content?: string }}
   */
  check(rootDir, fileName) {
    const filePath = path.join(rootDir, fileName);
    const exists = fs.existsSync(filePath);
    if (!exists) {
      return { exists: false, hasAnchor: false };
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const hasAnchor = content.includes(START_MARKER) && content.includes(END_MARKER);
    return { exists: true, hasAnchor, content };
  }
}

module.exports = {
  MarkdownAnchorWriter,
  ANCHOR_BLOCKS,
  buildAgentsMdBlock,
  buildClaudeMdBlock,
  buildMemoryMdBlock,
};
