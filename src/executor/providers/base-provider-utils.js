const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

function getExecutionRoot(projectRoot, worktreePath) {
  return path.resolve(worktreePath || projectRoot || process.cwd());
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeText(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

function toRelative(rootDir, targetPath) {
  if (!targetPath) return null;
  if (!path.isAbsolute(targetPath)) return targetPath.replace(/\\/g, '/');
  const relative = path.relative(rootDir, targetPath);
  if (!relative || relative === '') return '.';
  if (relative.startsWith('..') || path.isAbsolute(relative)) return '<external-path>';
  return relative.replace(/\\/g, '/');
}

function commandExists(command, env = process.env) {
  const pathValue = env.PATH || '';
  if (!pathValue) return false;
  const extensions = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  return pathValue.split(path.delimiter).some((dir) => {
    if (!dir) return false;
    return extensions.some((ext) => {
      const candidate = path.join(dir, `${command}${ext}`);
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        return true;
      } catch (_error) {
        return false;
      }
    });
  });
}

function hasCursorConfig() {
  const home = os.homedir();
  return fs.existsSync(path.join(home, 'Library/Application Support/Cursor')) ||
    fs.existsSync(path.join(home, '.cursor'));
}

function sanitizeContextBundle(contextBundle = {}) {
  return {
    schemaVersion: contextBundle.schemaVersion || '1.0.0',
    stage: contextBundle.stage || null,
    tokenEstimate: contextBundle.tokenEstimate || null,
    loadedAssets: Array.isArray(contextBundle.loadedAssets)
      ? contextBundle.loadedAssets.map((asset) => ({
        kind: asset.kind,
        slug: asset.slug,
        version: asset.version,
        checksum: asset.checksum,
        source: asset.source,
        tokenEstimate: asset.tokenEstimate || 0,
      }))
      : [],
    warnings: Array.isArray(contextBundle.warnings)
      ? contextBundle.warnings.map((item) => (typeof item === 'string' ? item : item.message || String(item)))
      : [],
  };
}

function getRequirementSummary(input = {}) {
  if (input.run && input.run.requirement && input.run.requirement.summary) return input.run.requirement.summary;
  return String(input.requirement || '').trim().slice(0, 80) || '未命名需求';
}

function createCommonExecutorInput(input = {}, providerName) {
  const run = input.run || {};
  return {
    schemaVersion: '1.0.0',
    provider: providerName,
    runId: run.runId || '',
    requirementSummary: getRequirementSummary(input),
    stage: input.stage || 'implementation',
    context: sanitizeContextBundle(input.contextBundle),
    indexFiles: [
      '.ai-spec/project.json',
      '.ai-spec/policy.json',
      '.ai-spec/context-index.json',
      '.agents/registry.index.json',
    ],
    privacy: {
      sourceCodeIncluded: false,
      rawPromptIncluded: false,
      rawResponseIncluded: false,
      absolutePathIncluded: false,
    },
  };
}

function renderCommonTaskMarkdown(input = {}, providerDisplayName) {
  const executorInput = createCommonExecutorInput(input, providerDisplayName);
  const assets = executorInput.context.loadedAssets
    .map((asset) => `- ${asset.kind}：${asset.slug}@${asset.version}（${asset.checksum || '无 checksum'}）`)
    .join('\n') || '- 无';
  return [
    `# ${providerDisplayName} 执行任务`,
    '',
    '此文件由 ai-spec-auto 生成，用于执行器读取任务摘要和上下文索引。',
    '',
    `- runId：${executorInput.runId}`,
    `- 阶段：${executorInput.stage}`,
    `- 需求摘要：${executorInput.requirementSummary}`,
    `- Context 阶段：${executorInput.context.stage || '未构建'}`,
    `- Context token 估算：${executorInput.context.tokenEstimate ? executorInput.context.tokenEstimate.inputTokens : 0}`,
    '',
    '## 允许读取的索引文件',
    '',
    '- .ai-spec/project.json',
    '- .ai-spec/policy.json',
    '- .ai-spec/context-index.json',
    '- .agents/registry.index.json',
    '',
    '## 已加载资产索引',
    '',
    assets,
    '',
    '## 隐私与边界',
    '',
    '- 不要上传源码。',
    '- 不要自动 push / merge / 创建 PR。',
    '- 不要把源码正文、完整 prompt 或完整 response 写入结果。',
    '- 如果需要人工确认，请返回 human_review_required。',
    '',
  ].join('\n');
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    execFile(command, args, {
      cwd: options.cwd,
      env: options.env || process.env,
      timeout: options.timeoutMs || 10 * 60 * 1000,
      maxBuffer: 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error) {
        resolve({
          ok: false,
          code: error.code || 'COMMAND_FAILED',
          signal: error.signal || null,
          timedOut: error.killed || error.code === 'ETIMEDOUT',
          stdout: stdout || '',
          stderr: stderr || '',
          message: error.message,
        });
        return;
      }
      resolve({
        ok: true,
        code: 0,
        signal: null,
        timedOut: false,
        stdout: stdout || '',
        stderr: stderr || '',
        message: '',
      });
    });
  });
}

module.exports = {
  commandExists,
  createCommonExecutorInput,
  ensureDir,
  getExecutionRoot,
  hasCursorConfig,
  renderCommonTaskMarkdown,
  runCommand,
  sanitizeContextBundle,
  toRelative,
  writeJson,
  writeText,
};
