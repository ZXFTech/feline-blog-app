# 应用代码

## Overview

这里是 Next.js App Router 应用的主要代码。路由、组件、服务端操作、认证、样式和番茄时钟等功能都在此处协作。

## Key files

| File                       | Owns                                   |
| -------------------------- | -------------------------------------- |
| `src/app/layout.tsx`       | 全局布局、字体、导航、页脚和认证上下文 |
| `src/app/api/**/route.ts`  | 登录、注册和查询接口                   |
| `src/db/client.ts`         | Prisma 与 MariaDB 客户端单例           |
| `src/db/*Action.ts`        | 带有 `"use server"` 的领域数据操作     |
| `src/lib/auth/userAuth.ts` | 当前用户和角色权限检查                 |
| `src/styles/index.scss`    | 全局 Sass 入口和主题样式               |

## Conventions

- 页面默认保持服务端组件。需要 Hook、浏览器 API 或事件处理时，才把交互部分拆成客户端组件。
- 数据写操作放在 `src/db`，先校验用户或角色，再调用 Prisma。多个相关写入请使用事务。
- HTTP 路由统一使用 `actionResponse` 返回成功或错误响应，并用项目 logger 记录异常。
- 当前认证流程是自定义 JWT 和名为 `token` 的 HttpOnly Cookie。不要假设已安装的 `next-auth` 已接入运行时。
- 组件同时使用 `src/components/ui` 的生成式基础组件和项目自有 `Neu*` 组件。请先复用现有家族，并用 `cn` 合并类名。
- 页面未显式指定布局时请复用 `Content`。文档顺序保持主区、右侧操作区、左侧展示区，并由容器查询切换三栏、双栏和单栏布局。
- 番茄时钟状态通过 `src/lib/pomodoro/reducer.ts` 改变；计时和待同步事件按认证用户版本化保存，服务端使用事件标识幂等写入，音效、标题和计时行为通过插件扩展。
- 番茄钟页面只创建一个 `usePomodoro` 控制器。按固定会话 IANA 时区归档记录，并将所选日期、可见月份和按用户隔离的月份缓存分开管理。
- 用户界面主要使用中文，请保持相邻界面的语言一致。

## Gotchas

- 部分旧查询会回退到 `testUserId`。新增需要认证的数据访问时，请显式使用当前用户，不要扩大这个回退模式。
- 单元和组件测试使用 Vitest 与 Testing Library，真实页面流程使用 Playwright；修改关键流程后请运行相应测试、lint、build 和真实页面检查。

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
