# Scope: feline-blog-app

这是一个面向公开读者的个人博客，也是你自己的私人效率工作台。读者可以阅读和互动，你可以发布内容，并使用待办、番茄钟和日常记录管理每天的工作。

**Build approach:** Tracer Bullet（每次把一个真实功能从界面、权限、数据到实际使用完整打通）。
**Workflow:** Beta（每次 `/develop` 后运行 `/check verify`，再运行 `/test`）。项目默认采用这个严谨程度。需要真实决策的功能建议先运行 `/architect`，如果你已经知道如何实现，也可以直接进入 `/develop`。单个高风险功能可以提高到 GA。

_这些是帮助你保持开发顺序的建议，不是强制流程。你可以跳过不适合的步骤，并自行决定功能何时算完成。_

## At a glance

| #   | Feature                  | Phase       | Status      |
| --- | ------------------------ | ----------- | ----------- |
| 1   | 站点外壳与视觉体系       | Current     | existing    |
| 2   | 基础账号与文章互动       | Current     | existing    |
| 3   | 公开文章阅读             | Current     | existing    |
| 4   | 作者发布文章             | Current     | existing    |
| 5   | 待办管理                 | Current     | existing    |
| 6   | 番茄钟核心闭环           | Slice 1     | done        |
| 7   | 日常记录核心闭环         | Slice 2     | in-progress |
| 8   | 待办进入专注             | Slice 3     | planned     |
| 9   | 专注结果进入日常总结     | Slice 4     | planned     |
| 10  | 文章发现能力             | Slice 5     | planned     |
| 11  | 账号恢复                 | Slice 6     | planned     |
| 12  | 数据权利与隐私说明       | Slice 7     | planned     |
| 13  | 基础 SEO                 | Slice 8     | planned     |
| 14  | 使用统计与错误监控       | Slice 9     | planned     |
| 15  | NeuDiv 组件代码优化      | Maintenance | done        |
| 16  | Neu 表面与交互契约迁移   | Maintenance | done        |
| 17  | NeuButton 代码逻辑优化   | Maintenance | done        |
| 18  | NeuButton 样式代码审查   | Maintenance | planned     |
| 19  | Commit lint 流程性能优化 | Maintenance | done        |
| 20  | 番茄钟按日布局与历史浏览 | Maintenance | done        |
| 21  | CI、Staging 发布与版本管理 | Maintenance | in-progress |
| 22  | 接口安全与健壮性修复     | Maintenance | done        |
| 23  | 番茄钟全局响应式状态     | Maintenance | done        |
| 24  | newTheme 组件与样式迁移 | Maintenance | done |
| 25  | 确认清单核心闭环         | Slice 10    | in-progress |
| 26  | Album 组件展示中心 | Maintenance | done |
| 27  | 本地 PostgreSQL 开发与迁移隔离 | Maintenance | in-progress |
| 28  | Blog 正文与代码块展示修复 | Blog P1 | done |
| 29  | Blog 阅读操作与可访问性修复 | Blog P1 | planned |
| 30  | Blog 目录与阅读进度修复 | Blog P1 | done |
| 31  | Blog 空状态与错误恢复修复 | Blog P2 | in-progress |
| 32  | Blog 容器间距与窄屏布局修复 | Blog P2 | in-progress |
| 33  | Blog 编辑预览与操作修复 | Blog P2 | planned |

## Current product

### 1. 站点外壳与视觉体系 · existing

提供全局布局、导航、主题、提示消息，以及项目自有组件和基础 UI 组件。页面没有显式指定其他布局时，以 `Content` 组件作为基础布局。
**Done when:** 公开页面共享一致布局和主题，默认使用 `Content`；`leftSideBar` 只放展示类组件，`rightSideBar` 只放操作类组件；主要控件可复用，页面可以在常见桌面浏览器中正常使用。
code in `src/app/layout.tsx`, `src/components/`, `src/styles/`

### 2. 基础账号与文章互动 · existing

读者可以注册、登录和退出，并在登录后点赞或收藏文章。作者权限继续保护内容编辑入口。
**Done when:** 注册用户可以完成登录会话、点赞和收藏，未授权用户不能执行受保护写操作。
code in `src/app/api/auth/`, `src/lib/auth/`, `src/components/Auth/`, `src/db/blogAction.ts`

### 3. 公开文章阅读 · existing

读者可以浏览文章列表，打开 Markdown 文章，并使用目录、代码块和相邻文章导航阅读内容。
**Done when:** 公开读者无需登录即可打开文章列表和详情，文章正文、标签、目录和相邻导航正确显示。
code in `src/app/blog/`, `src/components/Blog/`, `src/components/BlogList/`

### 4. 作者发布文章 · existing

你可以使用 Markdown 编辑器创建和编辑文章，并为文章维护标签。
**Done when:** 有权限的作者可以创建文章、编辑现有文章、保存标签，并在公开详情页看到结果。
code in `src/app/blog/new/`, `src/app/blog/edit/`, `src/components/MarkdownEditor/`, `src/db/blogAction.ts`

### 5. 待办管理 · existing

你可以创建、编辑、完成和软删除带标签的待办，并按状态和内容查看列表。
**Done when:** 你可以维护待办及标签，列表只显示有效记录，并正确反映完成状态和筛选条件。
code in `src/app/todo/`, `src/components/Todo/`, `src/db/todoAction.ts`

## Slice 1: 番茄钟核心闭环

### 6. 番茄钟核心闭环 · done

完成当前正在开发的专注计时器，让一次真实专注从开始、暂停、继续和结束，到历史记录与日历展示完整贯通。（basis: recent git history and current Pomodoro reducer, plugins, actions, and calendar code）
**Done when:** 登录用户可以可靠完成或跳过一次专注，刷新或切换页面不会产生错误状态，结果只记录一次，并在历史和月历中可见。

- [x] Design it (spec): `/architect 番茄钟记录幂等与离线完成`
      spec [0001](../specs/0001-pomodoro-idempotency-offline-completion/index.md)
