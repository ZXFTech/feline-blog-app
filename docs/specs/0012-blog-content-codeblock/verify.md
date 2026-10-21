# Verify: Blog 正文与代码块展示修复，spec 0012

本文件是待执行清单。写规格不代表任何实现或检查已经完成，只有实际运行并记录证据后才勾选。

## Preconditions

1. 使用项目锁定的 Node.js、pnpm 和锁文件准备依赖，运行前阅读已安装 Next.js 的相关本地指南。
2. 按现有数据库文档准备安全本地运行环境，不复制密钥、不连接错误环境。公开阅读选用已有测试文章，作者流程使用已授权的安全测试账号。
3. 记录测试文章标识和各次访问的 URL。若需要新建文章，以唯一测试标记区分，并按现有安全测试约定清理；Album 固定样例不调用真实业务读写。用户要求保留的四篇本地导入文章为 `/blog/14` 至 `/blog/17`，不纳入测试清理。

## Confirmed visual baseline

下列数值按根字号 16px 换算，覆盖公开详情、编辑预览和 Album。它们来自用户最终确认，正式验收时读取实际计算样式。

| 检查项 | 预期 |
| --- | --- |
| 正文 | 字号 `.9rem`（14.4px），行高 `1.5`（21.6px） |
| 正文、列表和引用块间距 | `.25rem`（4px） |
| 普通正文标题留白 | 上方 12px，下方 8px；首个标题和连续标题按规格例外处理 |
| 代码与行号 | 字号 `.875rem`（14px），行高 `1.4`（19.6px） |
| 代码容器 | `NeuPanel`，`inset-sm`，default 内边距 `.75rem`（12px） |
| 代码面板与工具栏内部 gap | `.25rem`（4px） |
| 换行与复制按钮之间 gap | `.5rem`（8px） |
| 代码块上下 margin | 各 `.5rem`（8px），另计正文 gap |
| 语言与操作控件 | 语言使用共享 `Tag`；操作使用 Album 同款默认 `Button size="icon"`，不附加 44×44 最小尺寸 |

## UI and real flows

- [x] 在公开详情检查文章标题、h1 至 h6、段落、分隔线、嵌套列表、引用、链接、行内代码、任务列表、表格和本地样例图片，核对排版尺度、原始比例及标题 ID。记录页面和截图，验证 **AC-1**、**AC-9**、**AC-11**。
- [x] 按上表逐项测量正文、标题、代码、内边距、gap 与 margin，检查 default 内边距和代码块上下 margin 没有被重置；核对四主题和宽窄视口，验证 **AC-1**、**AC-7**、**AC-9**。
- [x] 在编辑预览输入相同 Markdown，记录现有 `onContentChange` 转换后的实际 `blogData.content`，比较正文元素、代码语言、文本、标题 ID 和计算样式；用安全账号点击现有“提交”操作，确认成功并进入公开详情后再次比较。无行为的“保存”按钮不属于本轮验收路径，验证 **AC-2**、**AC-13**。
- [x] 检查有语言、无语言、未知语言、带特殊字符的语言名称、空围栏和缩进代码块，确认统一工具栏、无占位标题、纯文本 fallback、合法 `pre > code` 结构，验证 **AC-3**、**AC-11**。
- [x] 直接向 BlogMarkdown 和 CodeBlock 提供含制表符、前导空格、首尾空行、内部空行、末尾换行和超长行的固定输入，比较解析后的代码文本、可见内容与复制结果，确认不含行号或按钮文字。此处不以编辑器转换前的粘贴文本作为精确基准，验证 **AC-4**。
- [x] 在两个代码块分别切换“自动换行”，检查默认横滚、独立状态、逻辑行号和续行对齐；切主题后保留模式，更新代码后恢复默认模式；核对 `""`、`"a\n"`、`"a\n\n"`、`"\n"` 的行号分别为 `[]`、`[1]`、`[1,2]`、`[1]`，CRLF 和 CR 等价分隔时结果一致，验证 **AC-5**。
- [x] 分别使用 light、dark、sugar、warm，读取实际代码背景和各类文本计算样式，测量语法颜色对比度至少 4.5:1，确认字体来自当前 token，无 Dracula 固定色残留，验证 **AC-6**、**AC-10**。
- [x] 在 1280×800 和 390×844 视口检查超长代码、无空格文本、宽表格和工具栏，测量整页宽度、局部滚动及阴影边界，验证 **AC-7**、**AC-9**。
- [x] 通过 Tab、Enter、Space 和方向键操作复制、换行及滚动，确认两个按钮与 Album 默认图标按钮的尺寸、内边距一致，检查中文名称、焦点及状态朗读，验证 **AC-7**、**AC-8**。
- [x] 复制成功时显示勾选，一秒后恢复复制图标；换行使用图标和 `aria-pressed`，语言使用 Tag；检查失败反馈不扩大按钮间距或造成整页溢出，验证 **AC-5**、**AC-7**、**AC-8**、**AC-9**。
- [x] 在测试中模拟剪贴板缺失和拒绝，检查失败文字、再次尝试和手动选择代码；模拟旧代码复制尚未完成时更新内容、重复点击和卸载，验证 **AC-8**。
- [x] 访问服务端公开详情，确认初始 HTML 包含正文，主题切换和刷新没有 hydration 错误；减少动态效果时没有本组件装饰性过渡，验证 **AC-10**、**AC-11**。
- [x] 打开 `/album?component=blog-markdown`，检查固定场景、局部四主题、换行、复制反馈和重置，无认证、业务 Action、API 或真实数据请求，验证 **AC-12**。

