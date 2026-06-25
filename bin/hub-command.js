const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  fetchManifestExport,
  normalizeOrigin,
  postInstallReport,
  postRuntimeReport,
  requestJson,
  writeHubToken,
} = require('../internal/hub-client');

const REGISTRY_LOCK_FILE = path.join('.agents', 'registry', 'hub-lock.json');
const LEGACY_LOCK_FILE = 'hub-lock.json';
const REGISTRY_MANIFEST_FILE = path.join('.agents', 'registry', 'manifest.json');
const HISTORY_ROOT = path.join('.ai-spec', 'history', 'hub-install');

const ALLOWED_INSTALL_PREFIXES = [
  '.agents/rules/',
  '.agents/skills/',
  '.agents/roles/',
  '.agents/flows/',
  '.agents/registry/',
  '.cursor/',
  '.claude/',
  'openspec/',
  '.ai-spec/config/',
  '.ai-spec/history/',
];

const BLOCKED_INSTALL_PATHS = new Set([
  'package.json',
  '.env',
  '.env.local',
]);

function parseArgs(argv) {
  const args = [...argv];
  const command = args.shift() || 'help';
  const options = {
    command,
    target: '.',
    origin: process.env.AI_SPEC_HUB_ORIGIN || '',
    dryRun: false,
    allowHighRisk: false,
    json: false,
    force: false,
    yes: false,
    version: '',
    rollbackVersion: '',
    manifestId: '',
    token: '',
    kind: '',
    mode: 'standard',
    profile: '',
    ide: '',
    runId: '',
    stage: 'review',
    status: 'success',
    durationMs: 0,
    failedReason: '',
    repoUrl: '',
  };

  if (command === '--help' || command === '-h') {
    options.command = 'help';
    options.help = true;
    return options;
  }

  while (args.length > 0) {
    const arg = args.shift();
    switch (arg) {
      case '--hub':
      case '--hub-origin':
      case '--origin':
        options.origin = requireArg(arg, args);
        break;
      case '--target':
        options.target = requireArg(arg, args);
        break;
      case '--version':
        options.version = requireArg(arg, args);
        break;
      case '--token':
        options.token = requireArg(arg, args);
        break;
      case '--kind':
        options.kind = requireArg(arg, args);
        break;
      case '--mode':
        options.mode = requireArg(arg, args);
        break;
      case '--profile':
        options.profile = requireArg(arg, args);
        break;
      case '--ide':
        options.ide = requireArg(arg, args);
        break;
      case '--run-id':
        options.runId = requireArg(arg, args);
        break;
      case '--stage':
        options.stage = requireArg(arg, args);
        break;
      case '--status':
        options.status = requireArg(arg, args);
        break;
      case '--duration-ms':
        options.durationMs = Number(requireArg(arg, args));
        break;
      case '--failed-reason':
        options.failedReason = requireArg(arg, args);
        break;
      case '--repo-url':
        options.repoUrl = requireArg(arg, args);
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--allow-high-risk':
        options.allowHighRisk = true;
        break;
      case '--json':
        options.json = true;
        break;
      case '--force':
        options.force = true;
        break;
      case '--yes':
      case '-y':
        options.yes = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        assignPositional(options, arg);
    }
  }
  return options;
}

function assignPositional(options, arg) {
  if (options.command === 'rollback') {
    if (!options.rollbackVersion && isSemver(arg)) {
      options.rollbackVersion = arg;
      return;
    }
    if (options.target === '.') {
      options.target = arg;
      return;
    }
  }

  if (options.command === 'upgrade' && !options.version && isSemver(arg)) {
    options.version = arg;
    return;
  }

  if (['diff', 'sync', 'upgrade', 'runtime-report'].includes(options.command) && options.target === '.') {
    options.target = arg;
    return;
  }

  if (!options.manifestId) {
    options.manifestId = arg;
    return;
  }

  if (options.target === '.') {
    options.target = arg;
    return;
  }

  throw new Error(`未知参数：${arg}`);
}

function requireArg(flag, args) {
  const next = args.shift();
  if (!next || next.startsWith('--')) {
    throw new Error(`选项 ${flag} 需要一个参数值`);
  }
  return next;
}

