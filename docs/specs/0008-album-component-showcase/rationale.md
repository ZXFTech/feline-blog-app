# Rationale: 0008 · Album 组件展示中心

## Context

> ⚠️ Premise note: “展示所有组件”不应解释为自动运行 `src/components` 下每个文件。这会把 Hook、工具、需要真实认证的容器和具有写操作的组件混成一个不安全且无法维护的页面。正确边界是盘点所有可视 React 导出，安全的项目接入本地沙箱，其他项目保留为有原因的待接入状态。

现有 `/album` 是一个客户端页面，它平铺展示 ProgressBar、Toast、Icon、Button、Tag 和 InputField 的少量形态。它没有组件目录、分类、搜索、URL 选择、组件说明、四主题对比或 Album 专属测试。

项目已经有 light、dark、sugar 和 warm 四主题，也有 `Content`、`NeuSurface`、`NeuPanel` 和大量基础与业务组件。spec 0007 明确将 Showcase 产品化留给后续独立决策。本功能是该决策的实施规格，不重新设计现有组件契约。

参考图提供了左侧分类目录、右侧单组件详情、状态矩阵和尺寸分区的信息层级。项目现有 `design.md` 继续决定实际颜色、字体、间距、阴影、无障碍和响应式约束。

## Options considered

### Option 1: 在现有 Album 中建立显式注册表与按需展示模块

保留现有路由，用类型化元数据管理目录和能力，每个组件使用专属展示模块组合真实属性。

**Pros**:

1. 精确表达 React 无法自动推导的尺寸、变体、状态和适配要求。
2. 复用当前栈、主题、路由和测试工具，不引入新运行。

**Cons**:

1. 每个新组件都要同步维护元数据和展示模块。

### Option 2: 扫描文件系统并自动生成目录

构建时扫描 `src/components`，将发现的文件自动变成条目，再为特殊组件补充元数据。

**Pros**:

1. 新文件比较不容易在目录中完全消失。

**Cons**:

1. 文件不等于可视组件，扫描会误收 Hook、类型、工具、素材和内部子组件。
2. 它仍无法可靠推导业务 fixture、Provider、状态矩阵和安全边界。

### Option 3: 引入独立组件工作台

用专门的组件开发工具取代 `/album`，在应用之外维护展示故事。

**Pros**:

1. 可以获得成熟的隔离展示、文档和插件生态。

**Cons**:

1. 新增工具链、配置、升级和主题同步成本。
2. 本次需求是应用内公开页面，独立工作台不能直接提供同一访问路径。

### Option 4: 继续维护单页长列表

在现有页面继续增加面板，不建立目录、注册表或按需加载。

**Pros**:

1. 短期修改最少，简单组件容易直接追加。

**Cons**:

1. 组件数量增长后导航、加载、覆盖检查和定位都会迅速恶化。

## Rationale

显式注册表是当前需求下最简单的可维护边界。它能同时表达用户看到的分类、组件真实能力、安全适配方式和待接入缺口。动态展示模块让首屏不需一次加载所有业务组件，也将一个组件的错误限制在它自己的展示区。

展示场景按默认场景、单维覆盖和必要关键组合组织，避免无上限的笛卡尔积。源码覆盖审计弥补显式注册表无法自行发现漏项的弱点，但它只用于测试，不取代运行时目录。浮层只在现有挂载契约允许时进入局部主题，这保护生产组件不为展示需求改造。

文件系统扫描可以辅助盘点，但不能作为运行时契约。独立组件工作台在更大的组件库中有价值，但当前项目已有需要复用的应用外壳、四主题和公开路由，新增第二套运行不值得。

Tracer Bullet 从 `Button` 开始，因为它同时覆盖分类、搜索、URL、尺寸、变体、状态、主题和交互验证。这条纵向路径稳定后，基础组件、浮层和业务组件只需扩展同一契约。

## Existing system inventory

### Current Album coverage

| Area | Current coverage | Main gap |
| --- | --- | --- |
| ProgressBar | 数值、标签、语义色和自定义色 | 未覆盖尺寸、0 与 100 边界、超界输入 |
| Toaster | 普通、通知、错误、警告、成功 | 未结构化说明关闭、键盘、展开和拖拽状态 |
| Icon | 一个 search 图标和 danger 色 | 未覆盖尺寸与主题色 |
| Button | `xs`、`sm`、`md`、`lg`、`icon`，图标与 loading | 未直接展示五种 variant 和主要状态矩阵 |
| Tag | 图标、颜色和关闭 | 未展示 selectable 与联合交互 |
| InputField | `xs` 到 `3xl`，前后缀和清空 | 未展示 multiline、受控、disabled 和错误状态 |

### Existing reusable contracts

| Contract | Existing capability |
| --- | --- |
| ThemeProvider | light、dark、sugar、warm，使用 `donmiss-theme` 持久化 |
| NeuSurface | `raised`、`raised-sm`、`inset`、`inset-sm`、`flat` 与多种圆角 |
| NeuPanel | `compact`、`default`、`comfortable` 密度与 `stack`、`row`、`grid` 布局 |
| Button | `default`、`primary`、`danger`、`warning`、`success`，`xs`、`sm`、`md`、`lg`、`icon` |
| ProgressBar | `sm`、`md`、`lg`，多种语义色和标签格式 |
| InputField | 单行、多行、前后缀、清空、受控与非受控输入 |
| Tag | 静态、可选、可关闭与联合交互 |
| Toaster | 多语义消息、关闭、展开、Escape、拖拽与 `aria-live` |

### Known gaps outside this feature

1. `InputField.fieldSize` 当前未将视觉尺寸传递给内部 Input 或 InputGroup。
2. `Icon` 仍使用硬编码的旧颜色映射，与四主题语义 token 存在偏移。
3. Album 当前没有页面级测试，组件自身测试不能证明目录完整性、响应式或四主题展示。
