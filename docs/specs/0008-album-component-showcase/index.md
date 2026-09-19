# 0008. Album 组件展示中心

**Date**: 2026-09-18
**Status**: Accepted

## Summary

`/album` 将成为项目组件的公开展示中心。它用一份严格类型的注册表组织组件，用本地样例展示尺寸、变体、状态和四套主题。实现先打通 `Button` 的完整路径，再扩展到全部现有组件。

## Requirements

**User stories**:

1. 作为开发者或设计者，我希望按功能查找组件，快速理解它的用途和实际能力。
2. 作为组件维护者，我希望在一个可重复验证的页面中检查尺寸、变体、状态和主题适配。
3. 作为公开访问者，我希望安全操作样例，不会读取或修改真实业务数据。

**Acceptance criteria**:

1. **AC-1**: `/album` 无需登录即可访问，但设置 `noindex`，不进入站点地图。页面及其样例不请求真实业务数据，不调用写入 Action 或 API。
2. **AC-2**: 宽屏页面使用固定的左侧分类目录和右侧组件详情。窄屏将目录改为主内容上方的可展开选择器，不压缩展示矩阵。页面的标题、说明、目录和展示分区保持清晰语义层级。
3. **AC-3**: 严格类型的显式注册表为每个组件保存稳定标识、中文名、代码名、简介、适用场景、导入路径、功能分类、条目顺序、关键词、能力摘要和接入状态。新组件必须在同一改动中登记为 `ready` 或 `pending`，并进入源码导出覆盖审计。测试校验字段完整、标识唯一、顺序唯一和排序稳定。
4. **AC-4**: 目录按“布局与容器、按钮与导航、表单与输入、反馈与状态、浮层与菜单、数据展示、业务组件”分类。项目名显示“中文名 代码名”，搜索匹配中文名、代码名、分类、关键词和导入路径，英文匹配不区分大小写，空查询恢复完整目录。
5. **AC-5**: 选中组件写入 `/album?component=<slug>`，刷新、分享、前进和后退都保留选择。无参数时默认打开 `Button`。未知标识回退到 `Button` 并显示轻量提示。`pending` 项保留选中状态，显示原因和接入要求。
6. **AC-6**: `ready` 组件的详情区显示简短用途、代码名、导入路径、适用场景和能力摘要。当前主题矩阵包含默认场景、每个尺寸、每个变体、每个可显式表达的状态，以及展示模块明确列出的关键组合。不默认生成尺寸、变体与状态的全部笛卡尔积。每个场景具有稳定 `scenarioId`。
7. **AC-7**: `hover`、`focus` 和 `pressed` 只在组件本身支持显式状态时进入静态矩阵，否则通过真实鼠标或键盘交互演示并验证。Album 不复制组件样式来伪造交互状态。
8. **AC-8**: 每个 `ready` 组件提供当前全局主题下的完整矩阵，以及 light、dark、sugar、warm 四主题的代表 `scenarioId` 对比。内联组件使用局部主题容器。已公开挂载容器能力的浮层可在局部主题中展开。其他浮层的四主题区只展示真实触发器和关闭态，展开内容只在当前全局主题下真实交互，并明示该局限。
9. **AC-9**: 样例只使用简短、固定、无个人信息的中文数据，代码名和属性值保留英文。可交互样例使用本地沙箱状态，支持恢复默认状态，不依赖真实用户、网络、数据库或服务端上下文。
10. **AC-10**: 首次盘点覆盖 `src/components` 中的现有可视组件。独立的源码覆盖审计映射将每个可视导出指向目录家族，或记录排除理由。能安全独立渲染的项目为 `ready`，尚缺适配器或必需上下文的项目为 `pending` 并说明原因。非视觉工具、Hook、类型和原始素材以排除理由进入审计，不伪装成组件条目。`Logo` 作为一个可视素材家族登记，原始 SVG 文件不逐个登记。
11. **AC-11**: 注册表首屏只加载轻量元数据，只有选中的 `ready` 组件动态加载对应展示渲染器。每个展示区独立捕获渲染错误，显示组件名、失败提示和重试入口，其他目录和组件保持可用。重试必须开始新的加载尝试，不得只重用已拒绝的缓存 Promise。错误日志不包含样例输入内容。
12. **AC-12**: Album 忠实展示现有组件契约。实现只修复阻止安全展示的问题，其他组件缺陷作为后续事项保留，不在 Album 中重写样式或改变生产契约。
13. **AC-13**: 目录、搜索、展开器、重置和重试保留原生语义、可见焦点、键盘操作和至少 44 乘 44 像素的操作目标。被展示的生产组件保留它的真实尺寸和契约，包括 `xs`、`sm` 和 `icon`，Album 不为通过展示验收而改变其命中区域。当前项具有可编程识别状态，页面保持键盘和触控滚动，并遵守减少动效偏好。
14. **AC-14**: Vitest 和 Testing Library 覆盖注册表、源码覆盖审计、搜索、选择、场景重置、URL 同步、未知与 `pending` 回退、动态加载、失败后成功重试和错误隔离。Playwright 覆盖宽屏与窄屏、键盘流程、浏览器历史、四主题、浮层限制和无真实写入。首版不维护像素截图基线。
15. **AC-15**: 本功能不新增数据库实体、服务端接口、环境变量、外部服务或第三方依赖。lint、build、Vitest 和 Album Playwright 场景全部通过。

