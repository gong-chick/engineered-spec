class GoDetector {
  constructor() {
    this.name = 'GoDetector';
  }

  detect(facts) {
    const goMod = String(facts.go?.goMod || '').toLowerCase();
    const keyPaths = facts.keyPaths || [];
    const reasons = [];
    let confidence = 0;

    if (keyPaths.includes('go.mod')) {
      confidence += 55;
      reasons.push('检测到 go.mod');
    }
    if (keyPaths.includes('main.go')) {
      confidence += 15;
      reasons.push('检测到 main.go');
    }
    if (goMod.includes('github.com/gin-gonic/gin')) {
      confidence += 15;
      reasons.push('检测到 Gin 依赖');
    }
    if (goMod.includes('google.golang.org/grpc')) {
      confidence += 15;
      reasons.push('检测到 gRPC 依赖');
    }

    if (confidence < 50) return null;

    return {
      detector: this.name,
      framework: 'go',
      language: ['Go'],
      buildTool: 'Go Modules',
      confidence: Math.min(confidence, 100),
      tags: ['backend', 'go'],
      reasons,
      manifestSlug: 'backend-go-standard',
    };
  }
}

module.exports = {
  GoDetector,
};
