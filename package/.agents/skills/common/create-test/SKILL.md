---
name: create-test
description: 当需要为功能模块编写单元测试或集成测试时使用本技能。指导按团队规范创建 Vitest 测试文件，涵盖命名约定、断言模式、Mock 策略与覆盖率要求。
compatibility: Assumes a local TypeScript/JavaScript repository with Vitest-compatible tooling and .agents/rules/common testing conventions.
---

# 创建测试

## 使用时机

当出现以下场景时使用本技能：

- 为新增的工具函数、Store 逻辑、数据转换编写**单元测试**
- 为关键用户交互流程编写**组件测试**或**集成测试**
- 重构现有模块后需补充或更新测试用例
- `execute-task` 技能中 TDD 落地编码阶段需要创建测试文件

## 环境依赖

- 默认面向本仓库的 `.agents/rules/common/11-测试规范.md`
- 示例以 Vitest 为主，若项目测试栈不同，需要按项目实际工具调整

## 注意事项

- 不要为了“补覆盖率”去 mock 被测模块内部逻辑
- 测试文件应跟随真实代码落点，不要新造一套平行目录
- 组件测试只在项目已具备对应测试运行条件时再补

---

## 步骤

### 步骤 1：确认测试目标与类型

1. 明确被测模块：工具函数、Store、组件、业务逻辑。
2. 确定测试级别：

| 级别 | 适用对象 | 说明 |
|------|----------|------|
| 单元测试 | 工具函数、纯逻辑、数据转换 | 隔离测试单个函数/模块的输入输出 |
| 组件测试 | UI 组件交互 | 使用 `@testing-library/react` 或 `@vue/test-utils` |
| 集成测试 | 多模块协作流程 | 验证模块间协作的正确性 |

### 步骤 2：创建测试文件

1. 在被测源文件**同目录**下创建测试文件。
2. 文件命名：`<源文件名>.test.ts`（逻辑）或 `<源文件名>.test.tsx`（React 组件）。
3. 导入 Vitest API 与被测模块。

```text
src/utils/
├── formatDate.ts
└── formatDate.test.ts       # 与源文件同目录
```

### 步骤 3：编写测试用例

按 **Arrange-Act-Assert** 模式编写每个测试：

1. **Arrange**：准备测试数据和前置条件。
2. **Act**：调用被测函数或触发被测行为。
3. **Assert**：断言结果符合预期。

```ts
import { describe, it, expect } from 'vitest';
import { formatDate } from './formatDate';

describe('formatDate', () => {
  it('应将时间戳转换为 YYYY-MM-DD 格式', () => {
    const timestamp = 1700000000000;
    const result = formatDate(timestamp);
    expect(result).toBe('2023-11-15');
  });

  it('传入 null 时应返回空字符串', () => {
    expect(formatDate(null)).toBe('');
  });

  it('传入 undefined 时应返回空字符串', () => {
    expect(formatDate(undefined)).toBe('');
  });
});
```

### 步骤 4：补充边界与异常用例

每个被测函数至少覆盖：

- **正常路径**：典型输入的预期输出
- **边界值**：空值、零值、极大/极小值、空数组/空对象
- **异常输入**：类型错误、格式异常、非法参数
- **特殊场景**：并发、超时等（视业务而定）

### 步骤 5：运行测试并确认通过

```bash
npx vitest run <测试文件路径>
```

确认所有用例通过后，再提交代码。

---

## 命名约定

### 文件命名

| 类型 | 命名规则 | 示例 |
|------|----------|------|
| 逻辑/工具测试 | `<name>.test.ts` | `formatDate.test.ts` |
| React 组件测试 | `<name>.test.tsx` | `UserCard.test.tsx` |
| Vue 组件测试 | `<name>.test.ts` | `UserCard.test.ts` |
| 公共 Mock / 辅助 | 放置于 `tests/` 或 `src/__tests__/helpers/` | `tests/mocks/mockUser.ts` |

### 描述命名

- `describe` 块：使用被测模块名称（函数名、组件名、Store 名）
- `it` / `test` 块：使用**中文**描述预期行为，格式为「应……」或「当……时应……」
- 描述表达**预期行为**，而非实现步骤

```ts
describe('useAuthStore', () => {
  it('登录成功后应保存用户信息到 state', () => { /* ... */ });
  it('token 过期时应自动清除登录状态', () => { /* ... */ });
  it('当网络异常时应抛出错误并保持原状态', () => { /* ... */ });
});
```

---

## 测试模式

### 单元测试模式

隔离测试纯函数，不依赖外部环境：

