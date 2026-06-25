class SpringMvcDetector {
  constructor() {
    this.name = 'SpringMvcDetector';
  }

  detect(facts) {
    const javaText = `${facts.java?.pomXml || ''}\n${facts.java?.gradle || ''}`.toLowerCase();
    const keyPaths = facts.keyPaths || [];
    const reasons = [];
    let confidence = 0;

    if (facts.java?.keywords?.springMvc || javaText.includes('spring-webmvc')) {
      confidence += 55;
      reasons.push('检测到 Spring MVC 依赖');
    }
    if (javaText.includes('javax.servlet') || javaText.includes('jakarta.servlet')) {
      confidence += 15;
      reasons.push('检测到 Servlet 依赖');
    }
    if (keyPaths.includes('src/main/java')) {
      confidence += 10;
      reasons.push('检测到 Java 源码目录');
    }
    if (keyPaths.includes('pom.xml') || keyPaths.includes('build.gradle') || keyPaths.includes('build.gradle.kts')) {
      confidence += 10;
      reasons.push('检测到 Java 构建文件');
    }

    if (confidence < 50) return null;

    return {
      detector: this.name,
      framework: 'spring-mvc',
      language: ['Java'],
      buildTool: keyPaths.includes('pom.xml') ? 'Maven' : 'Gradle',
      confidence: Math.min(confidence, 100),
      tags: ['backend', 'java', 'spring-mvc'],
      reasons,
      manifestSlug: 'backend-java-springmvc-standard',
    };
  }
}

module.exports = {
  SpringMvcDetector,
};
