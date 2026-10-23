# Review, codex/blog-toc-reading-progress, 2026-10-22

**Reviewed by**: gpt-6-astra (author on gpt-6.1-sol)
**Scope**: 60 files, branch vs base
**Verdict**: Changes requested

## Summary

本次以 spec 0014 的 Blog 空状态与错误恢复为重点，审查相对 master 分支点 `08fa5b5c459881965e6978b33e2afede295e3749` 的已提交、未提交及未跟踪改动，并追踪 spec 0012、0013 的必要交互上下文。列表状态区分、相邻文章请求隔离及安全 Album 实现较完整，但有两处恢复入口与当前 Next 16.3.3 边界行为不匹配：404 重查读到了恢复后的文章却仍显示缺页；列表错误页返回同路径仍显示旧错误。两项均经实际 Next 路由、服务端重读及成功对照确认，结论为 1 项 Major、1 项 Minor，无 Blocker；已知 staging 配置缺口按用户要求保留，不计为新增缺陷。

## Major

### 🟠 [P2] 404 的“重新检查”无法显示已经恢复的文章，`src/app/blog/[id]/not-found.tsx:9`

**Problem**: 此处的 BlogRecovery 未传入专用恢复操作，落入 `src/components/Blog/BlogRecovery.tsx:48` 的 `router.refresh()`。已安装 Next 的 `HTTPAccessFallbackBoundary` 在同一 pathname 保留 `triggeredStatus`；同路径 refresh 更新服务端结果却不会清除这个缺页状态。实际复现为：通过 Next Link 进入 `/blog/42?keep=yes#section` 并触发 404，随后把服务端读取结果改为存在文章，点击“重新检查”。服务端已经记录 `REVIEW DETAIL READ 42 true` 和成功的 `GET /blog/42?keep=yes 200`，按钮结束等待后仍显示“文章不存在或已删除”。在完全相同 URL 执行浏览器完整刷新，立即显示恢复后的文章，排除了数据未恢复和请求未发送的解释。

**Why it matters**: 例如读者停留在已软删除文章的缺页页，作者恢复文章后，所提供的重查入口仍给出过时的删除判断。spec 0014 状态表明确要求“缺页 → 重新检查 → 正常文章、仍缺页或读取失败”；目前缺少退出已触发 404 的有效路径。规格选择 `router.refresh()` 并不能保证该状态转换：当前安装版本源码 `node_modules/next/dist/client/components/http-access-fallback/error-boundary.js:46` 仅在 pathname 变化时重置，实际路由实验也确认同路径刷新没有重挂载边界。这是 0014 新恢复入口的问题，不是 0012/0013 的旧阅读功能缺陷。

**Suggested fix**: 为缺页重查选择能重新创建或有效清除该框架缺页边界的方式，并保留当前完整 URL；本轮正向对照已证明完整文档刷新可行。由实现阶段同步记录与原 `router.refresh()` 决策的差异，不要仅替换内部 children 或添加不会改变边界身份的状态。增加真实路由回归：先通过客户端导航进入缺页，再恢复同一资源，点击重查后断言真实文章出现；另检查缺页转临时读取失败及持续缺页，不能只断言按钮恢复可用和地址不变。

## Minor

### 🟡 [P3] 列表错误页的“返回文章列表”保留同路径旧错误，`src/components/Blog/BlogRecovery.tsx:54`

**Problem**: 返回入口固定使用 Next `StyledLink href="/blog"`。若当前错误来自 `/blog?content=term#list`，这个导航只改变查询和片段，pathname 仍为 `/blog`；当前 Next `ErrorBoundaryHandler` 因而保留旧错误。实际实验先让列表渲染抛错，再恢复服务端读取，点击该链接后 URL 已变为 `/blog`，服务端记录 `REVIEW LIST READ false` 与 `GET /blog 200`，页面却仍显示“Blog 页面暂时无法加载”。随后点击“重试”，实际框架 `retry()` 立即恢复正常列表，构成成功对照。

**Why it matters**: 列表错误界面承诺的返回入口不能完成恢复，读者清除了搜索条件仍停在旧错误上。由于旁边的 `retry()` 入口有效，影响低于上面的 404 重查问题，列为 Minor。来源是 0014 新增共享错误界面的同路径导航组合，并非建议改回旧版 `reset()` API。

**Suggested fix**: 错误边界中的返回列表操作需保证目的 pathname 与当前 pathname 相同时也能退出旧边界，例如在该场景使用真正的文档导航，或与当前版本边界重试机制正确协调。继续保留链接语义和 `/blog` 目标，并检查从详情、新建、编辑返回列表的行为。补充点击返回链接的实际恢复测试；只断言 `href="/blog"` 无法覆盖此问题。

## Strengths

