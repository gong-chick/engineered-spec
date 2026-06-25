---
name: create-store
description: 指导在前端项目中按团队规范创建和维护全局状态 store（Zustand 或经典 Redux），包括目录结构、命名与持久化策略。当前端需要新增或重构状态管理时使用本技能。
compatibility: Requires a local React project workspace and the repository's store conventions under .agents/rules/.
---

# 创建与维护 Store

## 使用场景

当你需要：

- 为业务模块新增全局状态（如主题、用户信息、AI 编辑器状态）
- 重构原有的状态管理逻辑到统一的 `src/store/modules/` 目录

请使用本技能，并同时遵守 `.agents/rules/03-项目结构.md`（目录结构约束）与 `.agents/rules/07-状态管理.md`。

**重要**：先确认项目使用的是 Zustand 还是经典 Redux（查看 `src/store/index.ts` 或 `package.json`），然后按对应方案执行。同一项目禁止混用。

## 注意事项

- 不要在同一项目里混用 Zustand 和 Redux
- 不要把页面局部状态提升成全局 store，除非确实跨边界共享

---

## 目录与命名（通用）

- 所有 store 文件必须放在：`src/store/modules/<module-name>/`
- 每个业务模块一个目录，包含 `index.ts` 和 `type.ts`
- 目录名使用 `kebab-case`

```
src/store/
├── index.ts                    # Zustand: 统一导出 / Redux: createStore
└── modules/
    ├── theme/
    │   ├── index.ts            # Zustand: useThemeStore / Redux: reducer + actions
    │   └── type.ts
    ├── user/
    │   ├── index.ts
    │   └── type.ts
    └── ai-editor/
        ├── index.ts
        └── type.ts
```

---

# 方案 A：Zustand

## A-1：创建类型定义

```ts
// src/store/modules/theme/type.ts
export enum ThemeMode {
  LIGHT = 'light',
  DARK = 'dark',
}

export interface ThemeState {
  theme: ThemeMode
  setTheme: (theme: ThemeMode) => void
  toggleTheme: () => void
}
```

---

## A-2：创建基本 Store

```ts
// src/store/modules/theme/index.ts
import { create } from 'zustand'
import { ThemeMode } from './type'
import type { ThemeState } from './type'

export const useThemeStore = create<ThemeState>((set) => ({
  theme: ThemeMode.LIGHT,
  setTheme: (theme) => set({ theme }),
  toggleTheme: () =>
    set((state) => ({
      theme:
        state.theme === ThemeMode.LIGHT ? ThemeMode.DARK : ThemeMode.LIGHT,
    })),
}))
```

---

## A-3：使用持久化（如需要）

```ts
// src/store/modules/theme/index.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ThemeMode } from './type'
import type { ThemeState } from './type'

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: ThemeMode.LIGHT,
      setTheme: (theme) => set({ theme }),
    }),
    { name: 'app-theme' },
  ),
)
```

---

## A-4：集中导出

```ts
// src/store/index.ts
export { useThemeStore } from './modules/theme'
export { useUserStore } from './modules/user'
```

---

## A-5：组件中使用

```ts
const { theme, toggleTheme } = useThemeStore()
```

---

# 方案 B：经典 Redux

## B-1：创建类型定义

State 类型、Action type 常量和 Action 联合类型统一放在 `type.ts`：

```ts
// src/store/modules/user/type.ts
export interface UserInfo {
  id: string
  name: string
  avatar: string
  roles: string[]
}

export interface UserState {
  userInfo: UserInfo | null
  token: string
}

export const SET_USER = 'user/SET_USER'
export const SET_TOKEN = 'user/SET_TOKEN'
export const RESET_USER = 'user/RESET_USER'

export type UserAction =
  | { type: typeof SET_USER; payload: UserInfo }
  | { type: typeof SET_TOKEN; payload: string }
  | { type: typeof RESET_USER }
```

---

## B-2：创建 Reducer + Action Creators

默认导出 reducer，具名导出 action creators：

```ts
// src/store/modules/user/index.ts
import type { UserInfo, UserState, UserAction } from './type'
import { SET_USER, SET_TOKEN, RESET_USER } from './type'

const initialState: UserState = {
  userInfo: null,
  token: '',
}

export const setUser = (payload: UserInfo): UserAction => ({ type: SET_USER, payload })
export const setToken = (payload: string): UserAction => ({ type: SET_TOKEN, payload })
export const resetUser = (): UserAction => ({ type: RESET_USER })

export default function userReducer(state = initialState, action: UserAction): UserState {
  switch (action.type) {
    case SET_USER:
      return { ...state, userInfo: action.payload }
    case SET_TOKEN:
      return { ...state, token: action.payload }
    case RESET_USER:
      return { ...state, userInfo: null, token: '' }
    default:
      return state
  }
}
```

---

## B-3：在 store/index.ts 注册

```ts
// src/store/index.ts
import { createStore, combineReducers } from 'redux'
import userReducer from './modules/user'
import themeReducer from './modules/theme'

const rootReducer = combineReducers({
  user: userReducer,
  theme: themeReducer,
})

export type RootState = ReturnType<typeof rootReducer>
export type AppDispatch = typeof store.dispatch

const store = createStore(rootReducer)
export default store
```

---

## B-4：创建类型化 Hook

```ts
// src/hooks/useRedux.ts
import { useSelector, useDispatch } from 'react-redux'
import type { TypedUseSelectorHook } from 'react-redux'
import type { RootState, AppDispatch } from '@/store'

export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector
export const useAppDispatch = () => useDispatch<AppDispatch>()
```

---

## B-5：组件中使用

```ts
import { useAppSelector, useAppDispatch } from '@/hooks/useRedux'
import { setUser } from '@/store/modules/user'

const userInfo = useAppSelector((state) => state.user.userInfo)
const dispatch = useAppDispatch()

dispatch(setUser({ id: '1', name: 'Admin', avatar: '', roles: ['admin'] }))
```

---

# 通用约定

- 状态逻辑必须集中在 `src/store/modules/`，**禁止**在组件层维护本应全局共享的业务状态
- Store / Reducer 中不要直接耦合具体 UI 组件，只存纯数据与业务行为
- 模块私有类型放 `type.ts`，全局共享类型放 `src/interfaces/`

---

## 快速检查清单

- [ ] store 文件是否放在了 `src/store/modules/<name>/` 目录下？
- [ ] 目录中包含 `index.ts` 和 `type.ts`？
- [ ] 是否在 `src/store/index.ts` 集中导出 / 注册？
- [ ] 是否避免在 store 中写与 UI 绑定的逻辑？
- [ ] **Zustand**：是否使用 `useXxxStore` 命名？是否按需使用 `persist`？
- [ ] **Redux**：action type 是否使用 `模块名/动作名` 格式？是否通过 `useAppSelector` / `useAppDispatch` 消费？