- [x] Build it: `/develop 番茄钟核心闭环`
  - [x] 打通 Prisma 迁移、幂等写入、完成专注和月历展示，covers `AC-1`, `AC-2`, `AC-6`, `AC-7`, `AC-9`
  - [x] 建立按用户和事件隔离的本地恢复与离线补记，covers `AC-1`, `AC-3`, `AC-7`, `AC-8`
  - [x] 完成自动重试、冲突处理和多标签页一致性，covers `AC-2`, `AC-4`, `AC-5`, `AC-7`
  - [x] 完成历史合并、同步状态和月份时区边界，covers `AC-4`, `AC-5`, `AC-6`, `AC-9`
- [x] Verify it: `/check verify 番茄钟核心闭环`
- [x] Test it: `/test 番茄钟核心闭环`
      code in `src/app/tomato/`, `src/components/pomodoro/`, `src/hooks/usePomodoro.ts`, `src/lib/pomodoro/`, `src/db/tomatoActions.ts`

## Slice 2: 日常记录核心闭环

### 7. 日常记录核心闭环 · in-progress

收口已有的每日与每周记录页面，让步数、打字量和训练数据使用真实输入并稳定保存。（basis: current daily page contains working reads and writes, plus placeholder values and an unfinished management link）
**Done when:** 你可以选择日期，录入真实的每日指标和训练组，刷新后看到正确的当日与每周汇总，空状态和错误状态可理解。

- [ ] Finish it: `/develop 日常记录核心闭环`
      code in `src/app/daily/`, `src/components/DailyStatus/`, `src/db/dailyAction.ts`

## Slice 3: 待办进入专注

### 8. 待办进入专注 · needs a decision

从一个待办开始专注，并让计时记录保留任务关联，使计划和执行形成真实闭环。（basis: Tracer Bullet keeps the task, auth, timer, persistence, and UI path real）
**Done when:** 你可以从待办选择一个任务开始番茄钟，专注期间看到任务信息，完成记录可以追溯到原待办。

- [ ] Design it (spec): `/architect 待办进入专注`

## Slice 4: 专注结果进入日常总结

### 9. 专注结果进入日常总结 · needs a decision

把当天完成的待办和番茄钟结果汇入日常记录，让工作台能够回答今天计划了什么、做了什么。
**Done when:** 每日页面按日期展示完成待办、专注次数和专注时长，统计来自真实记录且不会重复计算。

- [ ] Design it (spec): `/architect 专注结果进入日常总结`

## Slice 5: 文章发现能力

### 10. 文章发现能力 · needs a decision

补齐文章搜索、标签筛选、排序和分页，让公开读者能够稳定找到内容。（basis: the blog page already exposes partial search parameters but does not complete the whole query and URL flow）
**Done when:** 读者可以组合搜索、标签、排序和分页，URL 保留当前条件，结果数量、空状态和翻页边界正确。

- [ ] Design it (spec): `/architect 文章发现能力`

## Slice 6: 账号恢复

### 11. 账号恢复 · needs a decision · GA

为公开注册用户提供安全的密码重置流程，避免账号在忘记密码后永久失去访问能力。此功能提高到 GA，因为它处理认证凭据和账号接管风险。（basis: public registration plus authentication security risk）
**Done when:** 用户可以发起限时重置流程、设置新密码，旧凭据和重复使用的重置凭证失效，过程不会泄露账号是否存在。

- [ ] Design it (spec): `/architect 账号恢复`

## Slice 7: 数据权利与隐私说明

### 12. 数据权利与隐私说明 · needs a decision · GA

说明保存的数据和 Cookie 用途，并让注册用户删除账号及关联个人数据。此功能提高到 GA，因为删除范围和保留规则需要明确。（basis: stored email, interactions, productivity data, and the selected privacy boundary）
**Done when:** 用户可以查看隐私说明、使用条款和 Cookie 说明，并能通过明确确认删除账号，删除或保留的数据符合已记录规则。

- [ ] Design it (spec): `/architect 数据权利与隐私说明`

## Slice 8: 基础 SEO

### 13. 基础 SEO · needs a decision

让公开博客页面具备准确的标题、描述、可索引入口和社交分享预览，同时避免私人效率页面被错误索引。
**Done when:** 首页、文章列表和文章详情具有准确元数据，站点地图和抓取规则覆盖正确页面，分享文章时显示对应标题、描述和图片。

- [ ] Design it (spec): `/architect 基础 SEO`

## Slice 9: 使用统计与错误监控

### 14. 使用统计与错误监控 · needs a decision

用最少的数据了解公开博客访问和私人工具使用是否稳定，并及时发现真实运行错误。（basis: the selected success metric and the current absence of analytics and error monitoring）
**Done when:** 你可以看到核心页面访问和四个正式功能的基本使用情况，服务端与客户端错误可追踪，采集内容与隐私说明一致。

- [ ] Design it (spec): `/architect 使用统计与错误监控`

## Slice 10: 确认清单核心闭环

### 25. 确认清单核心闭环 · in-progress

为日常重要事项提供有必填截止时间的确认清单，让你逐项确认准备内容，减少遗漏。复用已经迁入的清单组件，并把它们接入正式页面、账号数据和真实使用流程。（from spec 0007）
**Done when:** 登录用户可以用固定新增器创建、查看和原子编辑至少包含一个详情项目的清单，项目允许重复内容并以最小边长 `12rem` 的自适应正方形卡片和编辑 Dialog 管理；按截止时间、过期状态、确认状态和规范搜索条件浏览虚拟化结果，在详情页筛选全部、已完成或未完成项目，并即时新增或批量删除当前可见项目；通过详情内容区域逐项确认，并用显式按钮查看只读详情或即时编辑；用户可以确认删除单个或一批清单，在服务端十秒撤销截止前撤销，从清单回收站恢复清单并在所属清单详情 Dialog 恢复项目；正式页面严格复用共享按钮和设计 token，并通过时间边界、未添加内容警告、按钮隔离、节流、键盘、Dialog 焦点、所有权、并发、迁移保护和定时清理验收。

