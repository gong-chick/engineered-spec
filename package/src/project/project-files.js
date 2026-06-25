const fs = require('fs');
const path = require('path');

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`JSON 解析失败：${filePath}，${error.message}`);
  }
}

function getProjectFiles(rootDir) {
  return {
    project: path.join(rootDir, '.ai-spec/project.json'),
    policy: path.join(rootDir, '.ai-spec/policy.json'),
    lock: path.join(rootDir, '.ai-spec/ai-spec.lock.json'),
    registry: path.join(rootDir, '.agents/registry.index.json'),
    contextIndex: path.join(rootDir, '.ai-spec/context-index.json'),
  };
}

function readProjectState(rootDir) {
  const files = getProjectFiles(rootDir);
  return {
    files,
    project: readJsonFile(files.project),
    policy: readJsonFile(files.policy),
    lock: readJsonFile(files.lock),
    registry: readJsonFile(files.registry),
    contextIndex: readJsonFile(files.contextIndex),
  };
}

module.exports = {
  getProjectFiles,
  readJsonFile,
  readProjectState,
};
