# Review, codex/blog-toc-reading-progress, 2026-10-23

**Reviewed by**: gpt-6-astra (author on gpt-6.1-sol)
**Scope**: 60 files, branch vs base（分支清单；重点复审 4 个恢复修复文件及 0014 关联上下文，并非 60 项逐行重审）
**Verdict**: Approve

## Summary

本轮重点复查 404 重新检查恢复文章，以及列表、详情、新建、编辑错误页返回文章列表的修复。当前实现与已安装 Next 16.3.3 的边界生命周期匹配，上一轮 Major 和 Minor 均已解决；独立运行的两端 10 项正式恢复回归、40 项相关 Vitest 及四文件 lint 全部通过，未发现新的可执行代码问题。已知 staging 配置缺口继续保留，审查通过不等于整体验收或全站 E2E 通过；规格中尚未同步的恢复方式按用户既有授权作为非阻断文档债记录。

## Scope and evidence

基准为 `master` 的分支点 `08fa5b5c459881965e6978b33e2afede295e3749`，核对 `git diff`、当前 Git 状态及 `git ls-files --others --exclude-standard`。本轮输入清单见 [.feline-blog/review-0014-recovery/scope.json](C:/Users/Feline/Desktop/vibeCoding/feline-blog-app/.feline-blog/review-0014-recovery/scope.json)：共 61 项，排除 `pnpm-lock.yaml` 后为 60 项，其中包含上轮审查报告；本报告自身不计入审查输入。

完整读取并重点逐行复审本次 debug 修改的四个文件：

- `src/components/Blog/BlogRecovery.tsx`
- `src/app/blog/[id]/not-found.tsx`
- `e2e/blog-error-boundary.spec.ts`
- `e2e/blog-status.spec.ts`

关联上下文包括 0014 的列表、详情、新建、编辑路由和状态映射、共享错误与加载界面、恢复组件测试、相邻导航控制器及测试、搜索操作栏及测试、共享 Button/StyledLink、查询规范化、Playwright 配置及 Next 补丁。核对根与 `src/AGENTS.md`，读取 0014 build spec，以及 0012/0013 中相关正文、导航、焦点和服务端边界约定；没有读取 rationale.md，没有声称重新完整审查旧 0012/0013 的全部代码和样式。

框架判断依据是本机安装版本的 `error.md`、`not-found.md`、`use-router.md` 指南，以及 `HTTPAccessFallbackErrorBoundary`、`ErrorBoundaryHandler` 实际源码。同 pathname 的刷新或仅改变查询/片段的客户端导航保留相应边界状态；正常 `retry()` 同时刷新数据并清除错误，不能用旧版 `reset()` 示例代替。

## Previous findings resolved

| 上轮发现 | 本轮复审结果 |
| --- | --- |
| Major：404 重查无法展示已经恢复的文章 | `src/app/blog/[id]/not-found.tsx:9` 显式启用 `reloadDocument`；`src/components/Blog/BlogRecovery.tsx:54` 的分支设置等待状态并调用 `window.location.reload()`，重建原来的缺页边界。`e2e/blog-status.spec.ts:158` 从真实列表客户端进入已软删除文章的 404，恢复同一记录后按 Enter 重查，断言真实标题、正文可见、404 消失且当前完整 URL 不变。本轮桌面与移动端均通过。 |
| Minor：列表错误页返回同路径仍保留旧错误 | `src/components/Blog/BlogRecovery.tsx:68` 使用指向固定 `/blog` 的原生链接，复用 `buttonVariants`，lint 例外只覆盖这一行并解释文档导航的原因。`e2e/blog-error-boundary.spec.ts:96` 对四个路由分别触发实际 Next 错误边界，设置查询和片段后按 Enter 返回，断言 URL 精确为 `/blog`、正常列表与真实样例出现且错误标题消失；涵盖列表 pathname 不变的关键场景。本轮两端八项均通过。 |

普通预期读取失败仍调用 `router.refresh()`，意外路由错误的重试仍使用框架 `retry()`；404 的专用文档刷新没有扩散到这些局部恢复路径。新增操作没有接收任意外部地址、没有新增写入入口或绕过认证，也没有展示原始异常。

## Strengths

- 回归测试已从仅检查调用或链接 href，提升为验证真实恢复结果：404 使用本地数据库中同一条记录的软删除/恢复，四种错误页验证实际边界退出。
- 恢复链接保留原生链接和键盘语义，样式继续使用共享按钮变量；404 重查直接使用浏览器当前地址，保留查询和片段。
- 原有等待、重复触发保护及用户移走焦点后的处理仍由针对性的组件测试覆盖；本轮相关 40 项全部通过。

