---
name: config-and-secret-scan
description: 统一配置项命名、分层与校验方式，并扫描代码与配置文件中的硬编码密钥、敏感信息或不安全配置。当用户说“检查配置”“新增配置项”“扫描敏感信息”“密钥泄露”“secret scan”“环境变量规范”时使用。
compatibility: Requires access to a local repository workspace and project config files; designed for source scanning rather than remote-only review.
---

# 配置与敏感信息扫描

## 使用时机

当你需要：

- 新增或调整环境变量、配置项、配置文档
- 检查仓库里是否有硬编码 token、密码、API Key、证书片段
- 对齐 `.env`、配置模块、启动校验的写法

优先同时参考：

- `.agents/rules/common/08-通用约束.md`
- 当前项目已有的 `.env.example`、配置模块、启动入口

## 核心原则

- 配置名保持全大写、下划线分隔，避免写死业务前缀假设
- 示例只写占位符，不写真实密钥
- 先看项目已有配置约定，再补统一规范
- 输出以位置、风险和修复建议为主，不做空泛安全口号
- 若当前在协议流程中，优先把结果沉淀到当前 `checklist.md`、`risk-findings` 或用户指定文档，不写死固定输出目录

## 配置规范

### 命名与分层

- 环境变量：如 `API_BASE_URL`、`LOG_LEVEL`、`ACCESS_TOKEN_TTL`
- 按环境区分：`.env.development`、`.env.test`、`.env.production` 或配置中心 namespace
- 新增配置项至少说明：
  - 用途
  - 类型
  - 默认值
  - 是否必填
  - 缺失时的处理方式

### 启动校验

- 启动时校验关键配置，避免运行时才暴露缺失项
- 端口、URL、布尔、枚举值应做最小格式校验
- `.env.example` 只保留字段名、示例值或占位符

## 扫描目标

默认检查下列内容：

- 硬编码密码：`password = "..."`、`pwd = "..."` 等
- API Key / Token：`apiKey`、`token`、`secret`、`bearer`、`authorization`
- 私钥或证书片段：`-----BEGIN`
- 配置文件中的敏感字段：`.env`、`config.*`、`*.yaml`、`*.yml`
- 明显不安全配置：关闭鉴权、跳过证书校验、生产环境默认弱口令

## 排除项

- `node_modules`、`dist`、`coverage`、缓存目录
- `.env.example`、模板文档中的明确占位符
- 测试假值：`dummy`、`test`、`example`、`your_xxx`

## 输出格式

按表格或清单输出：

| 文件 | 行号 | 风险类型 | 片段 | 建议 |
|------|------|----------|------|------|
| `src/config/auth.ts` | `12` | `hardcoded-token` | `Bearer sk-***` | 改为从环境变量或密钥服务读取 |

若没有发现问题，明确写：

- 未发现疑似硬编码密钥或明显不安全配置

## 执行步骤

### 1. 识别当前任务

- 若是“新增配置项”，先找现有配置模块、启动入口、`.env.example`
- 若是“扫描敏感信息”，先确定扫描范围；未指定时默认扫描仓库源码与配置目录

### 2. 读取项目事实

- 查看 `package.json`、启动入口、配置模块
- 判断项目是直接读 `process.env`、配置对象，还是走统一配置层

### 3. 输出结果

- 配置类需求：给出字段定义、示例、读取方式、校验建议
- 扫描类需求：给出命中位置、风险说明、修复建议
- 若在协议流程内，优先将结果归入当前审查/风险产物

## 禁止事项

- 不写入真实密钥
- 不把占位符误判为真实泄露
- 不忽略项目已有配置约定，自行发明另一套命名体系