## Decision

**Chosen option**: Option 1: 在现有 Album 中建立显式注册表与按需展示模块

保留 `/album` 路由，用类型化元数据组织目录，用组件专属渲染器展示真实契约，并只加载当前选中的展示模块。

**Implementation skills**: `typescript-react-patterns` (`asyrafhussin/agent-skills`, `.agents/skills/typescript-react-patterns/`) · `tailwind-css` (`paulrberg/agent-skills`, `.agents/skills/tailwind-css/`)

## Feature design

### Source model

本功能没有数据库模型。以下结构是源码中的只读元数据契约。

| Structure | Required fields | Rules |
| --- | --- | --- |
| `CatalogCategory` | `id`, `label`, `order` | `id` 唯一，`order` 稳定 |
| `CatalogEntry` | `slug`, `nameZh`, `codeName`, `description`, `useCases`, `importPath`, `categoryId`, `order`, `keywords`, `capabilities`, `status` | `slug` 全局唯一，`categoryId` 必须存在，同分类内 `order` 唯一 |
| `ReadyCatalogEntry` | `status: "ready"`, `loadDemo` | `loadDemo` 动态返回展示模块 |
| `PendingCatalogEntry` | `status: "pending"`, `pendingReason`, `integrationNeeds` | 不可定义 `loadDemo` |
| `ComponentCapabilities` | `sizes`, `variants`, `states`, `themeComparison` | 只声明组件真实支持的能力 |
| `DemoScenario` | `scenarioId`, `label`, `dimension`, `render` | `scenarioId` 在当前组件内唯一，`dimension` 为 default、size、variant、state 或 combination |
| `DemoModule` | 默认导出的 React 组件 | 内部管理可重置的本地沙箱状态 |
| `CoverageAuditEntry` | `sourceExport`, `disposition`, `targetOrReason` | 每个可视导出指向目录家族，或每个非目录导出有排除理由 |

一个分类对应多个条目。每个 `ready` 条目对应一个展示模块。注册表、当前组件和搜索查询不写入 localStorage、Cookie 或数据库。现有主题选择仍由 `ThemeProvider` 和 `donmiss-theme` 管理。

### Page composition

