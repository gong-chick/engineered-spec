const fs = require('fs');
const path = require('path');
const { ConfigWriter } = require('../project/config-writer');
const { ContextIndexWriter } = require('../project/context-index-writer');
const { LocalStateWriter } = require('../project/local-state-writer');
const { LockFileWriter } = require('../project/lock-file-writer');
const { ManifestWriter } = require('../project/manifest-writer');
const { PolicyConfigWriter } = require('../project/policy-config-writer');
const { ProjectConfigWriter } = require('../project/project-config-writer');
const { RegistryIndexWriter } = require('../project/registry-index-writer');
const { WorkspaceConfigWriter } = require('../project/workspace-config-writer');
const { ClaudeAdapter } = require('../ide/adapters/claude-adapter');
const { CursorAdapter } = require('../ide/adapters/cursor-adapter');
const { HookConfigWriter } = require('../hook/hook-config-writer');
const { IdePointerInjector } = require('./ide-pointer-injector');
const { IdeLinker } = require('./ide-linker');
const { ManifestInstaller } = require('./manifest-installer');
const { HubClient } = require('../hub/hub-client');
const { resolveHubConfig } = require('../hub/hub-config');
const { VisualReporter } = require('../visual/visual-reporter');
const pkg = require('../../package.json');

class InitApplier {
  constructor(options = {}) {
    this.manifestInstaller = options.manifestInstaller || new ManifestInstaller();
    this.claudeAdapter = options.claudeAdapter || new ClaudeAdapter();
    this.cursorAdapter = options.cursorAdapter || new CursorAdapter();
    this.configWriter = options.configWriter || new ConfigWriter();
    this.projectConfigWriter = options.projectConfigWriter || new ProjectConfigWriter();
    this.policyConfigWriter = options.policyConfigWriter || new PolicyConfigWriter();
    this.workspaceConfigWriter = options.workspaceConfigWriter || new WorkspaceConfigWriter();
    this.lockFileWriter = options.lockFileWriter || new LockFileWriter();
    this.manifestWriter = options.manifestWriter || new ManifestWriter();
    this.registryIndexWriter = options.registryIndexWriter || new RegistryIndexWriter();
    this.contextIndexWriter = options.contextIndexWriter || new ContextIndexWriter();
    this.localStateWriter = options.localStateWriter || new LocalStateWriter();
    this.hookConfigWriter = options.hookConfigWriter || new HookConfigWriter();
    this.idePointerInjector = options.idePointerInjector || new IdePointerInjector();
    this.ideLinker = options.ideLinker || new IdeLinker();
    this.hubClient = options.hubClient || new HubClient();
    this.visualReporter = options.visualReporter || new VisualReporter();
  }