```ts
describe('calculateTotal', () => {
  it('应正确计算商品总价', () => {
    const items = [
      { price: 10, quantity: 2 },
      { price: 20, quantity: 1 },
    ];
    expect(calculateTotal(items)).toBe(40);
  });

  it('空数组应返回 0', () => {
    expect(calculateTotal([])).toBe(0);
  });
});
```

### Mock 策略

遵循原则：**Mock 外部依赖，不 Mock 被测模块内部。**

#### API 请求 Mock

```ts
import { vi } from 'vitest';
import { fetchUser } from './api';

vi.mock('./api', () => ({
  fetchUser: vi.fn(),
}));

describe('UserService', () => {
  it('应正确处理用户数据', async () => {
    vi.mocked(fetchUser).mockResolvedValue({ id: 1, name: '张三' });
    const result = await getUserInfo(1);
    expect(result.name).toBe('张三');
  });

  it('接口异常时应抛出错误', async () => {
    vi.mocked(fetchUser).mockRejectedValue(new Error('网络错误'));
    await expect(getUserInfo(1)).rejects.toThrow('网络错误');
  });
});
```

#### 定时器 Mock

```ts
import { vi, beforeEach, afterEach } from 'vitest';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it('防抖函数应在延迟后执行', () => {
  const fn = vi.fn();
  const debounced = debounce(fn, 300);

  debounced();
  expect(fn).not.toHaveBeenCalled();

  vi.advanceTimersByTime(300);
  expect(fn).toHaveBeenCalledOnce();
});
```

#### 模块 Mock

```ts
vi.mock('@/utils/storage', () => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
}));
```

### 组件测试模式（React）

```tsx
import { render, screen, fireEvent } from '@testing-library/react';

describe('SearchInput', () => {
  it('输入关键词后应触发搜索回调', async () => {
    const onSearch = vi.fn();
    render(<SearchInput onSearch={onSearch} />);

    const input = screen.getByTestId('search-input');
    await fireEvent.change(input, { target: { value: '测试' } });
    await fireEvent.click(screen.getByTestId('search-btn'));

    expect(onSearch).toHaveBeenCalledWith('测试');
  });
});
```

### 组件测试模式（Vue）

```ts
import { mount } from '@vue/test-utils';

describe('SearchInput', () => {
  it('输入关键词后应触发搜索事件', async () => {
    const wrapper = mount(SearchInput);

    await wrapper.find('[data-testid="search-input"]').setValue('测试');
    await wrapper.find('[data-testid="search-btn"]').trigger('click');

    expect(wrapper.emitted('search')?.[0]).toEqual(['测试']);
  });
});
```

---

## 禁止模式

| 禁止项 | 原因 |
|--------|------|
| 测试依赖执行顺序 | 测试应互相独立，可单独运行 |
| 快照测试滥用 | 仅用于关键 UI 结构，禁止对大段 HTML 做快照 |
| 硬编码延时（`setTimeout`） | 使用 `vi.useFakeTimers()` 或 `waitFor` |
| Mock 被测模块内部方法 | 只 Mock 外部依赖 |
| 断言内部状态或私有变量 | 测试行为而非实现 |
| `data-testid` 以外的元素定位 | 禁止依赖 CSS class 或 DOM 结构 |

---

## 检查清单

完成测试编写后，逐条确认以下事项：

- [ ] **文件位置**：测试文件与源文件在同一目录下
- [ ] **文件命名**：遵循 `<name>.test.ts` / `<name>.test.tsx` 命名规则
- [ ] **describe 命名**：使用被测模块名称作为 describe 描述
- [ ] **it 描述**：使用中文描述预期行为（「应……」「当……时应……」）
- [ ] **AAA 模式**：每个测试用例遵循 Arrange-Act-Assert 结构
- [ ] **每个 it 单一职责**：每个 `it` 只验证一个行为点
- [ ] **正常路径覆盖**：典型输入场景已测试
- [ ] **边界值覆盖**：空值、零值、极值等已测试
- [ ] **异常输入覆盖**：非法参数、类型错误等已测试
- [ ] **Mock 合理性**：仅 Mock 外部依赖，未 Mock 被测模块内部
- [ ] **元素定位**：组件测试使用 `data-testid` 定位元素
- [ ] **测试独立性**：每个测试可单独运行，不依赖执行顺序
- [ ] **测试通过**：所有用例通过 `vitest run`
- [ ] **类型检查**：`tsc --noEmit` 无报错

---

## 相关规范

- `.agents/rules/common/11-测试规范.md` — 测试框架选型、文件约定、编写规范与质量门禁
- `.agents/rules/common/02-编码规范.md` — 通用编码规范
- `.agents/rules/common/08-通用约束.md` — 中文描述等通用约束
- `.agents/skills/common/execute-task/SKILL.md` — TDD 落地编码阶段引用本技能
