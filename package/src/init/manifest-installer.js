const fs = require('fs');
const path = require('path');
const { createChecksum } = require('../project/json-utils');
const { MANIFEST_CONFIDENCE, PROJECT_KINDS } = require('./types');

const FRAMEWORK_MANIFESTS = Object.freeze({
  nextjs: 'frontend-react-nextjs-standard',
  'react-vite': 'frontend-react-vite-standard',
  'react-webpack': 'frontend-react-standard',
  'vue-vite': 'frontend-vue-vite-standard',
  'spring-boot': 'backend-java-springboot-standard',
  'spring-mvc': 'backend-java-springmvc-legacy-standard',
  'spring-cloud': 'backend-java-springcloud-standard',
  nestjs: 'backend-node-nestjs-standard',
  fastapi: 'backend-python-fastapi-standard',
  go: 'backend-go-standard',
});

/** Manifest slug → profile 目录名映射，用于选择对应的 profile rules/skills */
const MANIFEST_TO_PROFILE = Object.freeze({
  'frontend-vue-vite-standard': 'vue',
  'frontend-react-vite-standard': 'react',
  'frontend-react-standard': 'react',
  'frontend-react-nextjs-standard': 'react',
  'backend-java-springboot-standard': 'springboot',
  'backend-java-springmvc-legacy-standard': 'springboot',
  'backend-java-springcloud-standard': 'springboot',
  'backend-node-nestjs-standard': 'nestjs',
});

/** 需要从 br-ai-spec 复制到目标项目的 .agents 子目录 */
const AGENT_ASSET_DIRS = ['rules', 'skills', 'roles', 'commands', 'flows', 'orchestration', 'templates'];

class HubClient {
  async resolveManifest(_slug, _version) {
    return null;
  }
}