## Commands

- [x] `pnpm lint` 与 `pnpm typecheck` 通过，验证 **AC-13**。
- [x] `pnpm build` 通过，验证 **AC-10**、**AC-11**、**AC-13**。
- [x] `pnpm exec vitest run --maxWorkers=2` 与 `pnpm db:boundaries` 通过，重点检查共享解析入口、空白保持、语言 fallback、代码状态隔离和 Album 覆盖映射，验证 **AC-2** 至 **AC-5**、**AC-8**、**AC-12**、**AC-13**。
- [x] `pnpm test:e2e e2e/blog-markdown.spec.ts e2e/blog-author-rendering.spec.ts` 在安全测试配置下通过，相关用例真实测量四主题、宽窄视口、点击区域和业务预览一致性，验证 **AC-1**、**AC-2**、**AC-6** 至 **AC-13**。

## Evidence record

执行时按行为记录 URL、主题、视口、观察结果及截图或命令输出位置。对比度记录前景、背景和数值，复制记录文本比对结果而不输出真实文章正文或敏感内容。缺少依赖、运行配置或账号时保留未勾选并说明原因。

2026-10-20 最后一次样式调整后的开发自检：`pnpm exec prettier --check src/app/globals.css e2e/blog-markdown.spec.ts` 通过；`pnpm test:e2e e2e/blog-markdown.spec.ts` 共 4 项通过，覆盖桌面、手机和四主题；`http://localhost:3000/blog/17` 实测正文字号 14.4px、按钮 gap 8px、面板 gap 4px、上下 margin 各 8px。截图位于 `.feline-blog/blog-body-nine-button-gap.png`。这些是已有开发证据，正式逐项验收和最终全套检查完成后再勾选上方清单。

## Formal verification, 2026-10-20

**Verdict: PASS**。13 项验收条件均已满足，公开详情、作者编辑预览和 Album 三个展示面均已实际运行。初次验收发现代码区 Ctrl+A 全选整页，随后按用户授权执行 `/debug`：仅在当前代码区处理 Ctrl+A 或 Cmd+A，通过 DOM Range 选择该块的 `code` 内容。修复后的真实文章截图和桌面、手机浏览器用例均确认选区不含行号、工具栏、其他代码块或正文。Tab、Enter、焦点、复制反馈、空块、换行和代码区外原生全选也已复验通过。复验依据用户确认的 Ctrl+A 契约，不新增 Home、Shift+End 的光标编辑行为。

本文件的 17 项已执行清单和 scope 条目 28 的 `Verify it` 已勾选。`Test it` 保留未勾选，功能仍为 `in-progress`，spec 仍为 `In Progress`。应用修复与回归用例由用户授权的 `/debug` 完成，本次复验记录最终结果。用户文章页与本地开发服务保留可用。

### Commands and artifacts

本次使用项目锁定的 Node.js 22.21.1 和 pnpm 10.28.1。所有命令退出码为 0，证据位于被忽略的 `.feline-blog/verify-0012/`。

