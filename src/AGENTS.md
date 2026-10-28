# 应用代码

## Overview

这里是 Next.js App Router 应用的主要代码。路由、组件、服务端操作、认证、样式和番茄时钟等功能都在此处协作。

## Key files

| File                       | Owns                                   |
| -------------------------- | -------------------------------------- |
| `src/app/layout.tsx`       | 全局布局、字体、导航、页脚和认证上下文 |
| `src/app/album/_components/catalog.ts` | Album 组件目录、能力元数据、展示模块加载入口与覆盖审计 |
| `src/components/Blog/BlogReading.tsx`、`src/lib/blog/` | Blog 正文目录、阅读进度、滚动根和章节导航 |
| `src/app/api/**/route.ts`  | 登录、注册和查询接口                   |
| `src/db/client.ts`         | 全部业务使用的 PostgreSQL 客户端入口   |
| `src/db/legacy-mysql/client.ts` | 仅连接检查与迁移工具使用的 MariaDB 客户端 |
| `src/db/postgres/**`       | PostgreSQL runtime、配置和探针仓储      |
| `src/db/*Action.ts`        | 带有 `"use server"` 的领域数据操作     |
| `src/lib/auth/userAuth.ts` | 当前用户和角色权限检查                 |
| `src/lib/auth/center/ops.ts` | 独立凭证鉴权、部署身份核验及去敏运行摘要 |
| `src/app/globals.css`      | 唯一全局样式入口、主题 token 和通用工具 |
| `src/providers/PomodoroProvider.tsx` | 登录会话内唯一的番茄钟控制器与共享状态 |

## Conventions

- 页面默认保持服务端组件。需要 Hook、浏览器 API 或事件处理时，才把交互部分拆成客户端组件。
- 数据写操作放在 `src/db`，先校验用户或角色，再调用 Prisma。多个相关写入请使用事务。
- 所有业务模块不得导入 legacy MySQL 客户端或旧生成类型；只有精确允许名单中的迁移基础设施可以使用。
- PostgreSQL 是本地开发的唯一业务数据源，也保存旧账号登录模式、中心映射、浏览器版本、流程和可撤销会话。中心身份通过固定 OIDC 发行者核验，不直连中心数据库。
- HTTP 路由统一使用 `actionResponse` 返回成功或错误响应，并用项目 logger 记录异常。
- Server Action 统一返回 `ActionResult` 判别联合；错误日志使用 `safeErrorContext`，不得记录令牌、密码、正文、完整请求体或数据库内部信息。
- 认证入口统一经过 `src/lib/auth/userAuth.ts` 和 `src/lib/auth/center/`。只有 legacy 用户接受实时版本匹配的 `token` JWT；center 用户只接受本次浏览器的随机会话与在线中心核验。`next-auth` 未接入运行时。
- `APP_ENV=staging` 允许显式配置的固定 HTTPS `FELINE_PUBLIC_ORIGIN`，生产构建仍保留安全 Cookie；正式环境域名限制、严格 Origin 与 CSRF 校验不变，不从请求 Host 推导认证来源。完整用户中心 staging 接入仍需单独配置。
- `/internal/ops/status` 先校验独立 `OPS_STATUS_READ_SECRET`，再读取数据库。仅允许精确路径、无查询参数且无 Origin 的 GET；未授权返回 404，已授权的其他方法返回 405，故障只返回固定 503 结果码，不记录驱动错误原文。
- Vercel 来源地址仅信任合法的 `x-real-ip`，忽略其他转发别名；缺失或非法地址使用共同的未知来源限流桶，不跳过限流。
- 组件统一复用 `src/components/ui` 的基础组件、`NeuSurface` 和 `NeuPanel`，并用 `cn` 合并类名，不要恢复已删除的旧 Neu 组件家族。
- 新增或调整可视组件时同步维护 Album 注册表、对应的安全本地演示和覆盖审计；展示样例不得调用生产 Action、API 或真实用户数据。
- Blog 详情、编辑预览与 Album 展示共用 `src/components/Blog/BlogMarkdown.tsx` 和 `CodeBlock.tsx`；排版、间距及复制与换行控件遵循 [spec 0012](../docs/specs/0012-blog-content-codeblock/index.md)，不要在消费端维护另一套正文或代码块规则。
- Blog 目录和进度共用以 `articleKey` 隔离的 `BlogReading` 实例，仅从实例内的 `.blog-markdown` 收集 H1 至 H6，并按实际滚动根计算正文进度；详情与 Album 复用，Album 传入 `isolated`。接口与边界见 [spec 0013](../docs/specs/0013-blog-toc-reading-progress/index.md)。
- 章节链接保留真实编码 href，窄屏先收起目录再聚焦目标；普通章节导航使用保留原有 `history.state` 的 `replaceState`，前进后退沿用浏览器原生位置并从实际位置重算阅读状态，不缓存位置或重放旧片段。
- 页面未显式指定布局时请复用 `Content`。文档顺序保持主区、右侧操作区、左侧展示区，并由容器查询切换三栏、双栏和单栏布局。
- 番茄时钟状态通过 `src/lib/pomodoro/reducer.ts` 改变；计时和待同步事件按认证用户版本化保存，服务端使用事件标识幂等写入，音效、标题和计时行为通过插件扩展。
- `PomodoroProvider` 在认证布局内创建唯一的 `usePomodoro` 控制器，导航栏与番茄钟页面通过分离的状态、操作和结算 Context 消费它。番茄钟页面继续按固定会话 IANA 时区归档记录，并分别管理所选日期、可见月份和按用户隔离的月份缓存。
- 用户界面主要使用中文，请保持相邻界面的语言一致。

## Gotchas

- Markdown 代码展示与复制共用解析后的同一字符串，直接使用 `CodeBlock` 时保留 `code` 原样；不要 `trim()` 或在 Notion 代码的富文本片段间插入空格。
- 代码区获得焦点时，`Ctrl+A` / `Cmd+A` 仅选择当前 `code` 节点，选区不包含正文、工具栏或其他代码块；代码区之外保留原生全选行为。
- `Content` 与 Blog 目录的窄屏容器查询使用 `width < 1088px`，桌面从 1088px 开始；容器宽度可能是小数，不要改成 `max-width: 1087px` 留下断点间隙。
- 正文根替换时重新绑定滚动和尺寸观察；待执行的章节导航须核对当前正文节点和目标仍存在，同名 slug 不能代表同一正文。替换、目标移除或卸载时取消导航，卸载时清理动画帧、观察器和监听器，并阻止迟到的字体就绪回调继续测量。
- 私有查询和写入必须使用已验证的当前用户 ID，并在资源查询中包含归属条件；生产数据操作不得回退到 `testUserId`。
- 单元和组件测试使用 Vitest 与 Testing Library，真实页面流程使用 Playwright；修改关键流程后请运行相应测试、lint、build 和真实页面检查。
- 需要真实 Supabase staging 的 Playwright 场景使用 `.env.e2e.local` 中的测试账号、唯一数据标记和 `finally` 清理；共享账号与可变数据库记录要求 `workers: 1`，远程写入断言允许 30 秒收敛。

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