  async apply(rootDir, plan, options = {}) {
    const writtenFiles = [];
    const installResult = this.manifestInstaller.install(plan);
    for (const asset of installResult.assets || []) {
      writtenFiles.push({
        path: asset,
        action: 'create',
        description: '安装本地资产文件',
      });
    }
    // 在写入 IDE 指针文件之前先创建符号链接，防止 IdePointerInjector
    // 把 .cursor/rules/ 创建为普通目录
    this.ideLinker.link(rootDir);

    const now = options.now || new Date().toISOString();

    // 写入 .ai-spec/config.json（P0.2 新增）
    const configResult = this.configWriter.write(rootDir, plan, { now });
    writtenFiles.push(configResult);

    // 创建项目内轻量目录（P0.2 新增）
    for (const dir of ['.memory', '.harness', 'reports/ai-spec']) {
      const dirPath = path.join(rootDir, dir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        writtenFiles.push({
          path: dir,
          fullPath: dirPath,
          action: 'create',
          description: `创建 ${dir} 目录`,
        });
      }
    }

    // 创建用户本机运行态目录（P0.2 新增）
    const localStateDir = configResult.data.localStateDir;
    const localStateResult = this.localStateWriter.write(localStateDir);
    if (localStateResult.created.length > 0) {
      writtenFiles.push({
        path: localStateDir,
        action: 'create',
        description: `创建本机运行态目录：${localStateResult.created.join(', ')}`,
      });
    }

    // 生成 Hook 配置（P0.7）
    const hookResult = this.hookConfigWriter.write(rootDir, { projectId: configResult.data.projectId });
    writtenFiles.push(hookResult);

    const projectResult = this.projectConfigWriter.write(rootDir, plan, { now });
    writtenFiles.push(projectResult);

    const policyResult = this.policyConfigWriter.write(rootDir, plan, { now, visualUrl: options.visualUrl });
    writtenFiles.push(policyResult);

    const workspaceResult = this.workspaceConfigWriter.write(rootDir, plan, { now });
    if (workspaceResult) {
      writtenFiles.push(workspaceResult);
    }

    const context = {
      projectId: configResult.data.projectId,
      workspaceId: workspaceResult?.data?.workspaceId || '',
    };

    // 写入 manifest.json（P0.3 增强：完整资产清单 + checksum）
    const manifestResult = this.manifestWriter.write(rootDir, plan, context, { now });
    writtenFiles.push(manifestResult);

    // 写入 lock 文件（P0.3 增强：generatedFiles + adapterOutputs）
    writtenFiles.push(this.lockFileWriter.write(rootDir, plan, context, { now, writtenFiles: writtenFiles.map((f) => ({ path: f.path })) }));
    writtenFiles.push(this.registryIndexWriter.write(rootDir, plan, context, { now }));
    writtenFiles.push(this.contextIndexWriter.write(rootDir, context, { now }));

    // 生成 Cursor 适配文件（P0.4）
    const manifestData = manifestResult.data;
    const profile = manifestData.profile || manifestData.profiles?.[0] || 'auto';
    const cursorResults = this.cursorAdapter.write(rootDir, { profile });
    writtenFiles.push(...cursorResults.map((r) => ({
      path: r.path,
      action: r.action,
      description: '生成 Cursor 适配规则',
    })));

    // 生成 Claude Code 适配文件（P0.5）
    const claudeResults = this.claudeAdapter.write(rootDir, { profile });
    writtenFiles.push(...claudeResults.map((r) => ({
      path: r.path,
      action: r.action,
      description: '生成 Claude Code 适配文件',
    })));

    writtenFiles.push(...this.idePointerInjector.write(rootDir));

    const result = {
      projectId: context.projectId,
      workspaceId: context.workspaceId,
      localStateDir,
      writtenFiles: writtenFiles.map((item) => ({
        path: item.path,
        action: item.action,
      })),
      warnings: [],
    };
    await this.reportInstallRecord(rootDir, plan, context, result, options);
    await this.reportProjectState(rootDir, result, options);
    return result;
  }

  async reportInstallRecord(rootDir, plan, context, result, options = {}) {
    const hubConfig = resolveHubConfig(rootDir, { hubUrl: options.hubUrl });
    const manifest = plan.packages.find((item) => item.recommendedManifest)?.recommendedManifest || null;
    if (!hubConfig.url || !manifest) return;
    try {
      await this.hubClient.createInstallRecord({
        projectId: context.projectId,
        workspaceId: context.workspaceId || '',
        manifest: {
          slug: manifest.slug,
          version: manifest.version || '1.0.0',
        },
        packages: plan.packages.map((item) => ({
          packageId: item.packageId,
          path: item.path,
          manifest: item.recommendedManifest ? {
            slug: item.recommendedManifest.slug,
            version: item.recommendedManifest.version || '1.0.0',
          } : null,
        })),
        installedAt: new Date().toISOString(),
        client: {
          name: 'br-ai-spec',
          version: pkg.version || '',
        },
      }, { hubUrl: hubConfig.url });
    } catch (error) {
      result.warnings.push(`Install Record 上报失败，不影响本地 init：${error.message}`);
    }
  }

  async reportProjectState(rootDir, result, options = {}) {
    const report = await this.visualReporter.reportProjectState(rootDir, {
      visualUrl: options.visualUrl,
      eventId: `project-state:${result.projectId}:init-apply`,
    });
    if (report.warning) {
      result.warnings.push(report.warning);
    }
  }
}

module.exports = {
  InitApplier,
};