- [x] Design it (spec): `/architect 确认清单核心闭环`
      spec [0011](../specs/0011-checklist-core-loop/index.md)
      related layout spec [0003](../specs/0003-pomodoro-daily-layout/index.md)
- [x] Build it: `/develop 确认清单核心闭环`（AC-33 至 AC-35 已同步，并通过开发阶段自检）
  - [x] 打通 PostgreSQL 模型、用户所有权、创建、未过期列表、详情和项目确认的真实 tracer path，covers `AC-1`, `AC-6`, `AC-15`
  - [x] 补齐前向迁移与约束、载荷指纹幂等、服务端本地时间解析、聚合事务、精确容器布局和共享表单控件，covers `AC-2`, `AC-3`, `AC-4`, `AC-5`, `AC-7`, `AC-16`, `AC-20`, `AC-21`, `AC-22`, `AC-24`, `AC-25`
  - [x] 补齐筛选、规范搜索、签名实时游标、权威时间校准、剩余时间边界、显式详情和即时项目编辑，covers `AC-8`, `AC-9`, `AC-10`, `AC-11`, `AC-16`, `AC-19`, `AC-20`, `AC-26`, `AC-27`
  - [x] 补齐服务端撤销截止、四种恢复 action、结果未知重读、清单与项目回收站和原子批量操作，covers `AC-12`, `AC-13`, `AC-14`, `AC-16`, `AC-23`
  - [x] 补齐受保护的 60 秒 Cron、级联计数、迁移预检、reset 允许名单、数据库权限和完整验证覆盖，covers `AC-17`, `AC-18`
  - [x] 完成早期固定 `gap-3`、最小边长 `12rem` 的自适应正方形网格与容量边界验证；当前尺寸及排序以 spec 0011 修订后的最大 `12.5rem`、整体居中和新增置顶为准，早期无上限铺满结果不作为当前验收证据，covers spec 0011 `AC-5`, `AC-19`, `AC-21`, `AC-25`
  - [x] 详情页按批量模式显示卡片编辑和删除，表单保持常显；替换状态图标并同步 Album，covers `AC-28`, `AC-29`
  - [x] 添加按钮独立右对齐一行、fieldset 内横排且各组纵排，落实 default 内边距、剩余高度及已确认的短屏表单内部滚动例外，covers `AC-30`, `AC-32`
  - [x] 主题化小时／分钟选择框，完成嵌套浮层焦点、短屏可达性、真实保存刷新与时区回归，covers `AC-7`, `AC-31`, `AC-32`
  - [x] 补齐详情筛选生命周期、有效完成状态、筛选移出后的焦点恢复、即时新增幂等契约和当前筛选项目批量删除撤销，covers `AC-33`, `AC-34`, `AC-35`
      code in `prisma/postgres/`, `src/app/globals.css`, `src/app/blog/`, `src/app/checklists/`, `src/app/api/checklists/`, `src/app/api/cron/checklists/`, `src/app/tag/`, `src/app/todo/`, `src/components/Content/`, `src/components/Checklist/`, `src/db/checklistAction.ts`, `src/lib/checklists/`, `src/types/checklist.ts`
- [ ] Verify it: `/check verify 确认清单核心闭环`
- [ ] Test it: `/test 确认清单核心闭环`

## Maintenance

### 15. NeuDiv 组件代码优化 · done

整理 NeuDiv 的实现和类型表达，只在组件本身及确有必要的引用文件中改善可读性与可维护性，不扩大修改范围。
**Done when:** NeuDiv 的样式、属性接口和运行行为保持不变，相关引用继续通过类型检查、lint、构建和测试。

- [x] Build it: `/develop NeuDiv 组件代码优化`
      code in `src/components/NeuDiv/index.tsx`

### 16. Neu 表面与交互契约迁移 · done

将新拟态表面样式与 HTML 交互语义分开，收紧 NeuDiv、WeeklyView、Tag 和相关引用的类型与使用方式。
**Done when:** 所有生产引用遵守 spec 0002，除已批准的 Pomodoro 历史卡片改为平面显示外，现有视觉保持不变，类型检查、lint、构建、组件测试和相关页面验证通过。

- [x] Design it (spec): `/architect NeuDiv 表面语义与交互契约`
      spec [0002](../specs/0002-neu-surface-interaction-contract/index.md)
- [x] Build it: `/develop Neu 表面与交互契约迁移`
      code in `src/components/NeuDiv/`, `src/components/Tag/`, `src/components/DailyStatus/WeeklyView.tsx`, `src/components/Navbar/index.tsx`, `src/components/BlogList/ListItem.tsx`, `src/components/pomodoro/PomodoroList.tsx`
- [x] Verify it: `/check verify Neu 表面与交互契约迁移`
- [x] Test it: `/test Neu 表面与交互契约迁移`

### 17. NeuButton 代码逻辑优化 · done

整理 NeuButton 的实现和类型表达，删除未实现的公开属性，修正链接变体的类型与 HTML 语义，不修改任何样式。
**Done when:** 未实现且未使用的 `themeColorHex` 已删除；链接变体必须提供 `href` 并直接渲染为链接，按钮变体继续渲染为按钮；现有样式和有效调用行为保持不变，相关引用继续通过类型检查、lint、构建和测试。

- [x] Build it: `/develop NeuButton 代码逻辑优化`
      code in `src/components/NeuButton/`, `src/types/neu.ts`
- [x] Verify it: `/check verify NeuButton 代码逻辑优化`
- [x] Test it: `/test NeuButton 代码逻辑优化`

### 18. NeuButton 样式代码审查 · done

整理 NeuButton 样式相关文件，删除重复 Sass 变量、死代码和无效 mixin 抽象层，不修改视觉风格。
**Done when:** 样式代码结构清晰、无冗余 Sass 规则或死代码、mixin 使用合理、lint 和构建通过。

- [x] Build it: `/develop NeuButton 样式代码审查`
      code in `src/components/NeuButton/_style.scss`, `src/styles/_mixin.scss`, `src/styles/_variables.scss`
