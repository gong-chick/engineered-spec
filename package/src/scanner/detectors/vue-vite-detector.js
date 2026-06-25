function hasDependency(facts, name) {
  return Boolean(facts.dependencies?.[name] || facts.devDependencies?.[name]);
}

class VueViteDetector {
  constructor() {
    this.name = 'VueViteDetector';
  }

  detect(facts) {
    const reasons = [];
    let confidence = 0;

    if (hasDependency(facts, 'vue')) {
      confidence += 40;
      reasons.push('检测到 vue 依赖');
    }
    if (hasDependency(facts, 'vite')) {
      confidence += 25;
      reasons.push('检测到 vite 依赖');
    }
    if (hasDependency(facts, '@vitejs/plugin-vue')) {
      confidence += 20;
      reasons.push('检测到 @vitejs/plugin-vue 插件');
    }
    if ((facts.keyPaths || []).includes('src/main.ts') || (facts.keyPaths || []).includes('src/main.js')) {
      confidence += 5;
      reasons.push('检测到 Vue 常见入口文件');
    }
    if ((facts.keyPaths || []).some((item) => item.startsWith('vite.config.'))) {
      confidence += 5;
      reasons.push('检测到 vite.config 配置');
    }

    if (confidence < 40) return null;

    return {
      detector: this.name,
      framework: 'vue-vite',
      language: hasDependency(facts, 'typescript') ? ['TypeScript'] : ['JavaScript'],
      buildTool: 'Vite',
      confidence: Math.min(confidence, 100),
      tags: ['frontend', 'vue', 'vite'],
      reasons,
      manifestSlug: 'frontend-vue-vite-standard',
    };
  }
}

module.exports = {
  VueViteDetector,
};