function isSemver(value) {
  return /^\d+\.\d+\.\d+$/.test(String(value || ''));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function sha256Text(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function readHubConfig(targetDir) {
  const filePath = path.join(targetDir, '.ai-spec', 'config', 'hub.json');
  if (!fs.existsSync(filePath)) return null;
  try {
    return readJson(filePath);
  } catch (_error) {
    return null;
  }
}

function resolveOrigin(options, targetDir) {
  const fromConfig = readHubConfig(targetDir);
  return normalizeOrigin(options.origin || fromConfig?.hub || fromConfig?.baseUrl || 'http://localhost:3000');
}

function normalizeExport(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Hub Export 响应为空');
  }
  const data = payload.data && payload.success !== undefined ? payload.data : payload;
  if (data.contractVersion && data.contractVersion !== '1.0.0') {
    throw new Error(`不支持的 Hub 契约版本：${data.contractVersion}`);
  }
  if (!data.contractVersion) {
    throw new Error('Hub Export 缺少 contractVersion（契约版本）');
  }
  if (!data?.manifest?.id || !data.version || !Array.isArray(data.assets)) {
    throw new Error('Hub Export 响应缺少 manifest、version 或 assets');
  }
  if (data.manifest.status && data.manifest.status !== 'published') {
    throw new Error(`Manifest 未发布，当前状态：${data.manifest.status}`);
  }

  const filesByKey = new Map();
  for (const file of Array.isArray(data.files) ? data.files : []) {
    if (file && typeof file === 'object') {
      filesByKey.set(file.assetId || file.path, file);
      if (file.path) filesByKey.set(file.path, file);
    }
  }

  return {
    ...data,
    assets: data.assets.map((asset) => {
      const file = filesByKey.get(asset.assetId) || filesByKey.get(asset.installPath || asset.path);
      return {
        ...asset,
        content: asset.content ?? file?.content,
        contentFormat: asset.contentFormat ?? file?.contentFormat,
      };
    }),
  };
}

function registryLockPath(targetDir) {
  return path.join(targetDir, REGISTRY_LOCK_FILE);
}

function legacyLockPath(targetDir) {
  return path.join(targetDir, LEGACY_LOCK_FILE);
}

function findLockPath(targetDir) {
  const registry = registryLockPath(targetDir);
  if (fs.existsSync(registry)) return registry;
  const legacy = legacyLockPath(targetDir);
  if (fs.existsSync(legacy)) return legacy;
  return null;
}

function normalizeLock(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const assets = Array.isArray(raw.assets)
    ? raw.assets.map((asset) => ({
        kind: String(asset.kind || 'unknown'),
        assetId: String(asset.assetId || asset.slug || asset.id || ''),
        slug: String(asset.slug || asset.assetId || asset.id || ''),
        version: String(asset.version || ''),
        required: asset.required !== false,
        checksum: String(asset.checksum || ''),
        installPath: String(asset.installPath || asset.path || ''),
        path: String(asset.path || asset.installPath || ''),
        riskLevel: String(asset.riskLevel || 'L0'),
        currentChecksum: typeof asset.currentChecksum === 'string' ? asset.currentChecksum : null,
      }))
    : [];
  return {
    raw,
    hubBaseUrl: typeof raw.hub === 'string' ? raw.hub : String(raw.hub?.baseUrl || raw.hub?.url || ''),
    manifestId: String(raw.manifest?.id || raw.manifestId || ''),
    manifestSlug: String(raw.manifest?.slug || raw.manifestId || raw.manifest?.id || ''),
    manifestVersion: String(raw.manifest?.version || raw.manifestVersion || ''),
    manifestChecksum: String(raw.manifest?.checksum || raw.manifestChecksum || ''),
    installMode: String(raw.install?.mode || raw.mode || ''),
    installedAt: String(raw.install?.installedAt || raw.installedAt || ''),
    assets,
  };
}

function readLockRecord(targetDir) {
  const filePath = findLockPath(targetDir);
  if (!filePath) return null;
  try {
    const raw = readJson(filePath);
    return { filePath, raw, lock: normalizeLock(raw) };
  } catch (_error) {
    return null;
  }
}

function resolveInstallPath(asset) {
  const relPath = asset.installPath || asset.path;
  if (relPath) return normalizeRelativePath(relPath);
  return `.agents/registry/${asset.kind}/${asset.assetId || asset.slug}.json`;
}

function normalizeRelativePath(relPath) {
  const normalized = path.posix.normalize(String(relPath).replace(/\\/g, '/'));
  if (path.isAbsolute(relPath) || normalized === '..' || normalized.startsWith('../')) {
    throw new Error(`安装路径非法：${relPath}`);
  }
  return normalized;
}

function assertAllowedInstallPath(relPath) {
  const normalized = normalizeRelativePath(relPath);
  if (
    BLOCKED_INSTALL_PATHS.has(normalized) ||
    normalized.startsWith('src/') ||
    normalized.startsWith('node_modules/') ||
    normalized.startsWith('.git/')
  ) {
    throw new Error(`安装路径被禁止：${relPath}`);
  }
  if (!ALLOWED_INSTALL_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    throw new Error(`安装路径不在允许范围内：${relPath}`);
  }
  return normalized;
}

async function fetchAssetContent(asset) {
  if (typeof asset.content === 'string') {
    return asset.content;
  }
  if (asset.contentUrl) {
    const response = await fetch(asset.contentUrl);
    if (!response.ok) {
      throw new Error(`资产下载失败：${asset.assetId || asset.slug} (${response.status})`);
    }
    return response.text();
  }
  throw new Error(`资产 ${asset.assetId || asset.slug} 缺少 content 或 contentUrl`);
}

function verifyAssetChecksum(asset, content) {
  const expected = String(asset.checksum || '');
  if (!expected) return;
  const actual = sha256Text(content);
  if (expected.startsWith('sha256:') && expected !== `sha256:${actual}`) {
    throw new Error(`资产 ${asset.assetId || asset.slug} checksum 校验失败`);
  }
  if (/^[a-f0-9]{64}$/i.test(expected) && expected.toLowerCase() !== actual) {
    throw new Error(`资产 ${asset.assetId || asset.slug} checksum 校验失败`);
  }
}

function readInstalledChecksum(targetDir, relPath) {
  const filePath = path.join(targetDir, relPath);
  if (!fs.existsSync(filePath)) return null;
  return sha256Text(fs.readFileSync(filePath, 'utf8'));
}

function assertRiskAllowed(exportPayload, options) {
  const l4 = exportPayload.assets.find((asset) => asset.riskLevel === 'L4');
  if (l4) throw new Error(`资产 ${l4.assetId || l4.slug} 风险等级为 L4，禁止安装。`);
  const high = exportPayload.assets.find((asset) => asset.riskLevel === 'L3');
  if (high && !options.allowHighRisk && !options.yes) {
    throw new Error(`资产 ${high.assetId || high.slug} 风险等级为 L3，请显式添加 --allow-high-risk 或 --yes。`);
  }
}

function classifyUpgrade(current, next) {
  const [currentMajor, currentMinor, currentPatch] = String(current || '0.0.0').split('.').map(Number);
  const [nextMajor, nextMinor, nextPatch] = String(next || '0.0.0').split('.').map(Number);
  if (nextMajor !== currentMajor) return 'major';
  if (nextMinor !== currentMinor) return 'minor';
  if (nextPatch !== currentPatch) return 'patch';
  return 'same';
}

function compareSemver(current, next) {
  const a = String(current || '0.0.0').split('.').map(Number);
  const b = String(next || '0.0.0').split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    const diff = (b[index] || 0) - (a[index] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function buildLock({ origin, exportPayload, mode, targetDir, options }) {
  const now = new Date().toISOString();
  const assets = exportPayload.assets.map((asset) => {
    const relPath = resolveInstallPath(asset);
    return {
      kind: asset.kind,
      id: asset.assetId || asset.slug,
      slug: asset.slug || asset.assetId,
      assetId: asset.assetId || asset.slug,
      version: asset.version,
      required: asset.required !== false,
      path: relPath,
      installPath: relPath,
      checksum: asset.checksum,
      currentChecksum: readInstalledChecksum(targetDir, relPath),
      riskLevel: asset.riskLevel || 'L0',
    };
  });
  return {
    lockVersion: '1.0.0',
    hub: {
      baseUrl: normalizeOrigin(origin),
      name: 'Xia Qiu Hub',
    },
    manifest: {
      id: exportPayload.manifest.id,
      slug: exportPayload.manifest.slug || exportPayload.manifest.id,
      version: exportPayload.version,
      checksum: exportPayload.checksum,
    },
    install: {
      mode,
      cliVersion: readCliVersion(),
      installedAt: now,
      profile: options.profile || undefined,
      ide: options.ide || undefined,
    },
    assets,

    // 兼容旧版 Visual / 脚本读取，主协议仍以上面的嵌套结构为准。
    manifestId: exportPayload.manifest.id,
    manifestVersion: exportPayload.version,
    manifestChecksum: exportPayload.checksum,
    installedAt: now,
    mode,
  };
}

function readCliVersion() {
  try {
    return require('../package.json').version || '0.0.0';
  } catch (_error) {
    return '0.0.0';
  }
}

function createHistorySnapshot(targetDir, previous, changed) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const snapshotDir = path.join(targetDir, HISTORY_ROOT, timestamp);
  const backupDir = path.join(snapshotDir, 'backup');
  const changedFiles = [];
  ensureDir(backupDir);

  for (const item of changed) {
    const source = path.join(targetDir, item.relPath);
    const backup = path.join(backupDir, item.relPath);
    const existed = fs.existsSync(source);
    if (existed) {
      ensureDir(path.dirname(backup));
      fs.copyFileSync(source, backup);
    }
    changedFiles.push({ path: item.relPath, existed });
  }

  const lockFile = findLockPath(targetDir);
  const lockBackup = path.join(backupDir, REGISTRY_LOCK_FILE);
  if (lockFile && fs.existsSync(lockFile)) {
    ensureDir(path.dirname(lockBackup));
    fs.copyFileSync(lockFile, lockBackup);
  }

  writeJson(path.join(snapshotDir, 'snapshot.json'), {
    createdAt: new Date().toISOString(),
    fromVersion: previous?.lock?.manifestVersion || null,
    manifestId: previous?.lock?.manifestId || previous?.lock?.manifestSlug || null,
    lockExisted: Boolean(lockFile),
    changedFiles,
  });
  return { snapshotDir, backupDir };
}

function assertNoLocalConflicts(targetDir, plan, previous, options) {
  if (options.force) return;
  const localByKey = new Map((previous?.lock?.assets || []).map((asset) => [`${asset.kind}:${asset.assetId}`, asset]));
  for (const item of plan) {
    const filePath = path.join(targetDir, item.relPath);
    if (!fs.existsSync(filePath)) continue;
    const actual = sha256Text(fs.readFileSync(filePath, 'utf8'));
    const local = localByKey.get(`${item.asset.kind}:${item.asset.assetId || item.asset.slug}`);
    if (local?.checksum && actual !== local.checksum && actual !== item.asset.checksum) {
      throw new Error(`检测到本地文件冲突：${item.relPath}，请先处理或使用 --force。`);
    }
  }
}

async function install(options) {
  if (!options.manifestId) throw new Error('缺少 Manifest ID');
  const targetDir = path.resolve(options.target);
  const origin = resolveOrigin(options, targetDir);
  const exportPayload = normalizeExport(await fetchManifestExport({
    origin,
    manifestId: options.manifestId,
    version: options.version || undefined,
  }));
  assertRiskAllowed(exportPayload, options);

  const plan = exportPayload.assets.map((asset) => ({
    asset,
    relPath: assertAllowedInstallPath(resolveInstallPath(asset)),
    filePath: path.join(targetDir, assertAllowedInstallPath(resolveInstallPath(asset))),
  }));
  const previous = readLockRecord(targetDir);
  assertNoLocalConflicts(targetDir, plan, previous, options);

  const skipped = plan.filter((item) => {
    const actual = readInstalledChecksum(targetDir, item.relPath);
    return actual && actual === item.asset.checksum;
  });
  const changed = plan.filter((item) => !skipped.includes(item));

  if (previous?.lock?.manifestChecksum === exportPayload.checksum && changed.length === 0) {
    return {
      manifestId: exportPayload.manifest.id,
      version: exportPayload.version,
      message: '已是最新，无需重复安装',
      written: [],
      skipped: skipped.length,
    };
  }

  if (options.dryRun) {
    return {
      dryRun: true,
      manifestId: exportPayload.manifest.id,
      version: exportPayload.version,
      createOrUpdate: changed.map((item) => item.relPath),
      skipped: skipped.map((item) => item.relPath),
      warnings: exportPayload.assets.filter((asset) => asset.riskLevel === 'L3').map((asset) => `${asset.assetId || asset.slug} 为 L3 高风险资产`),
    };
  }

  const snapshot = createHistorySnapshot(targetDir, previous, changed);
  const written = [];
  try {
    for (const item of changed) {
      let content = '';
      try {
        content = await fetchAssetContent(item.asset);
        verifyAssetChecksum(item.asset, content);
      } catch (error) {
        if (item.asset.required !== false) throw error;
        console.warn(`警告：可选资产 ${item.asset.assetId || item.asset.slug} 下载失败，已跳过。`);
        continue;
      }
      ensureDir(path.dirname(item.filePath));
      fs.writeFileSync(item.filePath, content, 'utf8');
      written.push(item.relPath);
    }

    ensureDir(path.join(targetDir, '.agents', 'registry'));
    const lock = buildLock({ origin, exportPayload, mode: options.mode, targetDir, options });
    writeJson(registryLockPath(targetDir), lock);
    writeJson(path.join(targetDir, REGISTRY_MANIFEST_FILE), exportPayload);

    await postInstallReport({
      origin,
      report: {
        projectName: path.basename(targetDir),
        manifestId: lock.manifest.id,
        manifestVersion: lock.manifest.version,
        installMode: lock.install.mode,
        status: 'success',
        assets: lock.assets,
        message: '安装成功',
      },
    }).catch((error) => {
      console.warn(`警告：安装记录上报失败，已继续：${error.message}`);
    });

    return {
      dryRun: false,
      manifestId: lock.manifest.id,
      version: lock.manifest.version,
      lockFile: REGISTRY_LOCK_FILE,
      snapshot: path.relative(targetDir, snapshot.snapshotDir),
      written,
      skipped: skipped.length,
    };
  } catch (error) {
    for (const relPath of written) {
      try {
        fs.rmSync(path.join(targetDir, relPath), { force: true });
      } catch (_rollbackError) {
        // 回滚失败不覆盖原始错误。
      }
    }
    throw new Error(`安装失败，已回滚已写入文件：${error.message}`);
  }
}

async function diff(options) {
  const targetDir = path.resolve(options.target);
  const previous = readLockRecord(targetDir);
  if (!previous?.lock) throw new Error('未找到 .agents/registry/hub-lock.json，请先执行 hub install。');
  const origin = resolveOrigin(options, targetDir);
  const exportPayload = normalizeExport(await fetchManifestExport({
    origin,
    manifestId: options.manifestId || previous.lock.manifestSlug || previous.lock.manifestId,
    version: options.version || undefined,
  }));
  const remote = new Map(exportPayload.assets.map((asset) => [`${asset.kind}:${asset.assetId || asset.slug}`, asset]));
  const local = new Map((previous.lock.assets || []).map((asset) => [`${asset.kind}:${asset.assetId}`, asset]));
  const changes = [];

  for (const [key, asset] of remote) {
    const current = local.get(key);
    const relPath = resolveInstallPath(asset);
    const filePath = path.join(targetDir, relPath);
    if (!current) {
      changes.push({ type: 'missing', asset });
      continue;
    }
    if (!fs.existsSync(filePath)) {
      changes.push({ type: 'missing', asset: current });
      continue;
    }
    const actual = sha256Text(fs.readFileSync(filePath, 'utf8'));
    if (current.checksum && actual !== current.checksum && actual !== asset.checksum) {
      changes.push({ type: 'modified', asset: current, localChecksum: actual });
    }
    if (compareSemver(current.version, asset.version) > 0 || current.checksum !== asset.checksum) {
      changes.push({ type: 'outdated', from: current, to: asset });
    }
  }

  for (const [key, asset] of local) {
    if (!remote.has(key)) changes.push({ type: 'extra', asset });
  }

  return {
    manifestId: exportPayload.manifest.id,
    localVersion: previous.lock.manifestVersion,
    remoteVersion: exportPayload.version,
    changes,
  };
}

async function sync(options) {
  const targetDir = path.resolve(options.target);
  const previous = readLockRecord(targetDir);
  if (!previous?.lock && !options.manifestId) throw new Error('未找到 .agents/registry/hub-lock.json，请提供 Manifest ID。');
  const origin = resolveOrigin(options, targetDir);
  const manifestId = options.manifestId || previous.lock.manifestSlug || previous.lock.manifestId;
  const latest = normalizeExport(await fetchManifestExport({ origin, manifestId }));
  const upgradeType = classifyUpgrade(previous?.lock?.manifestVersion, latest.version);
  if (upgradeType === 'same') {
    return install({ ...options, origin, manifestId, version: latest.version });
  }
  if ((upgradeType === 'minor' || upgradeType === 'major') && !options.yes && !options.force) {
    throw new Error(`检测到 ${upgradeType} 升级：${previous.lock.manifestVersion} -> ${latest.version}，请添加 --yes 确认。`);
  }
  return install({ ...options, origin, manifestId, version: latest.version });
}

async function upgrade(options) {
  const targetDir = path.resolve(options.target);
  const previous = readLockRecord(targetDir);
  if (!previous?.lock && !options.manifestId) throw new Error('未找到 .agents/registry/hub-lock.json，请提供 Manifest ID。');
  const origin = resolveOrigin(options, targetDir);
  const manifestId = options.manifestId || previous.lock.manifestSlug || previous.lock.manifestId;
  const target = normalizeExport(await fetchManifestExport({ origin, manifestId, version: options.version || undefined }));
  const upgradeType = classifyUpgrade(previous?.lock?.manifestVersion, target.version);
  if (upgradeType === 'major' && !options.yes && !options.force) {
    throw new Error(`检测到 major 升级：${previous.lock.manifestVersion} -> ${target.version}，请添加 --yes 确认。`);
  }
  return install({ ...options, origin, manifestId, version: target.version });
}

async function rollback(options) {
  const targetDir = path.resolve(options.target);
  const backupsRoot = path.join(targetDir, HISTORY_ROOT);
  if (!fs.existsSync(backupsRoot)) return { restored: [], message: '没有可回滚的备份' };
  const snapshots = fs.readdirSync(backupsRoot).sort().reverse();
  let selected = null;
  for (const name of snapshots) {
    const snapshotPath = path.join(backupsRoot, name, 'snapshot.json');
    if (!fs.existsSync(snapshotPath)) continue;
    const snapshot = readJson(snapshotPath);
    if (!options.rollbackVersion || snapshot.fromVersion === options.rollbackVersion) {
      selected = { name, snapshot, backupDir: path.join(backupsRoot, name, 'backup') };
      break;
    }
  }
  if (!selected) throw new Error(`未找到可回滚版本：${options.rollbackVersion}`);

  const restored = [];
  for (const item of selected.snapshot.changedFiles || []) {
    const dest = path.join(targetDir, item.path);
    const backup = path.join(selected.backupDir, item.path);
    if (item.existed && fs.existsSync(backup)) {
      ensureDir(path.dirname(dest));
      fs.copyFileSync(backup, dest);
      restored.push(item.path);
    } else if (!item.existed) {
      fs.rmSync(dest, { force: true });
      restored.push(item.path);
    }
  }

  const lockBackup = path.join(selected.backupDir, REGISTRY_LOCK_FILE);
  if (selected.snapshot.lockExisted && fs.existsSync(lockBackup)) {
    ensureDir(path.dirname(registryLockPath(targetDir)));
    fs.copyFileSync(lockBackup, registryLockPath(targetDir));
    restored.push(REGISTRY_LOCK_FILE);
  } else if (!selected.snapshot.lockExisted) {
    fs.rmSync(registryLockPath(targetDir), { force: true });
  }

  return { restored, backup: selected.name, version: selected.snapshot.fromVersion || null };
}

async function search(options) {
  const q = options.manifestId || '';
  const origin = resolveOrigin(options, path.resolve(options.target));
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (options.kind) params.set('kind', options.kind);
  return requestJson(`${normalizeOrigin(origin)}/api/hub/search?${params.toString()}`);
}

async function runtimeReport(options) {
  const targetDir = path.resolve(options.target);
  const previous = readLockRecord(targetDir);
  if (!previous?.lock) throw new Error('未找到 .agents/registry/hub-lock.json，请先执行 hub install。');

  const allowedStages = new Set(['requirement', 'design', 'implement', 'test', 'review', 'archive']);
  const allowedStatuses = new Set(['success', 'failed', 'partial']);
  if (!allowedStages.has(options.stage)) {
    throw new Error(`不支持的 stage：${options.stage}`);
  }
  if (!allowedStatuses.has(options.status)) {
    throw new Error(`不支持的 status：${options.status}`);
  }
  if (!Number.isFinite(options.durationMs) || options.durationMs < 0) {
    throw new Error('--duration-ms 必须是非负数字');
  }

  const origin = resolveOrigin(options, targetDir);
  const report = {
    projectName: path.basename(targetDir),
    repoUrl: options.repoUrl || undefined,
    manifestId: previous.lock.manifestId || previous.lock.manifestSlug || undefined,
    manifestVersion: previous.lock.manifestVersion || undefined,
    runId: options.runId || `manual-${Date.now()}`,
    stage: options.stage,
    status: options.status,
    usedAssets: (previous.lock.assets || []).map((asset) => ({
      kind: asset.kind,
      assetId: asset.assetId || asset.slug,
      version: asset.version,
    })),
    durationMs: Math.round(options.durationMs),
    failedReason: options.failedReason || undefined,
  };

  const response = await postRuntimeReport({ origin, report });
  return {
    reported: true,
    manifestId: report.manifestId,
    manifestVersion: report.manifestVersion,
    runId: report.runId,
    usedAssetCount: report.usedAssets.length,
    response,
  };
}

function login(options) {
  const targetDir = path.resolve(options.target);
  const origin = resolveOrigin(options, targetDir);
  const configPath = path.join(targetDir, '.ai-spec', 'config', 'hub.json');
  writeJson(configPath, {
    hub: origin,
    tokenSource: options.token ? 'config' : 'env-or-config',
    loginAt: new Date().toISOString(),
  });
  const tokenFile = options.token ? writeHubToken(options.token) : null;
  return { configFile: path.relative(targetDir, configPath), tokenFile, message: `Hub 登录成功：${origin}` };
}

function printUsage() {
  console.log(`用法:
  ai-spec-auto hub login --hub <url> [--token <token>]
  ai-spec-auto hub search <关键词> [--kind manifest] [--hub <url>]
  ai-spec-auto hub install <manifest-id> [target] [--hub <url>] [--mode standard] [--profile react] [--ide cursor] [--dry-run] [--force] [--yes]
  ai-spec-auto hub sync [target] [--yes]
  ai-spec-auto hub diff [target]
  ai-spec-auto hub upgrade [target] [--version <version>] [--yes]
  ai-spec-auto hub rollback [version] [target]
  ai-spec-auto hub runtime-report [target] [--run-id <id>] [--stage review] [--status success] [--duration-ms 0] [--failed-reason <reason>]
`);
}

function printPretty(result) {
  console.log(JSON.stringify(result, null, 2));
}

async function main(argv) {
  try {
    const options = parseArgs(argv);
    if (options.help || options.command === 'help') {
      printUsage();
      return 0;
    }

    let result;
    switch (options.command) {
      case 'login':
        result = login(options);
        break;
      case 'search':
        result = await search(options);
        break;
      case 'install':
        result = await install(options);
        break;
      case 'sync':
        result = await sync(options);
        break;
      case 'diff':
        result = await diff(options);
        break;
      case 'upgrade':
        result = await upgrade(options);
        break;
      case 'rollback':
        result = await rollback(options);
        break;
      case 'runtime-report':
        result = await runtimeReport(options);
        break;
      default:
        throw new Error(`未知 hub 命令：${options.command}`);
    }

    if (options.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    else printPretty(result);
    return 0;
  } catch (error) {
    console.error(`hub（方案包）失败：${error.message}`);
    return 1;
  }
}

module.exports = { parseArgs, install, diff, sync, upgrade, rollback, runtimeReport, main };

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