- [x] Verify it: `/check verify NeuButton 样式代码审查`

### 19. Commit lint 流程性能优化 · done

优化 pre-commit 和 pre-push hooks 的性能，包括 ESLint 缓存、Prettier 配置化、fetch 深度限制和 build 触发条件精确化。
**Done when:** lint-staged 使用缓存加速，Prettier 有明确配置，pre-push 减少不必要的网络和构建操作。

- [x] Build it: `/develop Commit lint 流程性能优化`
      code in `lint-staged.config.mjs`, `prettier.config.mjs`, `.husky/pre-push`

### 20. 番茄钟按日布局与历史浏览 · done

调整番茄钟页面的信息层级。计时组件居中显示，左侧栏独立滚动并展示所选日期当天的历史记录，右侧栏使用日历控制当前日期。
**Done when:** 页面默认选择本地时区的今天；日历位于 `rightSideBar`，点击日期可以切换所选日，并提供带 `CalendarDays` 图标和文字的”回到今天”按钮；历史记录位于 `leftSideBar` 并独立滚动，只展示所选日期从 00:00 到 23:59 的记录；番茄钟组件在主内容区域居中显示。

- [x] Design it (spec): `/architect 番茄钟按日布局与历史浏览`
      spec [0003](../specs/0003-pomodoro-daily-layout/index.md)
- [x] Build it: `/develop 番茄钟按日布局与历史浏览`
  - [x] 打通单一控制器、受控日期、按月读取和按日历史，covers `AC-4`, `AC-6`, `AC-9`, `AC-10`
  - [x] 完成 `Content` 全局自适应布局与现有页面回归，covers `AC-1`, `AC-2`, `AC-3`, `AC-13`
  - [x] 完成日历、日期状态、动态今天和月份竞态保护，covers `AC-4`, `AC-5`, `AC-7`, `AC-8`, `AC-9`, `AC-12`
  - [x] 完成历史状态、同步结算、冲突操作和无障碍反馈，covers `AC-6`, `AC-7`, `AC-9`, `AC-10`, `AC-11`, `AC-12`
        code in `src/app/tomato/`, `src/components/Calendar/`, `src/components/Content/`, `src/components/pomodoro/`, `src/hooks/usePomodoro.ts`, `src/lib/pomodoro/`
- [x] Verify it: `/check verify 番茄钟按日布局与历史浏览`
- [x] Test it: `/test 番茄钟按日布局与历史浏览`

### 21. CI、Staging 发布与版本管理 · in-progress

建立可重复的持续集成、隔离的 staging 发布流程和可追踪的版本管理，让每次候选版本先通过完整质量检查，再安全发布到已指定的 staging 资源。
**Done when:** 拉取请求和主分支变更执行一致的质量检查；通过检查的候选版本按受控顺序完成 staging 数据库迁移和应用发布；版本、changelog、提交、标签与部署记录可以相互追踪；失败不会留下无法识别的半发布状态，并有明确的重试或回滚入口。

- [x] Revise design (spec): `/architect CI、Staging 发布与版本管理`
      spec [0010](../specs/0010-ci-staging-release-version/index.md)
- [ ] Build it: `/develop CI、Staging 发布与版本管理`
      code in `.github/workflows/`, `scripts/ci/`, `src/app/api/v1/staging-smoke/`, `e2e/staging-smoke.spec.ts`, `playwright.staging.config.ts`, `release-please-config.json`
  - [x] 将 staging migrator 切换到精确 allowlist 的 Supavisor Session Pooler，补齐 node-postgres、Prisma、双连接和锁丢失验证，covers `AC-5`, `AC-12`, `AC-13`, `AC-15`
  - [x] 打通无秘密 PR 验证、迁移重放与对账、候选部署、公开 smoke、提升和执行记录，covers `AC-1`, `AC-3` 到 `AC-6`, `AC-8`, `AC-10`, `AC-14`
  - [x] 完成 migration 安全检查、分支保护、权限、并发、当前 HEAD 重跑、超时与安全恢复，covers `AC-2` 到 `AC-5`, `AC-9`, `AC-12`, `AC-13`
  - [x] 完成真实登录和 Todo smoke、限定范围的数据清理、稳定别名提升与恢复，covers `AC-7`, `AC-8`, `AC-10`, `AC-13`
  - [ ] 接入 Release Please、短期 GitHub App token 和精确 SHA 发版，covers `AC-2`, `AC-10` 到 `AC-13`
- [ ] Verify it: `/check verify CI、Staging 发布与版本管理`
- [ ] Test it: `/test CI、Staging 发布与版本管理`

### 22. 接口安全与健壮性修复 · done

修复接口审查发现的敏感字段暴露、写操作鉴权缺口、用户数据范围不一致、错误分类不准确，以及事务、幂等、参数校验和稳定查询方面的缺陷，同时保持现有产品行为与界面流程。
**Done when:** 公开接口只返回允许字段，所有写操作具有正确的认证和资源归属校验，列表与统计遵守一致的数据范围，输入错误与临时故障能够正确区分，相关多步骤写入保持原子性，重复请求不会产生错误计数或重复数据，并由回归测试覆盖关键边界。

- [x] Design it (spec): `/architect 接口安全与健壮性修复`
      spec [0005](../specs/0005-api-safety-contract/index.md)
- [x] Build it: `/develop 接口安全与健壮性修复`
      code in `src/lib/server/`, `src/lib/auth/userAuth.ts`, `src/db/`, `src/app/api/`
  - [x] 建立统一结果、校验、错误映射、字段白名单、公开投影和脱敏日志，并打通注册、公开文章和 ROOT 私有读取，covers `AC-1`, `AC-2`, `AC-4` 到 `AC-8`, `AC-13` 到 `AC-16`
  - [x] 将 Blog、Todo、Tag、Daily 和 Prompt 迁移到当前用户范围、资源归属和兼容成功响应，covers `AC-2` 到 `AC-5`, `AC-11`, `AC-12`, `AC-15`
  - [x] 收口标签事务、互动计数、软删除和番茄同步的幂等与并发行为，covers `AC-9`, `AC-10`, `AC-13`
  - [x] 补齐接口与数据边界测试，并通过 lint、build、Vitest 和受影响的认证页面流程，covers `AC-1` 到 `AC-16`
