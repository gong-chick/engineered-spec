const SCANNER_SCHEMA_VERSION = 1;

const PROJECT_TYPES = Object.freeze({
  SINGLE: 'single-project',
  NODE_WORKSPACE: 'node-workspace',
  PNPM_WORKSPACE: 'pnpm-workspace',
  PACKAGE_JSON_WORKSPACE: 'package-json-workspace',
  LERNA_WORKSPACE: 'lerna-workspace',
  TURBO_WORKSPACE: 'turbo-workspace',
  NX_WORKSPACE: 'nx-workspace',
  MAVEN_MULTI_MODULE: 'maven-multi-module',
  GRADLE_MULTI_MODULE: 'gradle-multi-module',
  MULTI_PROJECT_WORKSPACE: 'multi-project-workspace',
  JAVA_PROJECT: 'java-project',
  GO_PROJECT: 'go-project',
  PYTHON_PROJECT: 'python-project',
  UNKNOWN: 'unknown',
});

const DETECTION_CONFIDENCE = Object.freeze({
  HIGH: 80,
  MEDIUM: 60,
  LOW: 30,
});

module.exports = {
  SCANNER_SCHEMA_VERSION,
  PROJECT_TYPES,
  DETECTION_CONFIDENCE,
};
