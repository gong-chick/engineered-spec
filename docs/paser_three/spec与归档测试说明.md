# spec 与归档测试说明

## 1. 当前阶段新增了什么

这一版和前一版相比，当前主链多了两件关键事情：

- `requirement-analyst` 现在必须真实产出 `specs/` 和 `design.md`
- `code-guardian` 完成后不会直接结束，而是先进入 `before-archive`，询问用户是否归档

如果用户同意归档：

- 进入 `archive-change`
- 合并 `openspec/changes/<change-id>/specs/` 到 `openspec/specs/`
- 将当前 change 迁移到 `openspec/changes/archive/YYYY-MM-DD-<change-id>/`

如果用户明确说“先不归档”：

- 当前运行直接结束
- 保留当前 `openspec/changes/<change-id>/` 不迁移

## 2. 测试脚本

优先使用：

```bash
bash ./scripts/setup-cursor-spec-archive-test.sh
```

默认目标目录就是：

```text
/Users/lizhenwei/workspace/test/test-ai-spec/ai-spec-cursor-test
```

## 3. 手工测试步骤

1. 在测试项目里打开 Cursor。
2. 执行：

```text
/spec-start 创建一个商品 mock 页面，只做演示版，数据本地 mock
```

3. 在 requirement 阶段结束后，检查是否生成：

```text
openspec/changes/<change-id>/specs/
openspec/changes/<change-id>/design.md
```

4. 在 code-guardian 完成后，检查是否出现“是否归档”的摘要询问。
5. 输入：

```text
同意归档
```

6. 检查是否出现：

```text
openspec/specs/ui/spec.md
openspec/specs/api/spec.md
openspec/changes/archive/YYYY-MM-DD-<change-id>/
```

## 4. 可选分支

如果你想验证“不归档”分支，再跑一轮并输入：

```text
先不归档
```

预期结果：

- 当前运行结束
- `openspec/changes/<change-id>/` 保留在原处
- 不创建新的 `openspec/changes/archive/` 目录