| 编号 | 实际命令或页面 | 观察结果 | 证据 |
| --- | --- | --- | --- |
| E1 | `pnpm lint` | 无 lint 错误与警告 | `lint.log` |
| E2 | `pnpm typecheck` | 类型检查通过 | `typecheck.log` |
| E3 | `pnpm test` | 104 个文件、553 项测试通过，387 个源码文件通过数据库依赖边界检查 | `vitest.log` |
| E4 | `pnpm test:e2e e2e/blog-markdown.spec.ts e2e/blog-author-rendering.spec.ts e2e/api-safety-database.spec.ts --output=.feline-blog/verify-0012/playwright` | 桌面 Chromium、手机 WebKit 共 16 项通过，未跳过 | `playwright.log`、`playwright/` |
| E5 | `pnpm exec dotenv -e .env.development -- pnpm build` | 生产构建通过，Blog 详情、新建、编辑和 Album 路由均生成 | `build.log` |
| E6 | `/blog/14`、`/blog/15`、`/blog/16`、`/blog/17` | 代码块数分别为 11、1、6、16，共 34 块；所有已检查面板 padding 12px、gap 4px、按钮 gap 8px、上下 margin 各 8px；正文 14.4px / 21.6px；无嵌套 pre 或整页横向溢出 | `imported-articles.json`、`article-17.png` |
| E7 | `/album?component=blog-markdown` | 语言回退、空代码、只读任务、本地图片、独立换行、复制成功和样例重置可用；图片以原始比例显示；长行换行后保留 5 个逻辑行且 scrollWidth 等于 clientWidth | `album-metrics.json`、`album-wrap.png`、`manual-interactions.json` |
| E8 | 本地导入记录只读复核 | 验收前后四篇原文哈希均与导出一致，四个标签颜色均保留 `var(--primary)`，未执行修复写入 | `local-import-audit.json`、`local-import-audit-after.json` |
| E9 | 用户恢复后的 `/blog/17` | Tab 顺序、可见焦点和 Enter 复制反馈通过；代码区 Home、Shift+End 没有选区，Ctrl+A 全选整个页面，键盘选择失败 | `keyboard-verification.json`、`keyboard-selection.png`、`keyboard-select-all.png` |

E4 的作者闭环分别使用本次唯一测试文章 `/blog/27` 与 `/blog/31`，已通过各用例的 `finally` 精确清理，不影响 E6 的四篇保留文章。`author-flow.json` 记录预览与持久化输入、匿名公开正文、初始服务端 HTML、编辑后重读的一致性。截图 `public-article.png` 位于对应 desktop 和 mobile 输出目录。E4 还验证了非作者写入被拒绝、事务回滚和既有状态投影。

四主题在 1280×800 与 390×844 下测得的语法色最低对比度均一致：light 5.47:1、dark 6.34:1、sugar 4.69:1、warm 5.61:1，均高于 4.5:1。实际前景、背景及逐组比值记录在 E4 的八个 `*-contrast.json` 中。E4 未观察到 pageerror 或 hydration 错误。

E9 的复现步骤：在首个换行按钮处按 Tab，确认复制按钮获得焦点，按 Enter，观察“已复制”；再按 Tab，确认代码区获得焦点；按 Home、Shift+End，观察没有局部文本选区；按 Ctrl+A，观察导航、标题、正文和目录同时高亮。源码定位为 `src/components/Blog/CodeBlock.tsx` 的可聚焦 `pre`，当前具备 `tabIndex={0}` 与滚动入口，但没有为代码区提供局部键盘选择行为。该定位用于后续修复，不替代截图中的运行证据。

补验中的 Browser Use 剪贴板读取与粘贴探针只访问工具虚拟剪贴板，返回空数据，未据此推断系统剪贴板写入失败。精确复制文本的既有证据来自 E3 的实际 `writeText` 参数比对；真实浏览器复制成功反馈来自 E7 与 E9。

### Acceptance criteria coverage

| 条目 | 本次结论 | 运行证据 |
| --- | --- | --- |
| AC-1 | met | E4 的四主题密度与标题间距断言、作者公开正文截图；E6、E7 的真实计算样式 |
| AC-2 | met | E4 的作者预览、提交持久化、公开 SSR、匿名阅读和编辑重读一致性 |
| AC-3 | met | E3 的空块、未知语言、特殊语言标记和缩进代码用例；E7 的实际工具栏与纯文本回退 |
| AC-4 | met | E3 的逐字符代码与剪贴板参数比对，包括制表符、空行、首尾空白和行尾；E7 的实际复制成功反馈 |
| AC-5 | met | E3 的独立状态与内容变化重置、各种行尾逻辑行号；E4 的键盘 Space 换行和行数、文本一致性；E7 的独立块及样例重置 |
| AC-6 | met | E4 的四主题实际颜色、字体及对比度文件 |
| AC-7 | met | E4、E6、E7 的间距、面板和共享控件检查；下方 R4、R7 确认 Ctrl+A、Cmd+A 只选择当前代码块，Tab、Enter、Space、局部横滚和可见焦点均通过；E9 是修复前的历史失败证据 |
| AC-8 | met | E3 的剪贴板缺失、拒绝、重试、快速点击、旧 Promise、计时器和卸载场景；E4 的失败可见、重试成功、勾选恢复；E7 的实际复制成功 |
| AC-9 | met | E4 的桌面和手机局部横滚、长链接、宽表格、换行后无整页溢出；E7 的本地图片原始比例；E6 的真实文章宽度 |
| AC-10 | met | E4 的初始 HTML 含正文和锚点、主题切换一致性、无 pageerror、减少动态效果；E5 的生产构建与动态路由输出 |
| AC-11 | met | E3 的原始 HTML 和不安全 URL 用例；E4 的作者归属、权限拒绝、持久化正文、重复标题锚点；E8 的原文保留 |
| AC-12 | met | E7 的无登录固定 Album 展示与重置；E3 的 Album 导出覆盖测试；E4 的安全展示和四主题交互 |
| AC-13 | met | 下方 R3 至 R8 的完整 Vitest、浏览器回归、lint、类型、构建、格式与真实文章复验通过；此前 E4 的权限验证继续有效 |

