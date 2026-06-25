const fs = require('fs');
const path = require('path');
const { PROJECT_TYPES } = require('../types');

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'target',
  '.next',
  '.nuxt',
  '.ai-spec',
  '.agents/materialized',
]);

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function normalizeWorkspacePatterns(workspaces) {
  if (Array.isArray(workspaces)) return workspaces;
  if (workspaces && Array.isArray(workspaces.packages)) return workspaces.packages;
  return [];
}

function listPackageDirsFromPattern(rootDir, pattern, maxDepth = 5) {
  const normalized = String(pattern || '').replace(/\\/g, '/').replace(/\/+$/, '');
  if (!normalized.includes('*')) {
    const full = path.join(rootDir, normalized);
    return fs.existsSync(path.join(full, 'package.json')) ? [full] : [];
  }

  const [basePart] = normalized.split('*');
  const baseDir = path.join(rootDir, basePart.replace(/\/+$/, ''));
  if (!fs.existsSync(baseDir)) return [];

  const dirs = [];
  const visit = (dir, depth) => {
    if (depth > maxDepth) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || IGNORED_DIRS.has(entry.name)) continue;
      const child = path.join(dir, entry.name);
      if (fs.existsSync(path.join(child, 'package.json'))) {
        dirs.push(child);
      }
      visit(child, depth + 1);
    }
  };
  visit(baseDir, 1);
  return dirs;
}

function parsePnpmWorkspace(rootDir) {
  const filePath = path.join(rootDir, 'pnpm-workspace.yaml');
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf8');
  const patterns = [];
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*-\s*['"]?([^'"]+)['"]?\s*$/);
    if (match) patterns.push(match[1]);
  }
  return patterns;
}

function parseLernaWorkspace(rootDir) {
  const lernaJson = readJsonIfExists(path.join(rootDir, 'lerna.json'));
  return normalizeWorkspacePatterns(lernaJson?.packages);
}

function parseMavenModules(rootDir) {
  const pomPath = path.join(rootDir, 'pom.xml');
  if (!fs.existsSync(pomPath)) return [];
  const content = fs.readFileSync(pomPath, 'utf8');
  const modulesMatch = content.match(/<modules>([\s\S]*?)<\/modules>/);
  if (!modulesMatch) return [];
  const modules = [];
  const modulePattern = /<module>(.*?)<\/module>/g;
  let match;
  while ((match = modulePattern.exec(modulesMatch[1]))) {
    const moduleDir = path.join(rootDir, match[1].trim());
    if (fs.existsSync(path.join(moduleDir, 'pom.xml'))) {
      modules.push(moduleDir);
    }
  }
  return modules;
}

function parseGradleModules(rootDir) {
  const settingsPath = ['settings.gradle', 'settings.gradle.kts']
    .map((file) => path.join(rootDir, file))
    .find((filePath) => fs.existsSync(filePath));
  if (!settingsPath) return [];
  const content = fs.readFileSync(settingsPath, 'utf8');
  const modules = new Set();
  const includePattern = /include\s*\(?\s*([^\n)]+)/g;
  let match;
  while ((match = includePattern.exec(content))) {
    for (const raw of match[1].split(',')) {
      const name = raw.trim().replace(/^['"]|['"]$/g, '').replace(/^:/, '').replace(/:/g, '/');
      if (name) modules.add(name);
    }
  }
  return [...modules]
    .map((name) => path.join(rootDir, name))
    .filter((moduleDir) => fs.existsSync(path.join(moduleDir, 'build.gradle')) || fs.existsSync(path.join(moduleDir, 'build.gradle.kts')));
}

function fallbackScanProjectDirs(rootDir, maxDepth = 5) {
  const markers = ['package.json', 'pom.xml', 'build.gradle', 'build.gradle.kts', 'go.mod', 'pyproject.toml', 'requirements.txt'];
  const dirs = new Set();
  const visit = (dir, depth) => {
    if (depth > maxDepth) return;
    const base = path.basename(dir);
    if (IGNORED_DIRS.has(base)) return;
    if (markers.some((marker) => fs.existsSync(path.join(dir, marker)))) {
      dirs.add(dir);
      if (dir !== rootDir) return;
    }
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || IGNORED_DIRS.has(entry.name)) continue;
      visit(path.join(dir, entry.name), depth + 1);
    }
  };
  visit(rootDir, 0);
  return [...dirs];
}