1. 页面使用现有应用外壳、`Content`、`NeuPanel` 和主题 token，不创建平行设计体系。
2. 左侧栏依次显示页面标题、搜索和分组目录。左栏独立滚动，当前项使用 `aria-current="page"` 或等价语义。
3. 主内容依次显示组件名与简介、导入路径与能力摘要、当前主题完整矩阵、四主题对比和交互注意事项。
4. 展示面板由 `NeuPanel` 管理内边距与直接子元素间距。密集矩阵使用紧凑密度，大型业务样例使用默认或宽松密度。
5. 窄屏目录选择器位于主内容前，关闭后保持当前选中摘要。展示矩阵允许自身滚动或换行，不让整页产生意外水平滚动。
6. 参考图决定信息层级和左右构图，实际颜色、间距、字体、阴影和响应式使用现有 `design.md` 与 `src/app/globals.css`。

### Catalog behavior

1. 功能分类是稳定的页面信息架构，代码文件夹不决定分类。
2. 搜索只过滤目录，不改写当前 URL。如果当前项被查询隐藏，详情区仍保持当前项，直到用户选择另一项。
3. 分类按 `CatalogCategory.order` 排序，分类内条目按 `CatalogEntry.order` 排序。
4. 组件选择通过 Next.js 客户端导航更新 `component` 参数，原样保留所有非 `component` 查询参数，不触发整页重载。
5. 页面状态为 `idle → loading → ready | error`。更换组件会开始新的加载代次，迟到的旧结果不得覆盖新选择。重试使用新的加载代次重新尝试当前渲染器。

### Demo contract

1. 每个展示模块按真实公开属性组合样例，不从组件实现内部复制 class。
2. 场景集合先定义默认场景，再对每个支持的尺寸、变体和显式状态至少定义一个场景。只有交互意义不能由单维场景说明时才加入关键组合。`themeComparison` 引用这些稳定 `scenarioId`。
3. 展示模块提供单一“恢复默认”入口，它只重置当前模块的本地状态。切换组件时卸载旧模块，自然清除其沙箱状态。
4. 需要 Provider 的组件只能使用 Album 专属的最小内存适配器。适配器不得导入服务端 Action、认证 Cookie 或生产数据获取逻辑。
5. 主题比较容器使用现有主题 class 和 token。它不调用 `setTheme`，不改写 `donmiss-theme`，也不触发全局 800ms 过渡。无指定挂载容器能力的浮层不在局部主题中展开。
6. 组件契约与展示元数据不一致时，以生产组件为准。实现应更正注册表或展示器，不应为让展示通过而悄悄改变生产契约。

### Initial inventory boundary

首次盘点以可视的 React 导出为单位，不以每个文件为单位。组合导出作为一个组件家族，例如 Card、Field、Dialog、DropdownMenu 和 Combobox。

| Category | Components and families to register |
| --- | --- |
| 布局与容器 | `Content`, `NeuSurface`, `NeuPanel`, `Card`, `Separator`, `Portal`, `Floating` |
| 按钮与导航 | `Button`, `StyledLink`, `ButtonGroup`, `CopyButton`, `Navbar`, `Footer`, `ThemeSwitcher`, `BlogOperationBar`, `BlogEditBar`, `BlogListOperationBar`, `TodoOperationBar`, `DailyOperationBar` |
| 表单与输入 | `Input`, `Textarea`, `InputGroup`, `InputField`, `Label`, `Field`, `Checkbox`, `Select`, `Combobox`, `TagEditor`, `TodoEditorBar`, `BlogEditor`, `MarkdownEditor`, `ChecklistForm`, `ToggleSwitch` |
| 反馈与状态 | `Badge`, `ProgressBar`, `Toaster`, `Message`, `Icon`, `PomodoroGlobalStatus`, `StatusIndicator`, `CountdownBadge` |
| 浮层与菜单 | `Dialog`, `AlertDialog`, `Popover`, `DropdownMenu`, `Modal`, `UserMenu`, `ChecklistDetailDialog`, `ChecklistItemDetailDialog` |
| 数据展示 | `Calendar`, `PomodoroCalendar`, `Tag`, `TagOperator`, `TagShowCase`, `FlipClock`, `FlipDigit`, `FlipTimer`, `ColorPanel`, `InfiniteRuler`, `Timeline`, `TimelineCard`, `TextGap`, `TOC`, `AdjacentBlogs`, `NotionBlock`, `Logo` 素材组 |
| 业务组件 | `ChecklistCard`, `ChecklistItemCard`, `BlogList`, `BlogListItem`, `ProfileCard`, `TodoItem`, `TodoDatePart`, `DailySummary`, `WeeklyView`, `WorkoutCard`, `WorkoutEditor`, `Pomodoro`, `PomodoroTimer`, `PomodoroHistoryPanel`, `PomodoroList`, `PomodoroOperationPanel` |

