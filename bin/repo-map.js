const fs = require('fs');
const path = require('path');
const { resolveRuntimePaths } = require('./runtime-paths');

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadPackageManifest(targetDir) {
  return readJsonIfExists(path.join(targetDir, 'package.json'));
}

function hasDependency(pkg, names) {
  if (!pkg) {
    return false;
  }

  const deps = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
    ...(pkg.peerDependencies || {}),
  };

  return names.some((name) => Object.prototype.hasOwnProperty.call(deps, name));
}

function detectProjectProfile(targetDir) {
  const manifestPath = path.join(targetDir, '.ai-spec', 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (typeof manifest?.profile === 'string' && manifest.profile.trim()) {
        return manifest.profile.trim();
      }
    } catch (error) {
      // Ignore malformed local manifest and fall back to package facts.
    }
  }

  const pkg = loadPackageManifest(targetDir);
  if (hasDependency(pkg, ['vue', 'vue-router', 'pinia'])) {
    return 'vue';
  }
  if (hasDependency(pkg, ['react', 'react-dom', 'react-router-dom'])) {
    return 'react';
  }
  return 'default';
}

function detectProjectLanguage(targetDir, pkg) {
  if (hasDependency(pkg, ['typescript']) || fs.existsSync(path.join(targetDir, 'tsconfig.json'))) {
    return 'TypeScript';
  }
  return 'JavaScript';
}

function detectBuildTool(pkg) {
  if (hasDependency(pkg, ['vite'])) {
    return 'Vite';
  }
  if (hasDependency(pkg, ['next'])) {
    return 'Next.js';
  }
  if (hasDependency(pkg, ['nuxt'])) {
    return 'Nuxt';
  }
  if (hasDependency(pkg, ['webpack'])) {
    return 'Webpack';
  }
  return 'unknown';
}

function detectPackageManager(targetDir) {
  if (fs.existsSync(path.join(targetDir, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }
  if (fs.existsSync(path.join(targetDir, 'yarn.lock'))) {
    return 'yarn';
  }
  if (fs.existsSync(path.join(targetDir, 'package-lock.json'))) {
    return 'npm';
  }
  return 'unknown';
}

function findExistingRelPath(targetDir, candidates) {
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(targetDir, candidate))) {
      return candidate;
    }
  }
  return null;
}

function collectRepoConventions(targetDir, projectProfile = detectProjectProfile(targetDir)) {
  return {
    project_profile: projectProfile,
    projectContextPath: findExistingRelPath(targetDir, ['context/PROJECT.md']),
    appEntry: findExistingRelPath(targetDir, ['src/App.vue', 'src/App.tsx', 'src/App.jsx']),
    mainEntry: findExistingRelPath(targetDir, ['src/main.ts', 'src/main.js', 'src/main.tsx', 'src/main.jsx']),
    viewsDir: findExistingRelPath(targetDir, ['src/views']),
    routeEntry: findExistingRelPath(targetDir, ['src/router/index.ts', 'src/router/index.js']),
    routeModulesDir: findExistingRelPath(targetDir, ['src/router/modules']),
    apiDir: findExistingRelPath(targetDir, ['src/api']),
    apiTypesDir: findExistingRelPath(targetDir, ['src/api/types']),
    requestConfig: findExistingRelPath(targetDir, [
      'src/config/requestConfig.ts',
      'src/config/requestConfig.js',
      'src/lib/request.ts',
      'src/libs/request.ts',
      'src/utils/request.ts',
    ]),
    mockDir: findExistingRelPath(targetDir, ['src/mock', 'src/mocks']),
    storeModulesDir: findExistingRelPath(targetDir, ['src/store/modules', 'src/stores/modules', 'src/store']),
    styleEntry: findExistingRelPath(targetDir, ['src/styles', 'src/style.css', 'src/style.scss', 'src/styles/variables.scss']),
  };
}

function buildRepoMap(targetDir) {
  const pkg = loadPackageManifest(targetDir);
  const projectProfile = detectProjectProfile(targetDir);
  const repoConventions = collectRepoConventions(targetDir, projectProfile);

  return {
    schema_version: 1,
    kind: 'repo-map',
    generated_at: new Date().toISOString(),
    framework: projectProfile === 'default' ? 'unknown' : projectProfile,
    language: detectProjectLanguage(targetDir, pkg),
    build_tool: detectBuildTool(pkg),
    package_manager: detectPackageManager(targetDir),
    paths: {
      project_context: repoConventions.projectContextPath || null,
      app_entry: repoConventions.appEntry || null,
      main_entry: repoConventions.mainEntry || null,
      views_dir: repoConventions.viewsDir || null,
      route_entry: repoConventions.routeEntry || null,
      route_modules_dir: repoConventions.routeModulesDir || null,
      api_dir: repoConventions.apiDir || null,
      api_types_dir: repoConventions.apiTypesDir || null,
      request_config: repoConventions.requestConfig || null,
      mock_dir: repoConventions.mockDir || null,
      store_modules_dir: repoConventions.storeModulesDir || null,
      style_entry: repoConventions.styleEntry || null,
    },
  };
}

function syncRepoMap(targetDir) {
  const resolvedTarget = path.resolve(targetDir);
  const runtimePaths = resolveRuntimePaths(resolvedTarget);
  const repoMap = buildRepoMap(resolvedTarget);

  fs.mkdirSync(path.dirname(runtimePaths.repoMap.path), { recursive: true });
  fs.writeFileSync(runtimePaths.repoMap.path, `${JSON.stringify(repoMap, null, 2)}\n`, 'utf8');

  return {
    path: runtimePaths.repoMap.path,
    repo_map: repoMap,
  };
}

module.exports = {
  loadPackageManifest,
  detectProjectProfile,
  detectProjectLanguage,
  detectBuildTool,
  detectPackageManager,
  findExistingRelPath,
  collectRepoConventions,
  buildRepoMap,
  syncRepoMap,
};