- [x] Verify it: `/check verify 接口安全与健壮性修复`
- [x] Test it: `/test 接口安全与健壮性修复`

### 23. 番茄钟全局响应式状态 · done

将番茄钟控制器提升为登录会话中的全局唯一状态源，让用户切换站内页面后仍能持续计时、自动结算和同步，并让其他页面实时显示同一状态。
**Done when:** 登录用户在任意站内页面看到同一份番茄钟状态，导航不会中断计时或产生第二个控制器，到期后继续自动写入或进入离线队列；现有开始、暂停、继续、停止、跳过、设置、音效、标题、恢复、用户隔离、幂等、冲突、多标签页同步、历史和日历功能保持可用。

- [x] Design it (spec): `/architect 番茄钟全局响应式状态`
      spec [0006](../specs/0006-pomodoro-global-state/index.md)
- [x] Build it: `/develop 番茄钟全局响应式状态`
  - [x] 建立全局唯一 Provider、分离的强类型 Context、恢复门槛和共享导航状态，covers `AC-1` 到 `AC-5`
  - [x] 收口用户会话代次、退出与切换隔离、有效转换持久化和普通 tick 内存更新，covers `AC-2`, `AC-6`, `AC-11`, `AC-12`
  - [x] 接通任意页面自动结算、声音、Toast、页面标题和无重放 settlement 订阅，covers `AC-7`, `AC-8`, `AC-10`, `AC-12`
  - [x] 完成导航响应式与错误状态，并覆盖 Provider、路由、离线、多标签页和现有页面回归，covers `AC-3`, `AC-4`, `AC-9`, `AC-12`, `AC-13`
      code in `src/app/layout.tsx`, `src/providers/PomodoroProvider.tsx`, `src/components/Navbar/`, `src/components/pomodoro/`, `src/hooks/usePomodoro.ts`
- [x] Verify it: `/check verify 番茄钟全局响应式状态`
- [x] Test it: `/test 番茄钟全局响应式状态`

### 24. newTheme 组件与样式迁移 · done

把 `newTheme` 中的主题、视觉 token、基础组件和清单组件迁入现有应用，并逐步替换所有旧调用。现有页面保持完整功能，但允许视觉和布局采用新体系后的结果。
**Done when:** 正式页面只使用迁入后的组件和唯一全局样式入口；点击、键盘、链接、加载、禁用、表单、错误反馈、主题和响应式能力保持可用；旧组件、旧专用样式和 `newTheme` 文件夹删除；Showcase 页面留待后续评估。
code in `src/app/globals.css`, `src/components/ui/`, `src/components/Checklist/`, `src/components/PomodoroCalendar/`, `src/components/theme-provider.tsx`

- [x] Design it (spec): `/architect newTheme 组件与样式迁移`
      spec [0007](../specs/0007-new-theme-migration/index.md)
- [x] Build it: `/develop newTheme 组件与样式迁移`
  - [x] 升级依赖，启用唯一 `globals.css` 与新主题，并用临时 token 映射承接旧页面，covers `AC-1`, `AC-2`, `AC-4`, `AC-5`
  - [x] 迁移全站基础组件、链接、输入族和页面调用，逐簇保持功能回归，covers `AC-5`, `AC-6`, `AC-10`, `AC-11`
  - [x] 迁入通用 Calendar、清单组件和可访问 Dialog，不引入 Showcase 页面，covers `AC-7`, `AC-8`, `AC-9`
  - [x] 清理临时 token、reboot 与无用样式，改名 PomodoroCalendar 并收口主题与响应式验证，covers `AC-2`, `AC-3`, `AC-7`, `AC-10`, `AC-13`
  - [x] 删除旧组件与 `newTheme` 文件夹，完成全量静态检查、构建和组件测试；真实浏览器矩阵由 `/check verify` 接续，covers `AC-1`, `AC-11`, `AC-12`, `AC-13`, `AC-14`
- [x] Verify it: `/check verify newTheme 组件与样式迁移`
- [x] Test it: `/test newTheme 组件与样式迁移`

### 26. Album 组件展示中心 · done

将 `album` 升级为项目组件的可浏览展示中心，让开发和设计时可以集中查看现有组件的用途、变体和关键状态。
**Done when:** 左侧导航按功能分类列出项目现有的基础控件、复合控件和业务组件；选择组件后，主内容区展示简要说明、默认形态、支持的尺寸、四套主题及其可用的交互和语义状态，并且导航与展示内容能随项目组件持续扩展。

- [x] Design it (spec): `/architect Album 组件展示中心`
      spec [0008](../specs/0008-album-component-showcase/index.md)
- [x] Build it: `/develop Album 组件展示中心`
      code [page](../../src/app/album/page.tsx) · [catalog](../../src/app/album/_components/catalog.ts) · [tests](../../e2e/album-showcase.spec.ts)
  - [x] 打通 Button、类型注册表、分类导航、搜索、URL、四主题和共享展示契约，covers `AC-1` 到 `AC-9`、`AC-11` 到 `AC-13`
  - [x] 按功能分类接入基础与复合组件，建立稳定场景、覆盖审计和目录完整性保护，covers `AC-3`、`AC-4`、`AC-6` 到 `AC-10`
  - [x] 使用本地沙箱与最小内存适配器接入业务组件，标注安全的待接入缺口，covers `AC-1`、`AC-9`、`AC-10`、`AC-12`、`AC-15`
  - [x] 补齐组件测试与宽窄屏、键盘、历史、主题、浮层和错误恢复的 Playwright 验证，covers `AC-2`、`AC-5`、`AC-7`、`AC-8`、`AC-11`、`AC-13` 到 `AC-15`
