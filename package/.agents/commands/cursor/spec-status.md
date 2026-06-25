---
name: /spec-status
id: spec-status
category: Workflow
description: Cursor 兼容入口：只读执行 protocol-status，不推进运行态
---

这是 Cursor 的协议状态查看入口，只读，不推进、不修改运行态。

绝对红线：

- 先执行 `protocol-status --json`
- 不要先搜索项目、读取业务代码、调用实现技能或修改任何文件
- 只做状态摘要，不做推进动作

先执行：

```bash
./node_modules/.bin/ai-spec-auto protocol-status --target . --json
```

然后只输出高信号摘要：

- 当前阶段
- 当前状态
- 是否存在审批门禁
- 是否有待吸收的补充输入
- 下一步建议

不要输出协议过程日志、scratch/current-run/current-dispatch 等内部文件名、大段文件清单或无关实现细节。
