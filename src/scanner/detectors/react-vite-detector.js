function hasDependency(facts, name) {
  return Boolean(facts.dependencies?.[name] || facts.devDependencies?.[name]);
}

class ReactViteDetector {
  constructor() {
    this.name = 'ReactViteDetector';
  }

  detect(facts) {
    const reasons = [];
    let confidence = 0;

    if (hasDependency(facts, 'react')) {
      confidence += 35;
      reasons.push('检测到 react 依赖');
    }
    if (hasDependency(facts, 'vite')) {
      confidence += 25;
      reasons.push('检测到 vite 依赖');
    }
    if (hasDependency(facts, '@vitejs/plugin-react')) {
      confidence += 20;
      reasons.push('检测到 @vitejs/plugin-react 插件');
    }
    if ((facts.keyPaths || []).includes('src/main.tsx') || (facts.keyPaths || []).includes('src/main.jsx')) {
      confidence += 10;
      reasons.push('检测到 React 入口文件');
    }
    if ((facts.keyPaths || []).some((item) => item.startsWith('vite.config.'))) {
      confidence += 5;
      reasons.push('检测到 vite.config 配置');
    }

    if (confidence < 40) return null;

    return {
      detector: this.name,
      framework: 'react-vite',
      language: hasDependency(facts, 'typescript') ? ['TypeScript'] : ['JavaScript'],
      buildTool: 'Vite',
      confidence: Math.min(confidence, 100),
      tags: ['frontend', 'react', 'vite'],
      reasons,
      manifestSlug: 'frontend-react-vite-standard',
    };
  }
}

module.exports = {
  ReactViteDetector,
};