- [x] Verify it: `/check verify Album 组件展示中心`
- [x] Test it: `/test Album 组件展示中心`

### 27. 本地 PostgreSQL 开发与迁移隔离 · in-progress

把本地开发、Prisma 迁移校验和 Supabase staging 的连接配置分开，让日常开发和可清空重建的校验操作不再触碰远程 staging 数据。
**Done when:** 本地开发默认使用 `feline_blog_dev`，Prisma `migrate dev` 只使用 `feline_blog_shadow` 作为 shadow，允许清空重建的迁移重放只使用 `feline_blog_verify`；本地应用、迁移隔离和 Supabase staging 分别从 `.env.development`、`.env.shadow` 和 `.env.staging` 读取配置，并且命令与保护检查可以证明三类环境不会误连或混用。

- [x] Design it (spec): `/architect 本地 PostgreSQL 开发与迁移隔离`
      spec [0009](../specs/0009-local-postgres-isolation/index.md)
- [x] Build it: `/develop 本地 PostgreSQL 开发与迁移隔离`
      code in `compose.local-postgres.yaml`, `config/database-*.json`, `scripts/database/local-postgres/`, `src/db/postgres/config.ts`, `package.json`, `docs/database/`
  - [x] 建立本地 Compose、角色权限、环境加载和本地 runtime，covers `AC-1`, `AC-2`, `AC-8`, `AC-10`
  - [x] 隔离 Prisma dev、shadow 与 verify 迁移流程，covers `AC-3`
  - [x] 实现 staging exporter、同快照导出和受验证恢复，covers `AC-4`, `AC-5`, `AC-7`, `AC-8`
  - [x] 实现连接围栏、持久恢复状态机和 staging deploy 保护，covers `AC-4`, `AC-6`, `AC-7`, `AC-8`
  - [x] 完成本地生命周期、旧命令映射、文档和测试，covers `AC-9`, `AC-10`, `AC-11`, `AC-12`
- [x] Verify it: `/check verify 本地 PostgreSQL 开发与迁移隔离`
- [x] Test it: `/test 本地 PostgreSQL 开发与迁移隔离`

## Blog 修复 P1：阅读核心体验

本轮按 2026-10-20 的设计审查规划已有 Blog 功能的修复。建议先完成 P1，再推进 P2，同一优先级按条目顺序执行。继续沿用项目的 Tracer Bullet 和 Beta 流程，每项都以真实页面及其内容组件可用为交付边界。

前次审查只完成源码检查。当前已准备项目锁定版本的依赖、安全本地 Docker PostgreSQL 与测试账号，并完成条目 28 的开发自检；正式逐项验收仍待执行。目录在窄屏下的进度更新、长标题、多标签及阴影裁剪继续按所属条目验证。各项验收覆盖 light、dark、sugar、warm、桌面与窄屏、键盘和减少动态效果偏好；组件展示使用安全本地样例，实际读写流程使用测试账号。

修复以当前设计规范和共享组件为边界，内容容器默认内边距与显式例外保持可审查。共享组件若确需调整，建议验证其他调用页面。文章发现能力和基础 SEO 仍分别由条目 10、13 承接，本轮不扩展数据库、认证或全站重设计，也不将 Blog 的基础可访问性和窄屏修复等同于全站移动端或 WCAG 认证。

### 28. Blog 正文与代码块展示修复 · done

先恢复文章阅读所需的排版层级和代码展示，让同一篇文章在四主题下都有一致且清晰的阅读体验。已确定紧凑阅读密度、四主题克制语法配色、逐块换行开关，以及详情和预览共享的展示规则，最终参数见 spec 0012 的排版表与验收清单。
**Done when:** 文章标题、各级标题、段落、列表、引用、链接、表格、图片和行内代码具有清晰的层级与留白；有、无语言标记的代码块均按一致规则展示且可复制原始内容，不出现 `test` 占位标题；正文与代码区域遵守现有主题和字体规范，并形成编辑预览可以复用的展示规则。

- [x] Design it (spec): `/architect Blog 正文与代码块展示修复`
      spec [0012](../specs/0012-blog-content-codeblock/index.md)（2026-10-20 已确认，经另一模型只读复核）
- [x] Build it: `/develop Blog 正文与代码块展示修复`
      code in `src/components/Blog/`, `src/components/CopyButton/`, `src/components/MarkdownEditor/`, `src/components/NotionBlock/`, `src/app/blog/[id]/page.tsx`, `src/app/globals.css`, `src/app/album/_components/`, `e2e/blog-markdown.spec.ts`, `e2e/blog-author-rendering.spec.ts`（桌面、手机、四主题及本地作者闭环自检通过；4 篇既有文章共 34 个代码块验证通过，按用户要求保留本地导入副本；控件沿用共享 Button 图标默认尺寸，复制成功显示勾选并于 1 秒后恢复；正文字号 .9rem、行高 1.5、块间距 .25rem，标题下方 8px、上方 12px；代码行高 1.4，内部间距 .25rem、按钮间距 .5rem、上下 margin 各 .5rem，语言使用 Tag，容器阴影 inset-sm；外链图片下载未验证）
  - [x] 打通真实文章到共享正文的服务端阅读路径，保留标题锚点与业务边界，covers `AC-1`、`AC-2`、`AC-3`、`AC-10`、`AC-11`
  - [x] 完成代码语言回退、空白保持、逻辑行号、逐块换行和复制结果隔离，covers `AC-3`、`AC-4`、`AC-5`、`AC-7`、`AC-8`
  - [x] 完成正文排版、四主题语法色、局部溢出及代码控件可访问性，covers `AC-1`、`AC-6`、`AC-7`、`AC-9`、`AC-10`
  - [x] 接入现有编辑预览、兼容代码块导出和安全 Album 场景，补齐相应回归覆盖，covers `AC-2`、`AC-3`、`AC-10`、`AC-11`、`AC-12`、`AC-13`