/** 递归复制目录 */
function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else if (entry.isSymbolicLink()) {
      try {
        const realPath = fs.realpathSync(srcPath);
        if (fs.statSync(realPath).isDirectory()) {
          copyDirSync(realPath, destPath);
        } else {
          fs.copyFileSync(realPath, destPath);
        }
      } catch (_) {
        // symlink 无法解析则跳过
      }
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/** 合并复制：先复制 baseDir 下所有文件到 destDir，再用 overlayDir 覆盖 */
function mergeCopyDirs(baseDir, overlayDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  // 先复制 base
  if (fs.existsSync(baseDir)) {
    for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
      const srcPath = path.join(baseDir, entry.name);
      const destPath = path.join(destDir, entry.name);
      if (entry.isDirectory()) {
        copyDirSync(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
  // 再覆盖 overlay
  if (fs.existsSync(overlayDir)) {
    for (const entry of fs.readdirSync(overlayDir, { withFileTypes: true })) {
      const srcPath = path.join(overlayDir, entry.name);
      const destPath = path.join(destDir, entry.name);
      if (entry.isDirectory()) {
        copyDirSync(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}

/**
 * 安装扁平化后的 rules：
 *   只安装 common/ 下的通用规则。profile 专属规则（01/03/04/05/06/07/09/11/13）
 *   应由 project-init 技能基于实际项目扫描结果生成，不在 init 阶段复制模板。
 */
function installRulesFlat(sourceAgentsDir, targetAgentsDir, _profile) {
  const destDir = path.join(targetAgentsDir, 'rules');
  if (fs.existsSync(destDir)) {
    fs.rmSync(destDir, { recursive: true, force: true });
  }

  const commonDir = path.join(sourceAgentsDir, 'rules', 'common');
  if (!fs.existsSync(commonDir)) return false;
  copyDirSync(commonDir, destDir);

  // 保留 rules/ 根目录下的 README.md
  const readmePath = path.join(sourceAgentsDir, 'rules', 'README.md');
  if (fs.existsSync(readmePath)) {
    fs.copyFileSync(readmePath, path.join(destDir, 'README.md'));
  }
  return true;
}

/**
 * 安装扁平化后的 skills：
 *   合并 common/ + domains/ + profiles/<profile>/ 下的所有目录
 */
function installSkillsFlat(sourceAgentsDir, targetAgentsDir, profile) {
  const destDir = path.join(targetAgentsDir, 'skills');
  if (fs.existsSync(destDir)) {
    fs.rmSync(destDir, { recursive: true, force: true });
  }
  fs.mkdirSync(destDir, { recursive: true });

  const sourceSkillsDir = path.join(sourceAgentsDir, 'skills');
  const dirsToMerge = [];
  for (const sub of ['common', 'domains']) {
    const subDir = path.join(sourceSkillsDir, sub);
    if (fs.existsSync(subDir)) dirsToMerge.push(subDir);
  }
  if (profile) {
    const profileDir = path.join(sourceSkillsDir, 'profiles', profile);
    if (fs.existsSync(profileDir)) dirsToMerge.push(profileDir);
  }

  for (const srcDir of dirsToMerge) {
    for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const srcPath = path.join(srcDir, entry.name);
      const destPath = path.join(destDir, entry.name);
      if (fs.existsSync(destPath)) {
        fs.rmSync(destPath, { recursive: true, force: true });
      }
      copyDirSync(srcPath, destPath);
    }
  }

  // 保留 skills/ 根目录下的 README.md
  const readmePath = path.join(sourceSkillsDir, 'README.md');
  if (fs.existsSync(readmePath)) {
    fs.copyFileSync(readmePath, path.join(destDir, 'README.md'));
  }
  return true;
}

class ManifestInstaller {
  constructor(options = {}) {
    this.hubClient = options.hubClient || new HubClient();
    this.pkgRoot = options.pkgRoot || path.join(__dirname, '..', '..');
  }

  recommendForPackage(pkg, options = {}) {
    if (options.manualManifestSlug) {
      return {
        slug: options.manualManifestSlug,
        version: '1.0.0',
        score: 100,
        reasons: ['用户通过 --manifest 手动指定 Manifest'],
        warnings: ['这是用户手动指定的 Manifest，未接入真实 Hub API 校验'],
        requiresConfirmation: false,
        checksum: createChecksum(`${options.manualManifestSlug}@1.0.0`),
      };
    }

    const primary = pkg.primary || null;
    if (!primary) {
      return null;
    }

    if (pkg.projectKind === PROJECT_KINDS.CLI_TOOL) {
      return null;
    }
    if (pkg.projectKind === PROJECT_KINDS.LIBRARY && (primary.tags || []).includes('frontend')) {
      return null;
    }

    const framework = primary?.framework || null;
    const slug = FRAMEWORK_MANIFESTS[framework];
    if (!slug) {
      return null;
    }

    const score = primary?.confidence || 0;
    if (score < MANIFEST_CONFIDENCE.REQUIRE_CONFIRM) {
      return null;
    }

    const reasons = [];

    reasons.push(`根据 scanner primary ${framework} 推荐 ${slug}`);
    for (const reason of primary?.reasons || []) {
      reasons.push(reason);
    }

    return {
      slug,
      version: '1.0.0',
      score,
      reasons,
      warnings: score < MANIFEST_CONFIDENCE.AUTO_SELECT ? ['技术栈识别置信度低于 80，需要人工确认'] : [],
      requiresConfirmation: score < MANIFEST_CONFIDENCE.AUTO_SELECT,
      checksum: createChecksum(`${slug}@1.0.0`),
    };
  }

  /**
   * 将 br-ai-spec 的 .agents 资产复制到目标项目，并扁平化 rules 和 skills
   */
  install(plan) {
    const rootDir = plan.workspace?.rootDir;
    if (!rootDir) {
      return {
        source: 'local',
        manifest: plan.packages[0]?.recommendedManifest || null,
        assets: [],
        overlays: [],
        sharedContracts: [],
      };
    }

    const sourceAgentsDir = path.join(this.pkgRoot, '.agents');
    const targetAgentsDir = path.join(rootDir, '.agents');

    if (!fs.existsSync(sourceAgentsDir)) {
      return {
        source: 'local',
        manifest: plan.packages[0]?.recommendedManifest || null,
        assets: [],
        overlays: [],
        sharedContracts: [],
        warnings: ['本地 .agents 源目录不存在，未安装资产文件'],
      };
    }

    // 根据 recommendedManifest 确定 profile
    const manifestSlug = plan.packages[0]?.recommendedManifest?.slug || null;
    const profile = MANIFEST_TO_PROFILE[manifestSlug] || null;

    const installedAssets = [];

    // rules: 扁平化安装
    if (installRulesFlat(sourceAgentsDir, targetAgentsDir, profile)) {
      installedAssets.push('.agents/rules/');
    }

    // skills: 扁平化安装
    if (installSkillsFlat(sourceAgentsDir, targetAgentsDir, profile)) {
      installedAssets.push('.agents/skills/');
    }

    // 其余目录直接复制
    for (const dir of AGENT_ASSET_DIRS) {
      if (dir === 'rules' || dir === 'skills') continue;

      const srcDir = path.join(sourceAgentsDir, dir);
      const destDir = path.join(targetAgentsDir, dir);

      if (!fs.existsSync(srcDir)) continue;

      try {
        if (fs.existsSync(destDir)) {
          fs.rmSync(destDir, { recursive: true, force: true });
        }
        copyDirSync(srcDir, destDir);
        installedAssets.push(`.agents/${dir}/`);
      } catch (error) {
        installedAssets.push(`.agents/${dir}/ (失败: ${error.message})`);
      }
    }

    return {
      source: 'local',
      manifest: plan.packages[0]?.recommendedManifest || null,
      assets: installedAssets,
      overlays: [],
      sharedContracts: [],
    };
  }
}

module.exports = {
  AGENT_ASSET_DIRS,
  FRAMEWORK_MANIFESTS,
  MANIFEST_TO_PROFILE,
  HubClient,
  ManifestInstaller,
  copyDirSync,
  mergeCopyDirs,
};
