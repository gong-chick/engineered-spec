class SpringBootDetector {
  constructor() {
    this.name = 'SpringBootDetector';
  }

  detect(facts) {
    const javaText = `${facts.java?.pomXml || ''}\n${facts.java?.gradle || ''}`;
    const keyPaths = facts.keyPaths || [];
    const reasons = [];
    let confidence = 0;

    if (javaText.includes('spring-boot-starter') || javaText.includes('org.springframework.boot')) {
      confidence += 65;
      reasons.push('检测到 Spring Boot 依赖');
    }
    if (keyPaths.includes('pom.xml')) {
      confidence += 10;
      reasons.push('检测到 Maven pom.xml');
    }
    if (keyPaths.includes('build.gradle') || keyPaths.includes('build.gradle.kts')) {
      confidence += 10;
      reasons.push('检测到 Gradle 构建文件');
    }
    if (keyPaths.includes('src/main/java')) {
      confidence += 10;
      reasons.push('检测到 Java 源码目录');
    }

    if (confidence < 50) return null;

    return {
      detector: this.name,
      framework: 'spring-boot',
      language: ['Java'],
      buildTool: keyPaths.includes('pom.xml') ? 'Maven' : 'Gradle',
      confidence: Math.min(confidence, 100),
      tags: ['backend', 'java', 'spring-boot'],
      reasons,
      manifestSlug: 'backend-java-springboot-standard',
    };
  }
}

module.exports = {
  SpringBootDetector,
};
