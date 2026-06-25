这是协议增量更新入口，不是重新开新任务，也不是直接开始写代码。

绝对红线：

- 优先把当前输入当作“补充需求 / 修正方向 / 归档前修正说明”处理
- 先执行 `protocol-update --json`，不要跳过主代理直接改业务文件
- 不要把当前 change 的产物整份重写；默认只做增量修订

先执行：

```bash
./node_modules/.bin/ai-spec-auto protocol-update --target . --user-input "<当前这条用户原话>" --json
```

然后只按返回的 `turn` 执行：

1. 若 `fast_path.executed = true`，优先消费 fast-path 结果：
   - `archive-approved` / `complete-without-archive`：直接输出最终摘要，不再执行 `protocol-advance`
   - `followup-patch-opened`：说明已打开补丁变更，再按返回的下一个 `turn` 继续
   - `resume-paused-run`：说明已恢复停点，再按返回的下一个 `turn` 继续
2. 若返回 `turn.mode = update-review`，必须先遵守 `turn.guidance.update_contract`
3. 只读取 `turn.reads`，只写 `turn.writes`
4. 若 `change_impact = patch | scope-delta | archive-fix`，默认在同一 `change_id` 内增量更新，不要推倒已有 proposal/specs/design/tasks/checklist/iterations
5. 若 `change_impact = re-scope`，不要强行吞进当前 run；按 `reconcile_strategy` 给出“建议新建 change”的最小结论
6. 若 `change_impact = followup-patch`，这是对已归档变更的补丁修正；继续沿返回的 patch run 推进，不要改旧 archive 目录
7. 若存在 `turn.finalize_contract`，完成当前轮次后按契约推进，不要自行拼命令

对用户只输出：

- 当前识别到的变更类型
- 会不会回退
- 预计增量更新哪些产物
- 下一步是什么

不要输出：

- 大段协议日志
- scratch JSON
- 内部运行态文件名
- “整份重写 proposal/tasks/design/specs” 这类误导性说法
