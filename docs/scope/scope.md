# Scope: feline-blog-app

这是一个面向公开读者的个人博客，也是你自己的私人效率工作台。读者可以阅读和互动，你可以发布内容，并使用待办、番茄钟和日常记录管理每天的工作。

**Build approach:** Tracer Bullet（每次把一个真实功能从界面、权限、数据到实际使用完整打通）。
**Workflow:** Beta（每次 `/develop` 后运行 `/check verify`，再运行 `/test`）。项目默认采用这个严谨程度。需要真实决策的功能建议先运行 `/architect`，如果你已经知道如何实现，也可以直接进入 `/develop`。单个高风险功能可以提高到 GA。

_这些是帮助你保持开发顺序的建议，不是强制流程。你可以跳过不适合的步骤，并自行决定功能何时算完成。_

## At a glance

| #   | Feature              | Phase       | Status      |
| --- | -------------------- | ----------- | ----------- |
| 1   | 站点外壳与视觉体系   | Current     | existing    |
| 2   | 基础账号与文章互动   | Current     | existing    |
| 3   | 公开文章阅读         | Current     | existing    |
| 4   | 作者发布文章         | Current     | existing    |
| 5   | 待办管理             | Current     | existing    |
| 6   | 番茄钟核心闭环       | Slice 1     | done        |
| 7   | 日常记录核心闭环     | Slice 2     | in-progress |
| 8   | 待办进入专注         | Slice 3     | planned     |
| 9   | 专注结果进入日常总结 | Slice 4     | planned     |
| 10  | 文章发现能力         | Slice 5     | planned     |
| 11  | 账号恢复             | Slice 6     | planned     |
| 12  | 数据权利与隐私说明   | Slice 7     | planned     |
| 13  | 基础 SEO             | Slice 8     | planned     |
| 14  | 使用统计与错误监控   | Slice 9     | planned     |
| 15  | NeuDiv 组件代码优化  | Maintenance | done        |

## Current product

### 1. 站点外壳与视觉体系 · existing

提供全局布局、导航、主题、提示消息，以及项目自有组件和基础 UI 组件。
**Done when:** 公开页面共享一致布局和主题，主要控件可复用，页面可以在常见桌面浏览器中正常使用。
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

## Maintenance

### 15. NeuDiv 组件代码优化 · done

整理 NeuDiv 的实现和类型表达，只在组件本身及确有必要的引用文件中改善可读性与可维护性，不扩大修改范围。
**Done when:** NeuDiv 的样式、属性接口和运行行为保持不变，相关引用继续通过类型检查、lint、构建和测试。

- [x] Build it: `/develop NeuDiv 组件代码优化`
      code in `src/components/NeuDiv/index.tsx`

## Deferred

当前开发轮次不包含这些能力，保留在这里避免它们悄悄扩大主线。

- **国际化结构**: 当前界面继续使用简体中文，等正式功能稳定后再为多语言保留结构
- **直接上传和管理图片**: 文章暂时继续使用外部图片链接
- **评论和公开用户资料**: 普通用户当前只点赞和收藏
- **完整移动端与 WCAG 2.2 AA**: 当前只保证常见桌面浏览器可用
- **实验页面产品化**: `album`、`formatter` 和 `playground` 暂不进入正式产品范围
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
