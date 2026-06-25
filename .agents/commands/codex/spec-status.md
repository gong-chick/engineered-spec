这是协议状态查看入口，只读，不推进、不修改运行态。

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

不要输出：

- 协议过程日志
- scratch/current-run/current-dispatch/current-execution 等内部文件名
- 大段文件清单
- 无关实现细节