- [x] Verify it: `/check verify Blog 正文与代码块展示修复`
- [x] Test it: `/test Blog 正文与代码块展示修复`
      2026-10-21：补齐 9 项组件回归和 1 个浏览器场景，测试按 spec 0012 的 AC 标注。全量 Vitest 105 文件、565 项通过；桌面 Chrome 与手机 WebKit 共 10 项浏览器回归通过（新增场景修正按钮定位后定向复跑 2 项通过）；类型、测试文件 ESLint、格式和数据库依赖边界检查通过。四篇本地导入文章及标签只读核对通过，文章页 HTTP 200；视觉判断与外链图片可用性仍按既有 verify 记录区分。

### 29. Blog 阅读操作与可访问性修复 · needs a decision

让读者能理解并通过触控、键盘和辅助技术使用搜索、复制、互动及相邻文章导航。控件沿用共享 Button 默认尺寸与内边距，分享入口的实际行为仍需确认。
**Done when:** 阅读控件沿用共享组件的尺寸与内边距，不额外要求 44×44 点击区域，搜索、复制、点赞、收藏和分享具有明确中文名称及可见焦点；互动状态不只依赖颜色，并有提交中与结果反馈；导航保持链接语义，标签列表语义正确；分享入口按已确认的行为提供真实结果，未实现的操作不再表现为可用功能。

- [ ] Design it (spec): `/architect Blog 阅读操作与可访问性修复`

### 30. Blog 目录与阅读进度修复 · done

让目录和阅读进度与正文使用同一主题，并在桌面及窄屏的实际滚动方式下反映阅读位置。进度仅计算 Markdown 正文，短文隐藏进度条；目录收录正文 H1 至 H6，桌面保留右栏，窄屏在正文前默认收起。
**Done when:** 目录文字、选中项、边框和进度使用现有主题语义；点击目录能到达对应标题，当前章节和进度随实际阅读位置更新，切换文章不残留旧状态；无标题或无需滚动的文章状态合理，键盘和减少动态效果偏好可用；窄屏进度问题经实际复现后修复或记录排除依据。

- [x] Design it (spec): `/architect Blog 目录与阅读进度修复`
      spec [0013](../specs/0013-blog-toc-reading-progress/index.md)（2026-10-21 已确认，经另一模型只读复核；历史恢复缺口已按用户选择明确为沿用原生位置，未恢复时从文章顶部重算，不新增位置缓存）
- [x] Build it: `/develop Blog 目录与阅读进度修复`
      code in `src/components/Blog/BlogReading.tsx`, `src/components/Blog/TOC.tsx`, `src/lib/blog/`, `src/app/blog/[id]/page.tsx`, `src/app/layout.tsx`, `src/components/ui/progress-bar.tsx`, `src/app/globals.css`, `src/app/album/_components/demos/BlogReadingDemo.tsx`, `src/app/album/_components/catalog.ts`, `e2e/blog-reading.spec.ts`
  - [x] 打通真实文章的统一目录、正文进度、桌面主题与章节跳转，记录窄屏旧行为的复现或排除依据，covers `AC-1`、`AC-3`、`AC-4`、`AC-5`、`AC-8`、`AC-9`、`AC-10`
  - [x] 完成窄屏折叠目录、当前章节摘要、选中后收起和目标焦点及跨断点重绑定，covers `AC-2`、`AC-4`、`AC-5`、`AC-8`
  - [x] 补齐正文动态高度、文章切换、原生历史恢复边界、片段兼容及空白和短文状态，covers `AC-1`、`AC-3`、`AC-5`、`AC-6`、`AC-7`
  - [x] 接入安全 Album 与覆盖审计，完成组件回归和真实文章的四主题、桌面、手机、键盘及减少动态效果验证，covers `AC-1` 至 `AC-10`
      2026-10-21：真实文章复现窄屏 window 滚动后旧进度停滞；统一正文阅读实例并修复客户端后退的旧片段重复定位。lint、typecheck、build、108 文件 573 项 Vitest 及数据库边界通过；桌面 Chrome 与手机 WebKit 的 Blog 和 Album 相关回归 39 项通过、1 项按既有移动端键盘策略跳过，其中本次阅读场景 10 项通过。验收步骤与范围边界见 [verify](../specs/0013-blog-toc-reading-progress/verify.md)。
- [x] Verify it: `/check verify Blog 目录与阅读进度修复`
- [x] Test it: `/test Blog 目录与阅读进度修复`

## Blog 修复 P2：状态、布局与作者体验

### 31. Blog 空状态与错误恢复修复 · in-progress

补齐列表、文章详情和相邻文章导航的加载、空状态与失败反馈，让读者能区分没有内容、文章不存在和暂时读取失败。已确定文字 404、保留当前条件的手动重试、清除搜索保留排序、空正文提示，以及整个 `/blog` 的中文加载与错误兜底，具体契约见 spec 0014。
**Done when:** 列表具有可识别的页面标题与结果上下文，空列表和搜索无结果给出不同且可操作的提示；文章不存在与读取失败分别呈现明确状态和恢复入口；相邻文章加载失败不会显示为已经到达首尾；各状态保留稳定布局，反馈可被辅助技术感知。

- [x] Design it (spec): `/architect Blog 空状态与错误恢复修复`
      spec [0014](../specs/0014-blog-empty-error-recovery/index.md)（2026-10-22 已确认，2026-10-23 导航与焦点约定原位同步并再次确认，均经另一模型只读复核；保留流式缺页与未保存草稿的既定边界，排序时同时提交当前搜索输入）
