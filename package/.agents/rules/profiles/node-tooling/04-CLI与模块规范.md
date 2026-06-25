---
alwaysApply: false
description: Node.js 工具仓的 CLI 与模块规范，包括命令定义方式、参数约定、模块导出规则。当新增 CLI 命令或模块时读取此规则。
---

# CLI 与模块规范（Node.js Tooling）

## CLI 命令设计

- 使用团队约定的 CLI 框架（如 `commander`、`yargs`、`meow`）
- 每个子命令对应独立文件，命令描述必须清晰
- 命令参数使用 `--kebab-case` 风格
- 所有命令必须提供 `--help` 说明

```typescript
// 示例：commander 风格
program
  .command('run <task>')
  .description('执行指定任务')
  .option('--dry-run', '仅预览，不实际执行')
  .action(async (task, options) => {
    await runTask(task, options);
  });
```

## 模块导出规则（NON-NEGOTIABLE）

- 每个模块在 `index.ts` 中统一导出公共接口
- 内部实现文件不应从模块外直接引用
- 导出的函数和类必须有明确的 TypeScript 类型签名
- 发布到 npm 的包必须在 `package.json` 中声明 `exports` 字段

## 异步处理

- 优先使用 `async/await`，避免 callback 嵌套
- 所有异步操作必须处理错误（try/catch 或 `.catch()`）
- 长时间运行的操作需提供超时机制

## 进程管理

- 正常退出使用 `process.exit(0)`，错误退出使用 `process.exit(1)`
- 监听 `SIGINT`、`SIGTERM` 信号，进行优雅退出处理
