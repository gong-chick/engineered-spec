class FastApiDetector {
  constructor() {
    this.name = 'FastApiDetector';
  }

  detect(facts) {
    const text = `${facts.python?.requirementsTxt || ''}\n${facts.python?.pyprojectToml || ''}`.toLowerCase();
    const keyPaths = facts.keyPaths || [];
    const reasons = [];
    let confidence = 0;

    if (text.includes('fastapi')) {
      confidence += 65;
      reasons.push('检测到 fastapi 依赖');
    }
    if (text.includes('uvicorn')) {
      confidence += 15;
      reasons.push('检测到 uvicorn 运行依赖');
    }
    if (keyPaths.includes('requirements.txt')) {
      confidence += 10;
      reasons.push('检测到 requirements.txt');
    }
    if (keyPaths.includes('pyproject.toml')) {
      confidence += 10;
      reasons.push('检测到 pyproject.toml');
    }

    if (confidence < 50) return null;

    return {
      detector: this.name,
      framework: 'fastapi',
      language: ['Python'],
      buildTool: keyPaths.includes('pyproject.toml') ? 'pyproject' : 'requirements',
      confidence: Math.min(confidence, 100),
      tags: ['backend', 'python', 'fastapi'],
      reasons,
      manifestSlug: 'backend-python-fastapi-standard',
    };
  }
}

module.exports = {
  FastApiDetector,
};
