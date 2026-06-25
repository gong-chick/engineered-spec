#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function exists(root, relPath) {
  return fs.existsSync(path.join(root, relPath));
}

function readJson(root, relPath) {
  const target = path.join(root, relPath);
  if (!fs.existsSync(target)) return null;
  try {
    return JSON.parse(fs.readFileSync(target, 'utf8'));
  } catch {
    return null;
  }
}

function listDir(root, relPath) {
  const target = path.join(root, relPath);
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
    return [];
  }
  return fs.readdirSync(target).filter((name) => name !== '.DS_Store').sort();
}

function detectFrontendStack(packageJson) {
  const allDeps = {
    ...(packageJson?.dependencies || {}),
    ...(packageJson?.devDependencies || {}),
  };
  const keys = Object.keys(allDeps);
  const has = (name) => keys.some((key) => key === name || key.startsWith(`${name}/`));

  return {
    ui_framework: has('react') ? 'react' : has('vue') ? 'vue' : has('@angular/core') ? 'angular' : null,
    typescript: has('typescript'),
    build_tool: has('vite') ? 'vite' : has('next') ? 'next' : has('nuxt') ? 'nuxt' : has('webpack') ? 'webpack' : null,
    routing: has('react-router') || has('react-router-dom') ? 'react-router' : has('vue-router') ? 'vue-router' : null,
    state: has('zustand') ? 'zustand' : has('pinia') ? 'pinia' : has('@reduxjs/toolkit') || has('redux') ? 'redux' : has('mobx') ? 'mobx' : null,
    ui_library: has('antd') ? 'antd' : has('element-plus') ? 'element-plus' : has('@mui/material') ? '@mui/material' : null,
    style_signals: ['tailwindcss', 'sass', 'less'].filter((name) => has(name)),
    http: has('axios') ? 'axios' : null,
    utilities: keys.filter((key) => ['ahooks', '@vueuse/core', 'lodash', 'lodash-es', 'dayjs'].includes(key)),
  };
}

function detectBackendMarkers(root) {
  const javaMarkers = ['pom.xml', 'build.gradle', 'build.gradle.kts'].filter((name) => exists(root, name));
  const pythonMarkers = ['pyproject.toml', 'requirements.txt', 'setup.py'].filter((name) => exists(root, name));
  return {
    java: javaMarkers,
    python: pythonMarkers,
  };
}

function detectRuleWriteSet(root, manifest) {
  const customRules =
    manifest?.local_preferences?.project_init?.custom_rules &&
    Array.isArray(manifest.local_preferences.project_init.custom_rules)
      ? manifest.local_preferences.project_init.custom_rules.map(String)
      : [];
  const candidates = ['04', '05', '06', '07', '09'];
  const missing = [];
  for (const code of candidates) {
    const targetDir = path.join(root, '.agents', 'rules');
    if (!fs.existsSync(targetDir)) continue;
    const existing = fs.readdirSync(targetDir).some((name) => name.startsWith(`${code}-`));
    if (!existing) {
      missing.push(code);
    }
  }
  return {
    custom_rules: customRules,
    missing_rules: missing,
  };
}

function detectSourceLayout(root) {
  const srcEntries = listDir(root, 'src');
  const entryCandidates = ['src/main.ts', 'src/main.tsx', 'src/App.vue', 'src/App.tsx'].filter((relPath) => exists(root, relPath));
  return {
    src_entries: srcEntries,
    entry_files: entryCandidates,
    page_dirs: ['src/views', 'src/pages'].filter((relPath) => exists(root, relPath)),
    route_dirs: ['src/router', 'src/routes'].filter((relPath) => exists(root, relPath)),
    styles_dir: exists(root, 'src/styles'),
    component_dirs: ['src/components'].filter((relPath) => exists(root, relPath)),
    store_dirs: ['src/store', 'src/stores'].filter((relPath) => exists(root, relPath)),
    api_dirs: ['src/api', 'src/services', 'src/request'].filter((relPath) => exists(root, relPath)),
  };
}

function main() {
  const targetRoot = path.resolve(process.argv[2] || process.cwd());
  const packageJson = readJson(targetRoot, 'package.json');
  const manifest = readJson(targetRoot, '.ai-spec/manifest.json');
  const summary = {
    root: targetRoot,
    package_json: Boolean(packageJson),
    openspec: exists(targetRoot, 'openspec'),
    readme: exists(targetRoot, 'README.md'),
    frontend_stack: detectFrontendStack(packageJson || {}),
    backend_markers: detectBackendMarkers(targetRoot),
    layout: detectSourceLayout(targetRoot),
    rules: detectRuleWriteSet(targetRoot, manifest),
  };

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main();
