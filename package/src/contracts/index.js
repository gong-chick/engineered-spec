const fs = require('fs');
const path = require('path');

const CONTRACT_ROOT = path.join(__dirname, '..', '..', 'contracts');

const CONTRACTS = {
  runEvent: {
    schema: 'run-event.schema.json',
    fixture: 'run-event.fixture.json',
  },
  evidenceReport: {
    schema: 'evidence-report.schema.json',
    fixture: 'evidence-report.fixture.json',
  },
  assetPackage: {
    schema: 'asset-package.schema.json',
    fixture: 'asset-package.fixture.json',
  },
  manifest: {
    schema: 'manifest.schema.json',
    fixture: 'manifest.fixture.json',
  },
  assetUsageFeedback: {
    schema: 'asset-usage-feedback.schema.json',
    fixture: 'asset-usage-feedback.fixture.json',
  },
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function resolveContractPath(kind, type) {
  const contract = CONTRACTS[kind];
  if (!contract) throw new Error(`未知协议：${kind}`);
  const dir = type === 'schema' ? 'schemas' : 'fixtures';
  return path.join(CONTRACT_ROOT, dir, contract[type]);
}

function loadSchema(kind) {
  return readJson(resolveContractPath(kind, 'schema'));
}

function loadFixture(kind) {
  return readJson(resolveContractPath(kind, 'fixture'));
}

function listContracts() {
  return Object.keys(CONTRACTS).map((kind) => ({
    kind,
    schemaPath: resolveContractPath(kind, 'schema'),
    fixturePath: resolveContractPath(kind, 'fixture'),
  }));
}

module.exports = {
  CONTRACT_ROOT,
  CONTRACTS,
  listContracts,
  loadFixture,
  loadSchema,
  resolveContractPath,
};
