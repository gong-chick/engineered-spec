---
alwaysApply: false
description: Node.js 工具仓的 Contract 与 Schema 规范，包括 Schema 定义方式、Contract 校验策略与类型导出约定。当新增或修改 Contract / Schema 时读取此规则。
---

# Contract 与 Schema 规范（Node.js Tooling）

## Schema 定义

- 统一使用项目约定的 Schema 库（Zod / Ajv / io-ts）定义数据结构
- Schema 文件放在 `src/contracts/` 或 `src/schemas/` 目录
- 每个 Schema 对应独立文件，按业务领域命名

```typescript
// 示例：Zod Schema
import { z } from 'zod';

export const TaskPayloadSchema = z.object({
  taskId: z.string().uuid(),
  type: z.enum(['build', 'deploy', 'test']),
  params: z.record(z.unknown()),
});

export type TaskPayload = z.infer<typeof TaskPayloadSchema>;
```

## Contract 校验策略（NON-NEGOTIABLE）

- 所有外部输入（CLI 参数、API 响应、消息队列消息、文件内容）在入口处必须校验
- 校验失败必须给出明确的错误信息（字段路径 + 错误原因）
- 禁止使用 `as any` 绕过类型校验

## 类型导出约定

- Schema 推导出的 TypeScript 类型必须一并导出（`export type`）
- 类型名称与 Schema 名称保持对应（`TaskPayloadSchema` → `TaskPayload`）
- 禁止手动维护与 Schema 重复的类型定义

## 版本兼容性

- Contract 发生破坏性变更时，需同步更新版本号并提供迁移说明
- 向前兼容的变更（新增可选字段）无需升级大版本
