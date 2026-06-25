const path = require('path');
const { readJsonIfExists, writeJson } = require('./json-utils');

function createContextIndex(projectId) {
  return {
    schemaVersion: '1.0.0',
    projectId,
    contextStrategy: 'progressive',
    levels: {
      L0: {
        name: '命令入口与状态机阶段',
        alwaysLoad: [
          '.ai-spec/project.json',
          '.ai-spec/policy.json',
        ],
      },
      L1: {
        name: '项目画像',
        loadFiles: [
          '.ai-spec/project.json',
          '.ai-spec/workspace.json',
        ],
      },
      L2: {
        name: 'Manifest 与 Registry 索引',
        loadFiles: [
          '.ai-spec/ai-spec.lock.json',
          '.agents/registry.index.json',
        ],
      },
      L3: {
        name: '阶段相关资产全文',
        loadByRegistry: true,
      },
    },
    stageLoadRules: [
      {
        stage: 'planning',
        loadKinds: ['role', 'flow'],
        maxAssets: 5,
      },
      {
        stage: 'implementation',
        loadKinds: ['rule', 'skill', 'agent-profile'],
        maxAssets: 8,
      },
      {
        stage: 'verification',
        loadKinds: ['rule', 'flow'],
        maxAssets: 6,
      },
      {
        stage: 'diagnosing',
        loadKinds: ['rule', 'skill', 'agent-profile'],
        requiredAgents: ['diagnostic-agent'],
        maxAssets: 6,
      },
    ],
    sharedContracts: [],
  };
}

class ContextIndexWriter {
  write(rootDir, context = {}) {
    const filePath = path.join(rootDir, '.ai-spec/context-index.json');
    const existing = readJsonIfExists(filePath);
    const doc = createContextIndex(context.projectId || '');

    writeJson(filePath, doc);
    return {
      path: '.ai-spec/context-index.json',
      fullPath: filePath,
      action: existing ? 'update' : 'create',
      data: doc,
    };
  }
}

module.exports = {
  ContextIndexWriter,
  createContextIndex,
};