function detectPackageManager(rootDir, packageJson) {
  if (fs.existsSync(path.join(rootDir, 'pnpm-workspace.yaml')) || fs.existsSync(path.join(rootDir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(rootDir, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(rootDir, 'package-lock.json'))) return 'npm';
  if (typeof packageJson?.packageManager === 'string') return packageJson.packageManager.split('@')[0];
  return undefined;
}

class BoundaryResolver {
  resolve(rootDir, options = {}) {
    const resolvedRoot = path.resolve(rootDir || process.cwd());
    const maxDepth = Number.isInteger(options.maxDepth) ? options.maxDepth : 5;
    const packageJson = readJsonIfExists(path.join(resolvedRoot, 'package.json'));
    const pnpmPatterns = parsePnpmWorkspace(resolvedRoot);
    const packageWorkspacePatterns = normalizeWorkspacePatterns(packageJson?.workspaces);
    const lernaPatterns = parseLernaWorkspace(resolvedRoot);
    const configType =
      fs.existsSync(path.join(resolvedRoot, 'nx.json')) ? PROJECT_TYPES.NX_WORKSPACE :
        fs.existsSync(path.join(resolvedRoot, 'turbo.json')) ? PROJECT_TYPES.TURBO_WORKSPACE :
          PROJECT_TYPES.PACKAGE_JSON_WORKSPACE;
    const workspaceSources = [
      { type: PROJECT_TYPES.PNPM_WORKSPACE, patterns: pnpmPatterns },
      { type: fs.existsSync(path.join(resolvedRoot, 'lerna.json')) ? PROJECT_TYPES.LERNA_WORKSPACE : configType, patterns: packageWorkspacePatterns },
      { type: PROJECT_TYPES.LERNA_WORKSPACE, patterns: lernaPatterns },
    ].filter((source) => source.patterns.length > 0);

    if (workspaceSources.length > 0) {
      const source = workspaceSources[0];
      const workspacePackageDirs = [...new Set(source.patterns.flatMap((pattern) => listPackageDirsFromPattern(resolvedRoot, pattern, maxDepth)))];
      if (workspacePackageDirs.length > 0) {
        return {
          rootDir: resolvedRoot,
          type: source.type,
          packageManager: detectPackageManager(resolvedRoot, packageJson),
          packages: workspacePackageDirs.map((packageDir) => ({
            rootDir: packageDir,
            relativePath: path.relative(resolvedRoot, packageDir) || '.',
          })),
        };
      }
    }

    const mavenModules = parseMavenModules(resolvedRoot);
    if (mavenModules.length > 0) {
      return {
        rootDir: resolvedRoot,
        type: PROJECT_TYPES.MAVEN_MULTI_MODULE,
        packageManager: 'maven',
        packages: mavenModules.map((packageDir) => ({
          rootDir: packageDir,
          relativePath: path.relative(resolvedRoot, packageDir) || '.',
        })),
      };
    }

    const gradleModules = parseGradleModules(resolvedRoot);
    if (gradleModules.length > 0) {
      return {
        rootDir: resolvedRoot,
        type: PROJECT_TYPES.GRADLE_MULTI_MODULE,
        packageManager: 'gradle',
        packages: gradleModules.map((packageDir) => ({
          rootDir: packageDir,
          relativePath: path.relative(resolvedRoot, packageDir) || '.',
        })),
      };
    }

    const fallbackDirs = fallbackScanProjectDirs(resolvedRoot, maxDepth);
    if (fallbackDirs.length > 0) {
      const rootHasPackage = packageJson || fs.existsSync(path.join(resolvedRoot, 'pom.xml')) || fs.existsSync(path.join(resolvedRoot, 'build.gradle')) || fs.existsSync(path.join(resolvedRoot, 'build.gradle.kts')) || fs.existsSync(path.join(resolvedRoot, 'go.mod')) || fs.existsSync(path.join(resolvedRoot, 'pyproject.toml')) || fs.existsSync(path.join(resolvedRoot, 'requirements.txt'));
      return {
        rootDir: resolvedRoot,
        type: rootHasPackage ? PROJECT_TYPES.SINGLE : (fallbackDirs.length > 1 ? PROJECT_TYPES.MULTI_PROJECT_WORKSPACE : PROJECT_TYPES.UNKNOWN),
        packageManager: detectPackageManager(resolvedRoot, packageJson),
        packages: fallbackDirs.map((packageDir) => ({
          rootDir: packageDir,
          relativePath: path.relative(resolvedRoot, packageDir) || '.',
        })),
      };
    }

    return {
      rootDir: resolvedRoot,
      type: PROJECT_TYPES.UNKNOWN,
      packageManager: detectPackageManager(resolvedRoot, packageJson),
      packages: [{ rootDir: resolvedRoot, relativePath: '.' }],
    };
  }
}

module.exports = {
  BoundaryResolver,
  IGNORED_DIRS,
};
