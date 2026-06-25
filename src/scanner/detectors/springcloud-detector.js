class SpringCloudDetector {
  constructor() {
    this.name = 'SpringCloudDetector';
  }

  detect(facts) {
    const javaText = `${facts.java?.pomXml || ''}\n${facts.java?.gradle || ''}`.toLowerCase();
    const keyPaths = facts.keyPaths || [];
    const reasons = [];
    let confidence = 0;

    if (facts.java?.keywords?.springCloud || javaText.includes('spring-cloud')) {
      confidence += 65;
      reasons.push('检测到 Spring Cloud 依赖');
    }
    if (javaText.includes('spring-boot') || javaText.includes('org.springframework.boot')) {
      confidence += 15;
      reasons.push('检测到 Spring Boot 基础依赖');
    }
    if (keyPaths.includes('src/main/resources/application.yml') || keyPaths.includes('src/main/resources/application.properties')) {
      confidence += 10;
      reasons.push('检测到 Spring 应用配置文件');
    }
    if (keyPaths.includes('src/main/java')) {
      confidence += 5;
      reasons.push('检测到 Java 源码目录');
    }

    if (confidence < 50) return null;

    return {
      detector: this.name,
      framework: 'spring-cloud',
      language: ['Java'],
      buildTool: keyPaths.includes('pom.xml') ? 'Maven' : 'Gradle',
      confidence: Math.min(confidence, 100),
      tags: ['backend', 'java', 'spring-cloud', 'spring-boot'],
      reasons,
      manifestSlug: 'backend-java-springcloud-standard',
    };
  }
}

module.exports = {
  SpringCloudDetector,
};