`ProtectedRoute`、`PermissionAccess` 和 `PomodoroTitleBridge` 等无独立可视表面的行为组件仍进入覆盖审计，但默认记录不建立视觉展示的原因。`SoundManager`、Toast 状态容器、Hook、类型、mock 数据、纯工具函数和原始 SVG 文件不是组件目录项。`Logo` 是单一可视素材家族。

### UI surface

| Surface | Input | Output | Access | Failure handling |
| --- | --- | --- | --- | --- |
| `/album` | `component` 查询参数 | 目录与选中组件详情 | 公开 | 未知标识回退到 `Button` 并提示 |
| 目录搜索 | 用户查询 | 按分类过滤的条目 | 公开 | 无结果显示清空查询入口 |
| `ready` 详情 | 注册表元数据与动态渲染器 | 说明、当前主题矩阵、四主题对比 | 公开 | 加载占位，独立错误和重试 |
| `pending` 详情 | 原因与接入需求 | 可操作的缺口说明 | 公开 | 不尝试加载渲染器 |

### Value sourcing

| Action | Value produced or displayed | Source |
| --- | --- | --- |
| 生成分类目录 | 分类、排序、名称和状态 | `CatalogCategory` 与 `CatalogEntry` |
| 搜索组件 | 匹配条目 | 用户查询和注册表可搜索字段 |
| 解析当前组件 | 当前条目、回退提示 | URL `component` 参数和默认 `button` 标识 |
| 显示组件说明 | 中文名、代码名、用途、适用场景、导入路径、能力 | 选中的 `CatalogEntry` |
| 加载展示 | React 展示模块 | `ReadyCatalogEntry.loadDemo` |
| 组合当前主题矩阵 | 尺寸、变体、状态和关键组合 | 组件公开属性、`capabilities` 与 `DemoScenario` |
| 组合四主题对比 | 主题名和代表展示 | `THEMES` 与 `themeComparison` 引用的 `scenarioId` |
| 重置样例 | 默认沙箱状态 | 展示模块的固定初始 fixture |
| 显示待接入项 | 原因和接入需求 | `PendingCatalogEntry` |
| 审计目录完整性 | 已登记家族与排除项 | 源码导出扫描结果与 `CoverageAuditEntry` |

### Key invariants

1. 注册表是目录、搜索、URL 解析和能力摘要的唯一来源。
2. `ready` 与 `pending` 是判别联合（通过状态字段保证字段配套正确）。`pending` 不能加载展示模块，`ready` 必须能加载。
3. Album 中任何互动都不得到达生产 Action、API 或数据库。
4. 局部主题对比不改变全局主题或主题存储。
5. 一个展示模块的加载或渲染失败不得使目录、URL 导航或其他组件不可用。
6. 生产组件契约优先于展示便利，Album 不创建平行控件或样式。
7. 覆盖扫描只用于测试期审计，不参与运行时目录生成。

### Security model