## Test coverage

本轮独立运行以下检查，使用仓库 Node.js 22.21.1、pnpm 10.28.1；Vitest 的 TEMP/TMP 指向 `node_modules/.cache/blog-test-tmp`：

```text
pnpm exec vitest run src/app/blog/page.test.tsx src/components/Blog/BlogRecovery.test.tsx src/components/Blog/AdjacentBlogs.test.tsx src/components/BlogList/BlogListOperationBar.test.tsx --reporter=verbose

node node_modules/eslint/bin/eslint.js src/components/Blog/BlogRecovery.tsx src/app/blog/[id]/not-found.tsx e2e/blog-error-boundary.spec.ts e2e/blog-status.spec.ts --max-warnings=0

pnpm dev
node node_modules/@playwright/test/cli.js test e2e/blog-error-boundary.spec.ts e2e/blog-status.spec.ts --grep '错误边界点击返回文章列表|客户端进入缺页' --reporter=line --output=.feline-blog/review-0014-recovery/scratch/playwright-results
```

结果分别为 4 个测试文件、40 项通过；lint 无警告、退出码 0；Playwright 桌面 5 项及移动端 5 项通过，无跳过，耗时 1.3 分钟。日志、退出码和正式测试截图保存在 [.feline-blog/review-0014-recovery/scratch/](C:/Users/Feline/Desktop/vibeCoding/feline-blog-app/.feline-blog/review-0014-recovery/scratch/)。本轮没有另写临时浏览器自动化或新增永久测试。

第一次 Playwright 调用未执行用例：配置内置 webServer 继承 dotenv 的 `POSTGRES_*` 后被本地开发命令的保护逻辑拒绝，错误为 `CONFIG_CONFLICT`。随后独立启动 `pnpm dev`，使用同一正式测试命令完成上述有效运行；没有修改或绕过环境保护、测试配置或 staging。失败的启动日志单独保留为 `playwright-startup-failed.log`。

四个错误页用例通过测试网络替换一个 Flight 组件引用来触发真实 Next 边界，返回后读取未经替换的文档与本地真实数据；这不是业务数据库真实抛错的证据。404 用例确实在安全本地 PostgreSQL 中软删除和恢复测试文章。现有组件测试另覆盖读取失败、持续失败、重复操作、迟到结果和局部焦点处理；没有把组件 mock 或历史通过记录代替本轮的路由结果断言。

开发服务输出中观察到搜索输入的 `caret-color: transparent` hydration 诊断；应用源码没有写入该属性，安装的 Playwright 截图器 `coreBundle.js:21124` 会临时注入并恢复该值。该诊断出现在带截图的测试运行中，未证明是本轮恢复代码的用户可复现缺陷，因此不列为代码发现，也不声称本次运行完全没有浏览器诊断。

本轮没有重跑全量 lint、typecheck、build、全部 631 项 Vitest、完整两端专项、四主题矩阵或全站 Playwright。相关历史记录仅作覆盖背景；新建、编辑首次 loading 已有补齐证据，不重复列为缺口。当前五条重点路径有本轮独立的正式测试结果；最近一次 CUA 逐条验证属于前轮证据，没有冒称本轮又执行了 CUA。

## Retained limitations and cleanup

`docs/specs/0014-blog-empty-error-recovery/index.md:88`、`:101` 仍把 404 归入 `router.refresh()`；`:114` 的局部焦点约定也应与完整文档导航的原生行为区分。用户已明确授权这次恢复方式修复，debug/verify 报告已记录差异，因此这些是待 `/architect` 同步的已知非阻断文档债，本轮不要求恢复到已证实失效的实现。

`STAGING_SMOKE_ORIGIN` 等既有 staging 配置缺口按用户要求继续保留，不修改、不重跑已知缺配置的全站 E2E，也不改变整体验收的 BLOCKED 状态。scope 31 没有 Review it 复选框，本轮不新增复选框、不更新任何完成标记。

正式测试的精确清理完成后，本轮另执行只读数量核对：安全测试作者的 `blog-boundary-*`、`blog-status-*` 夹具剩余 0 条，可见日常文章为 4 篇，见 [cleanup-proof.json](C:/Users/Feline/Desktop/vibeCoding/feline-blog-app/.feline-blog/review-0014-recovery/scratch/cleanup-proof.json)。本轮独立启动的开发服务已停止，3000 监听数量为 0。本轮仅新增本审查报告和忽略目录中的验证证据，没有修改应用代码、正式测试、规格、AGENTS、scope 或配置，没有提交或推送。