- 页面明确区分成功空结果、查询失败、缺页及存在但正文为空，失败时没有伪造数量或把相邻读取失败显示为文章首尾；错误文案也没有暴露原始异常。
- 相邻导航以文章身份、请求版本和生命周期隔离迟到结果，相关测试包含 A → B → A、卸载及焦点处理；搜索的草稿、URL、防抖取消与排序合并提交也有针对性断言。本轮没有把尚未证实的搜索竞态猜测列为缺陷。
- Album 状态展示使用固定本地状态；复用默认密度 NeuPanel 和共享控件。Next 补丁同时覆盖 CJS/ESM 的初始缓存 URL 片段处理，保留页面完整 canonical URL，未发现与上述边界问题有关的补丁回归。

## Test coverage

本轮实际运行了以下命令，退出码 0，5 个测试文件、42 项通过；其中 4 个正式文件共 40 项，另 2 项为忽略目录中的最小框架实验，断言的是当前有缺陷的状态保留行为：

```text
pnpm exec vitest run .feline-blog/review-0014/scratch/framework-recovery.test.tsx src/app/blog/page.test.tsx src/components/Blog/BlogRecovery.test.tsx src/components/Blog/AdjacentBlogs.test.tsx src/components/BlogList/BlogListOperationBar.test.tsx --reporter=verbose
```

命令使用项目 Node 22.21.1、pnpm 10.28.1，并将 TEMP/TMP 指向仓库测试缓存。组件 mock 可以证明点击调用 refresh，不能证明 Next 缺页边界退出；`e2e/blog-status.spec.ts:55` 使用始终无效的 ID，重查后只检查可用性和 URL，因此不能证明资源恢复成功。`e2e/blog-error-boundary.spec.ts:183` 以及 BlogRecovery 组件测试只检查返回链接目标，未执行同路径返回的恢复断言。这些覆盖缺口分别并入上述两项发现，不重复计数。

为排除“组件实例实验不能代表真实路由”的局限，本轮在忽略目录运行隔离的最小 Next 应用，直接复用仓库缺页、错误和恢复组件，以文件标志替代业务读取。通过 CUA 操作真实 Next Link、恢复按钮及浏览器完整刷新，观察到两条新请求均成功读取恢复结果但保留错误 UI；404 的完整刷新、列表的框架 `retry()` 均成功。实验使用已安装且打补丁的 Next 16.3.3/Turbopack，没有 HMR 源码切换、数据库写入或日常服务操作。可复现步骤和日志摘录保存在 [.feline-blog/review-0014/scratch/runtime-evidence.md](C:/Users/Feline/Desktop/vibeCoding/feline-blog-app/.feline-blog/review-0014/scratch/runtime-evidence.md)。

本地正反截图：

- [404 重查后仍缺页](C:/Users/Feline/Desktop/vibeCoding/feline-blog-app/.feline-blog/review-0014/scratch/not-found-after-refresh.png)；[同 URL 完整刷新成功](C:/Users/Feline/Desktop/vibeCoding/feline-blog-app/.feline-blog/review-0014/scratch/not-found-hard-reload-control.png)。
- [返回列表后仍报错](C:/Users/Feline/Desktop/vibeCoding/feline-blog-app/.feline-blog/review-0014/scratch/list-after-return.png)；[retry 恢复正常列表](C:/Users/Feline/Desktop/vibeCoding/feline-blog-app/.feline-blog/review-0014/scratch/list-retry-control.png)。

两次实验服务会话均已结束，最终端口检查为 `REVIEW_PORT_3014_LISTENER_COUNT=0`；成功实验标签已显式关闭。首次连接失败的临时诊断标签因 data URL 访问策略无法重新获取关闭，未保留，按工具临时标签生命周期回收；不将其描述为已验证关闭。

范围以清单 60 项（含锁文件；排除锁文件为 59 项）为基准，重点逐项审查 0014 路由、恢复/状态/相邻组件、查询规范化、搜索操作栏、Album、Next 补丁及相关测试；同时追踪共享 Markdown、阅读控制器、导航、布局和控件上下文。锁文件、全局样式及部分旧 0012/0013 外围文档按差异和相关上下文核对，本轮不等同于对前两项功能的全面逐行重审；按约定未读取三份 rationale.md。未修改业务代码、正式测试、规格、AGENTS 或 scope。

上述是实际框架路由实验，数据层使用替身，不能冒称真实业务数据库恢复 E2E。此审查没有重新运行全量 lint、typecheck、build、Vitest 或 Playwright；历史验收报告仅用于核对已有覆盖与边界，新建/编辑首次 loading 的补齐证据不再列为缺口。`STAGING_SMOKE_ORIGIN` 缺失继续按用户要求保留；不修改 staging、不宣称完整全站 E2E 通过，也不改变验收勾选状态。scope 31 没有 Review it 复选框，本轮不新增该项或改动 scope。
