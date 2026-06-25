function hasDependency(facts, name) {
  return Boolean(facts.dependencies?.[name] || facts.devDependencies?.[name]);
}

class NestJsDetector {
  constructor() {
    this.name = 'NestJsDetector';
  }

  detect(facts) {
    const reasons = [];
    const keyPaths = facts.keyPaths || [];
    let confidence = 0;

    if (hasDependency(facts, '@nestjs/core') || hasDependency(facts, '@nestjs/common')) {
      confidence += 45;
      reasons.push('检测到 NestJS 核心依赖');
    }
    if (hasDependency(facts, '@nestjs/platform-express') || hasDependency(facts, '@nestjs/platform-fastify')) {
      confidence += 15;
      reasons.push('检测到 NestJS 平台适配依赖');
    }
    if (hasDependency(facts, '@nestjs/cli')) {
      confidence += 10;
      reasons.push('检测到 @nestjs/cli');
    }
    if (Object.values(facts.scripts || {}).some((script) => String(script).includes('nest '))) {
      confidence += 10;
      reasons.push('检测到 nest 命令脚本');
    }
    if (keyPaths.includes('nest-cli.json')) {
      confidence += 10;
      reasons.push('检测到 nest-cli.json');
    }
    if (keyPaths.includes('src/main.ts') && keyPaths.includes('src/app.module.ts')) {
      confidence += 10;
      reasons.push('检测到 NestJS 常见入口文件');
    }

    if (confidence < 50) return null;

    return {
      detector: this.name,
      framework: 'nestjs',
      language: hasDependency(facts, 'typescript') ? ['TypeScript'] : ['JavaScript'],
      buildTool: 'Nest CLI',
      confidence: Math.min(confidence, 100),
      tags: ['backend', 'node', 'nestjs'],
      reasons,
      manifestSlug: 'backend-node-nestjs-standard',
    };
  }
}

module.exports = {
  NestJsDetector,
};