- [ ] Build it: `/develop Blog 空状态与错误恢复修复`
      code in `src/app/blog/`、`src/components/Blog/`、`src/components/BlogList/BlogListOperationBar.tsx`、`src/app/album/_components/demos/BlogStatusDemo.tsx`、`e2e/blog-status.spec.ts`（2026-10-23 标准 Turbopack 构建、完整 Vitest 与 Blog 专项已有通过记录，见 `.feline-blog/debug-0014-boundaries/report.md`；你已确认在 Vercel 添加 staging 配置，完整 E2E 尚待按实际运行环境复验）
  - [x] 打通真实列表的结果上下文、空态、保留条件的失败重试，以及搜索清除和排序合并提交，covers `AC-1`、`AC-2`、`AC-3`、`AC-7`、`AC-11`
  - [x] 完成详情文字 404、重新检查、临时失败恢复与空正文提示，保留正文与阅读辅助契约，covers `AC-3`、`AC-4`、`AC-5`、`AC-7`、`AC-11`
  - [x] 完成相邻导航局部恢复、正确边界与请求隔离，接入整个 Blog 的中文加载及崩溃兜底并回归作者路径，covers `AC-6`、`AC-7`、`AC-8`、`AC-11`
  - [ ] 接入安全 Album 与来源审计，完成四主题、宽窄屏、键盘和真实故障恢复验收及自动化检查，covers `AC-1` 至 `AC-12`
- [ ] Verify it: `/check verify Blog 空状态与错误恢复修复`
- [x] Test it: `/test Blog 空状态与错误恢复修复`

### 32. Blog 容器间距与窄屏布局修复 · in-progress

在条目 28 至 31 的内容和状态确定后，收口列表、正文、目录及阅读工具栏的留白与溢出边界。按现有设计规范修复，不扩大为全站容器迁移。
**Done when:** 内容容器使用默认内边距或在调用处显式指定例外，面板内部与相邻面板间距职责清晰；滚动边界不裁切内部阴影，滚动可用且默认隐藏原生滚动条；桌面和窄屏下的长标题、多标签、长代码及宽表格可阅读，局部溢出不撑宽整页，关键控件始终可达；待复现的布局问题均有实际观察依据。

- [x] Design it (spec): `/architect Blog 容器间距与窄屏布局修复`
      spec [0015](../specs/0015-blog-container-narrow-layout.md)（2026-10-23 已确认，经另一模型只读复核；从 320 CSS 像素开始，保留 default 内边距，标题与标签完整换行，操作区换行或堆叠）
- [ ] Build it: `/develop Blog 容器间距与窄屏布局修复`
  - [ ] 记录真实页面基线，打通列表到详情的首条修复路径，covers `AC-1`、`AC-2`、`AC-3`、`AC-4`、`AC-9`
  - [ ] 收口正文、目录、阅读操作和相邻导航的间距、滚动及断点边界，covers `AC-2`、`AC-3`、`AC-4`、`AC-5`、`AC-6`、`AC-7`
  - [ ] 完成状态界面、安全 Album 展示、共享影响检查与四主题回归证据，covers `AC-1`、`AC-4`、`AC-6`、`AC-8`、`AC-9`、`AC-10`
- [ ] Verify it: `/check verify Blog 容器间距与窄屏布局修复`
- [ ] Test it: `/test Blog 容器间距与窄屏布局修复`

### 33. Blog 编辑预览与操作修复 · needs a decision

在条目 28 的正文展示规则确定后，让作者预览与发布结果一致，并收口编辑器中含义不清或没有实际行为的操作。需要先明确保存与提交的区别及反馈。
**Done when:** 编辑预览与公开详情使用一致的正文和代码展示规则；退出编辑保持单一导航语义；保存和提交按已确认的含义真实生效，未实现操作不伪装为可用；提交期间防止重复操作，失败后能继续编辑并重试；窄屏及全屏下输入、预览和操作均可达，作者保存后能在公开详情看到一致结果。

- [ ] Design it (spec): `/architect Blog 编辑预览与操作修复`

## Deferred

当前开发轮次不包含这些能力，保留在这里避免它们悄悄扩大主线。

- **国际化结构**: 当前界面继续使用简体中文，等正式功能稳定后再为多语言保留结构
- **直接上传和管理图片**: 文章暂时继续使用外部图片链接
- **评论和公开用户资料**: 普通用户当前只点赞和收藏
- **完整移动端与 WCAG 2.2 AA**: 当前只保证常见桌面浏览器可用
- **实验页面产品化**: `formatter` 和 `playground` 暂不进入正式产品范围
- **InputField 尺寸契约修复**: 让 `fieldSize` 真正传递到内部输入组件（from spec 0008）
- **Icon 主题颜色契约**: 评估并收口硬编码颜色与四主题语义 token 的偏移（from spec 0008）
- **全站字体设计基线对齐**: 独立核对 `design.md` 字体名称与现行字体 token 的差异；Blog 本轮沿用现行 token，不引入字体下载（from spec 0012）
- **Blog 相关文章推荐**: 暂缓缺页推荐，后续先确定关联信息来源与排序规则，或明确选择标为“最新文章”的模块（from spec 0014）
- **商业化**: 广告、赞助、会员和付费内容暂不规划

## References

### Project sources

- `AGENTS.md`: 当前技术栈、命令和项目级约定
- `src/AGENTS.md`: App Router、认证、服务端操作和番茄钟边界
- `package.json`: 运行命令和主要依赖
- `src/app/`, `src/components/`, `src/db/`, `prisma/schema.prisma`: 已有功能和数据模型
- Recent git history: 番茄钟是最近持续开发的功能
- Your decisions in this scope session: 产品边界、用户能力、质量目标、Tracer Bullet 和 Beta 工作流

### Practices and standards

- Tracer Bullet: 先证明一个真实端到端路径，再逐段扩展
- Brownfield enrollment: 已有完整能力记为 `existing`，部分完成能力记为 `in-progress`
- Beta workflow: 真实应用验证之后增加可重复运行的测试
- Least data collection: 使用统计只采集回答产品问题所需的最少数据

## Legend

- **Next step**: 第一个未勾选框
- **needs a decision**: 建议先运行 `/architect`，已有明确方案时可以直接运行 `/develop`
- **Status**: `planned` → `in-progress` → `done`，`existing` 表示工作流引入前已经存在
- **Workflow**: Beta 默认在 `/develop` 后运行 `/check verify` 和 `/test`
- **GA tag**: 该功能在 Beta 之外还建议运行独立 `/check review` 和 `/document`
- **Pointer**: `code in` 指向现有实现，spec 指针会由 `/architect` 添加
