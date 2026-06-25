function hasDependency(facts, name) {
  return Boolean(facts.dependencies?.[name] || facts.devDependencies?.[name]);
}

class ReactWebpackDetector {
  constructor() {
    this.name = 'ReactWebpackDetector';
  }

  detect(facts) {
    const reasons = [];
    let confidence = 0;
    const keyPaths = facts.keyPaths || [];

    if (hasDependency(facts, 'react')) {
      confidence += 35;
      reasons.push('检测到 react 依赖');
    }
    if (hasDependency(facts, 'react-dom')) {
      confidence += 10;
      reasons.push('检测到 react-dom 依赖');
    }
    if (hasDependency(facts, 'webpack')) {
      confidence += 25;
      reasons.push('检测到 webpack 依赖');
    }
    if (hasDependency(facts, 'babel-preset-react-app') || hasDependency(facts, 'react-dev-utils')) {
      confidence += 15;
      reasons.push('检测到 CRA/React App 构建依赖');
    }
    if (keyPaths.includes('config/webpack.config.js') || keyPaths.includes('webpack.config.js')) {
      confidence += 10;
      reasons.push('检测到 webpack 配置文件');
    }
    if (keyPaths.includes('src/index.tsx') || keyPaths.includes('src/index.jsx') || keyPaths.includes('src/App.tsx')) {
      confidence += 10;
      reasons.push('检测到 React 常见入口文件');
    }

    if (confidence < 50) return null;

    return {
      detector: this.name,
      framework: 'react-webpack',
      language: hasDependency(facts, 'typescript') ? ['TypeScript'] : ['JavaScript'],
      buildTool: 'Webpack',
      confidence: Math.min(confidence, 100),
      tags: ['frontend', 'react', 'webpack'],
      reasons,
      manifestSlug: 'frontend-react-standard',
    };
  }
}

module.exports = {
  ReactWebpackDetector,
};
