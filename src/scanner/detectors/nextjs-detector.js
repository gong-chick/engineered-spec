function hasDependency(facts, name) {
  return Boolean(facts.dependencies?.[name] || facts.devDependencies?.[name]);
}

class NextJsDetector {
  constructor() {
    this.name = 'NextJsDetector';
  }

  detect(facts) {
    const reasons = [];
    let confidence = 0;

    if (hasDependency(facts, 'next')) {
      confidence += 55;
      reasons.push('检测到 next 依赖');
    }
    if (hasDependency(facts, 'react')) {
      confidence += 10;
      reasons.push('检测到 react 依赖');
    }
    if ((facts.keyPaths || []).some((item) => item.startsWith('src/app/'))) {
      confidence += 20;
      reasons.push('检测到 Next.js App Router 目录');
    }
    if (Object.values(facts.scripts || {}).some((script) => String(script).includes('next'))) {
      confidence += 10;
      reasons.push('检测到 next 脚本');
    }
    if ((facts.keyPaths || []).some((item) => item.startsWith('next.config.'))) {
      confidence += 5;
      reasons.push('检测到 next.config 配置');
    }

    if (confidence < 40) return null;

    return {
      detector: this.name,
      framework: 'nextjs',
      language: hasDependency(facts, 'typescript') ? ['TypeScript'] : ['JavaScript'],
      buildTool: 'Next.js',
      confidence: Math.min(confidence, 100),
      tags: ['frontend', 'react', 'nextjs'],
      reasons,
      manifestSlug: 'frontend-nextjs-standard',
    };
  }
}

module.exports = {
  NextJsDetector,
};