已定义的三个展示面均已实际运行：公开 Blog 详情、真实 Markdown 编辑预览、独立 Album 展示。没有发现缺失的展示面或未应用的本功能迁移，本功能未定义新增数据库迁移。线上环境和既有外链图片服务的可用性未验证，图片布局使用本地样例验证。

### Keyboard fix and recheck

以下证据位于 `.feline-blog/verify-0012/keyboard-fix/`，用于覆盖上方初次验收的键盘失败与修复前的检查结果。

| 编号 | 实际操作或命令 | 最终结果 | 证据 |
| --- | --- | --- | --- |
| R1 | 修复前运行新增 CodeBlock 选择用例 | 3 项按预期失败，证明当前代码没有拦截全选 | `red-vitest.log` |
| R2 | 修复后运行 CodeBlock 单测 | 15 项通过，覆盖 Ctrl/Cmd、原始空白、多个代码块、空块、大小写和其他快捷键不被拦截 | `green-vitest.log` |
| R3 | `pnpm exec vitest run --maxWorkers=2`，随后 `pnpm db:boundaries` | 104 个文件、556 项全部通过；387 个源码文件通过数据库边界检查 | `vitest-limited.log` |
| R4 | `pnpm test:e2e e2e/blog-markdown.spec.ts e2e/blog-author-rendering.spec.ts --output=.feline-blog/verify-0012/keyboard-fix/recheck-final` | 桌面 Chromium 与手机 WebKit 共 8 项通过，未跳过；四主题、精确选区范围、空块、页面原生全选、Tab、Enter、复制、换行及真实作者闭环通过 | `recheck-final.log`、`recheck-final/` |
| R5 | `pnpm lint`、`pnpm typecheck`，最后对四个改动代码和测试文件再运行 ESLint | 均通过 | `lint.log`、`typecheck.log`、`lint-final.log` |
| R6 | `pnpm exec dotenv -e .env.development -- pnpm build` | 生产构建通过，Blog 与 Album 路由正常生成 | `build.log` |
| R7 | 真实 `/blog/17` 依次操作 Tab、Enter、Ctrl+A、Cmd+A | 复制按钮和代码区均有 2px solid 焦点边框，Enter 显示已复制，两种全选键均只高亮当前代码块 | `article-keyboard.json`、`article-select-all.png`、`article-command-select-all.png` |
| R8 | 四个改动代码和测试文件的 Prettier 检查 | 全部通过 | `format.log` |

R4 读取真实浏览器 Selection 的 Range，严格比较完整原始代码文本，并确认起点、终点和公共祖先都在当前 `code` 内。空代码全选后没有其他页面文本进入选区；移出代码区后，浏览器的整页全选保持原生行为。R7 的截图补充证明导航、标题、目录和其他代码块没有被选中。

生产构建后再次确认 `/blog/17` 返回 HTTP 200，初始 HTML 包含 `blog-content`，真实文章键盘全选仍只高亮当前代码块，最终截图为 `article-final.png`。四篇保留文章的原文哈希和标签颜色已再次只读核对，结果记录在 `import-audit-final.json`。

首次全量并行运行曾使一个既有 Windows ACL 文件测试超过原来的 5 秒限制；R3 将 Vitest 工作进程限制为 2 后完整通过，没有放宽断言或测试超时。作者重读测试曾在重载期间读取到空样式，现改为对完整内容快照使用 `expect.poll` 等待稳定状态后再比较，R4 的桌面和手机作者流程均通过。相关首次失败保留在 `vitest.log`、`recheck.log`，不作为最终通过依据。

### Observations for later review

Album 的尺寸说明与固定样例正文仍使用“标准阅读密度”文字，实际计算样式已经是确认的紧凑密度。构建继续提示仓库外 `C:/Users/Feline/package-lock.json` 被忽略，并在预渲染期间记录一条 `resolveCurrentUser` 的 `unexpected / g` 日志，构建退出码仍为 0。这些记录留给后续审查，本次没有修改代码或配置。
