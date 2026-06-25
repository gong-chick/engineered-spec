const fs = require('fs');
const path = require('path');

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function readTextIfExists(filePath) {
  if (!fs.existsSync(filePath)) return '';
  return fs.readFileSync(filePath, 'utf8');
}

function addDependencies(target, dependencies, source, overwrite = true) {
  for (const [name, version] of Object.entries(dependencies || {})) {
    if (!overwrite && target[name]) continue;
    if (version && typeof version === 'object' && Object.prototype.hasOwnProperty.call(version, 'version')) {
      target[name] = { ...version, source: version.source || source };
      continue;
    }
    target[name] = {
      version: String(version),
      source,
    };
  }
}

function detectPackageManager(packageDir, packageJson) {
  if (fs.existsSync(path.join(packageDir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(packageDir, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(packageDir, 'package-lock.json'))) return 'npm';
  if (typeof packageJson?.packageManager === 'string') {
    return packageJson.packageManager.split('@')[0];
  }
  return null;
}

const TEST_TOOL_MARKERS = {
  vitest: ['vitest'],
  jest: ['jest', '@jest/core', 'ts-jest'],
  mocha: ['mocha', '@types/mocha'],
  cypress: ['cypress'],
  playwright: ['playwright', '@playwright/test'],
  'testing-library': ['@testing-library/react', '@testing-library/vue', '@testing-library/jest-dom'],
};

const COMPONENT_LIBRARY_MARKERS = {
  'ant-design': ['antd', '@ant-design/icons', '@ant-design/pro-components'],
  'element-plus': ['element-plus'],
  'element-ui': ['element-ui'],
  'ant-design-vue': ['ant-design-vue'],
  'arco-design': ['@arco-design/web-react', '@arco-design/web-vue'],
  'naive-ui': ['naive-ui'],
  'vuetify': ['vuetify'],
  'chakra-ui': ['@chakra-ui/react', '@chakra-ui/vue'],
  'mui': ['@mui/material', '@mui/icons-material', '@mui/x-data-grid'],
  'radix-ui': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu'],
  'shadcn-ui': ['@shadcn/ui'],
};

function detectTestTools(allDeps) {
  const found = [];
  for (const [tool, markers] of Object.entries(TEST_TOOL_MARKERS)) {
    if (markers.some((m) => allDeps[m])) {
      found.push(tool);
    }
  }
  return found;
}

function detectComponentLibraries(allDeps) {
  const found = [];
  for (const [lib, markers] of Object.entries(COMPONENT_LIBRARY_MARKERS)) {
    if (markers.some((m) => allDeps[m])) {
      found.push(lib);
    }
  }
  return found;
}

function collectKeyPaths(packageDir) {
  const candidates = [
    'package.json',
    'pnpm-workspace.yaml',
    'vite.config.ts',
    'vite.config.js',
    'next.config.js',
    'next.config.mjs',
    'next.config.ts',
    'src/app/layout.tsx',
    'src/app/page.tsx',
    'src/pages/_app.tsx',
    'src/main.tsx',
    'src/main.jsx',
    'src/index.tsx',
    'src/index.jsx',
    'src/main.ts',
    'src/main.js',
    'src/App.tsx',
    'config/webpack.config.js',
    'webpack.config.js',
    'nest-cli.json',
    'src/app.module.ts',
    'pom.xml',
    'build.gradle',
    'build.gradle.kts',
    'src/main/java',
    'src/main/resources/application.yml',
    'src/main/resources/application.properties',
    'go.mod',
    'main.go',
    'pyproject.toml',
    'requirements.txt',
  ];
  return candidates.filter((relativePath) => fs.existsSync(path.join(packageDir, relativePath)));
}

function extractJavaKeywords(text) {
  const value = String(text || '').toLowerCase();
  return {
    springBoot: value.includes('spring-boot') || value.includes('org.springframework.boot'),
    springCloud: value.includes('spring-cloud') || value.includes('org.springframework.cloud'),
    springMvc: value.includes('spring-webmvc') || value.includes('springframework.web.servlet') || value.includes('spring-context'),
    myBatis: value.includes('mybatis') || value.includes('mybatis-spring'),
  };
}

function readRootPackageFacts(workspaceRoot) {
  const packageJson = readJsonIfExists(path.join(workspaceRoot, 'package.json'));
  const dependencies = {};
  const devDependencies = {};
  if (packageJson) {
    addDependencies(dependencies, packageJson.dependencies, 'workspace-root');
    addDependencies(devDependencies, packageJson.devDependencies, 'workspace-root');
    addDependencies(dependencies, packageJson.peerDependencies, 'workspace-root');
  }
  return {
    packageJson,
    dependencies,
    devDependencies,
  };
}

class FactExtractor {
  extract(input) {
    const packageDir = path.resolve(input.rootDir);
    const workspaceRoot = path.resolve(input.workspaceRoot || packageDir);
    const packageJson = readJsonIfExists(path.join(packageDir, 'package.json'));
    const rootFacts = packageDir === workspaceRoot
      ? { packageJson, dependencies: {}, devDependencies: {} }
      : readRootPackageFacts(workspaceRoot);
    const dependencies = {};
    const devDependencies = {};

    addDependencies(dependencies, rootFacts.dependencies, 'workspace-root', false);
    addDependencies(devDependencies, rootFacts.devDependencies, 'workspace-root', false);

    if (packageJson) {
      addDependencies(dependencies, packageJson.dependencies, 'local');
      addDependencies(devDependencies, packageJson.devDependencies, 'local');
      addDependencies(dependencies, packageJson.peerDependencies, 'local');
    }

    const pomXml = readTextIfExists(path.join(packageDir, 'pom.xml'));
    const gradle = [
      readTextIfExists(path.join(packageDir, 'build.gradle')),
      readTextIfExists(path.join(packageDir, 'build.gradle.kts')),
    ].filter(Boolean).join('\n');
    const goMod = readTextIfExists(path.join(packageDir, 'go.mod'));
    const requirementsTxt = readTextIfExists(path.join(packageDir, 'requirements.txt'));
    const pyprojectToml = readTextIfExists(path.join(packageDir, 'pyproject.toml'));
    const keyPaths = collectKeyPaths(packageDir);
    const javaKeywords = extractJavaKeywords(`${pomXml}\n${gradle}`);

    return {
      packageId: input.relativePath === '.' ? 'root' : input.relativePath.replace(/[^a-zA-Z0-9_-]+/g, '_'),
      name: packageJson?.name || null,
      relativePath: input.relativePath || path.relative(workspaceRoot, packageDir) || '.',
      rootDir: packageDir,
      packageJson: packageJson || null,
      packageManager: detectPackageManager(packageDir, packageJson),
      scripts: packageJson?.scripts || {},
      dependencies,
      devDependencies,
      testTools: detectTestTools({ ...dependencies, ...devDependencies }),
      componentLibraries: detectComponentLibraries({ ...dependencies, ...devDependencies }),
      manifestFiles: keyPaths.filter((item) => ['package.json', 'pom.xml', 'build.gradle', 'build.gradle.kts', 'go.mod', 'pyproject.toml', 'requirements.txt'].includes(item)),
      keyPaths,
      java: {
        pomXml,
        gradle,
        keywords: javaKeywords,
      },
      python: {
        requirementsTxt,
        pyprojectToml,
      },
      go: {
        goMod,
      },
    };
  }
}

module.exports = {
  FactExtractor,
};