Album 公开只读。它可以更改浏览器内当前样例状态和现有主题选择，但不获取认证信息，不展示真实用户数据，不调用服务端写入。开发日志只记录组件标识和错误类型，不记录样例字段内容。本功能不引入新的合规范围。

### Configuration required

无新环境变量、密钥、外部服务或包依赖。

### Critical test scenarios

1. 未登录用户打开 `/album`，看到 `Button` 详情，页面为 `noindex` 且无业务数据请求，验证 **AC-1**、**AC-5**。
2. 用中文名、英文代码名、分类、关键词和路径搜索，结果分组正确，清空后恢复全量，验证 **AC-3**、**AC-4**。
3. 通过目录切换组件，刷新并执行前进和后退，再访问未知和 `pending` 标识，验证 **AC-5**。
4. 对 `Button`、`InputField`、`Dialog` 和一个业务组件操作单维场景、关键组合、恢复默认和四主题代表场景，确认无容器支持的浮层只在当前主题展开，验证 **AC-6** 到 **AC-9**。
5. 强制展示模块加载失败和渲染失败，确认局部提示、新加载尝试成功和目录持续可用，验证 **AC-11**。
6. 注册表与覆盖审计盘点所有现有可视导出和排除项，新增未分类导出时测试失败，验证 **AC-3**、**AC-10**、**AC-12**。
7. 在宽屏和窄屏中用键盘搜索、展开目录、选择组件、操作样例和恢复状态，并检查减少动效模式，验证 **AC-2**、**AC-7**、**AC-13**。
8. 运行 lint、build、Vitest 和 Album Playwright 场景，不需要新配置或截图基线，验证 **AC-14**、**AC-15**。

## Build plan

1. 打通 `Button` 的 Tracer Bullet：建立类型注册表、宽窄屏目录、搜索、`component` URL 同步、`noindex`、Button 完整矩阵和四主题对比，满足 **AC-1** 到 **AC-8**、**AC-13**。
2. 抽取展示模块契约、动态加载、沙箱重置、局部错误边界和安全 fixture，用 `InputField` 和 `Dialog` 验证表单与浮层路径，满足 **AC-6** 到 **AC-9**、**AC-11**、**AC-12**。
3. 按功能分类接入全部基础与复合组件，补齐元数据、稳定场景、四主题代表场景、源码覆盖审计和目录完整性测试，满足 **AC-3**、**AC-4**、**AC-6** 到 **AC-10**。
4. 用最小内存适配器接入业务组件，对无法安全展示的条目记录 `pending` 原因，确认无真实认证、网络或写入路径，满足 **AC-1**、**AC-9**、**AC-10**、**AC-12**、**AC-15**。
5. 完成 Vitest、Testing Library 和 Playwright 覆盖，在宽屏、窄屏、四主题、键盘、浏览器历史、加载失败和渲染失败中完成验证，满足 **AC-2**、**AC-5**、**AC-7**、**AC-8**、**AC-11**、**AC-13** 到 **AC-15**。

## Consequences

**Positive**:

1. 组件能力、主题适配和接入缺口有单一可浏览入口。
2. 明确的注册表与测试让组件增长可追踪，不需要新的运行服务。
3. 业务组件可在不触碰真实数据的前提下进行交互检查。

**Negative / tradeoffs**:

1. 显式注册表和专属展示模块需要持续手工维护。
2. 四主题与多状态展示会增加 Album 的测试面积和客户端代码量。
3. `pending` 保持缺口可见，但不保证首版就能互动展示每个行为组件。

**Neutral**:

1. Album 继续是一个公开路由，但不是 SEO 内容页。
2. 现有组件契约不因展示中心自动改变。

## Follow-up

1. [ ] 单独评估并修复 `InputField.fieldSize` 未向内部输入组件传递的现有问题。
2. [ ] 单独评估 `Icon` 硬编码颜色与四主题语义 token 的偏移。

## Rationale

决策过程、备选方案和现状盘点见 [rationale.md](rationale.md)。
