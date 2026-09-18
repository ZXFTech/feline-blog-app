# newTheme 组件与样式迁移：决策记录

## Context

> ⚠️ Premise note: 最初目标要求布局和样式完全不变，但后续决定采用 `newTheme` 视觉，并把验收边界改为功能一致。全局 CSS 替换与框架依赖同步升级也扩大了迁移风险。本规格以你确认的功能一致为准，并用分段替换控制风险。

现有应用同时使用 Sass 全局入口、项目自有 Neu 组件和生成式 ui 组件。`newTheme` 是独立 v0 项目，拥有另一套全局 CSS、主题 Provider、组件接口、依赖版本与路由。直接复制会重复加载 Tailwind，产生两个主题状态源，并让同一职责长期存在两套实现。

生产源码中 NeuDiv、NeuButton 与 NeuInput 分布在认证、文章、待办、日常记录、番茄钟、导航和个人资料等页面。Button、Calendar 与主题又各自存在命名相同但职责不同的实现。迁移必须保护业务行为，并在完成后消除双轨。

本轮不触碰数据库、API、认证或权限。主要风险来自框架升级、全局 CSS 切换、组件属性迁移、动态样式引用和全站回归范围。

## Options considered

### Option 1: 在现有组件内替换样式

保留 NeuDiv、NeuButton 与 NeuInput 接口，只把视觉 token 和样式换成 `newTheme`。（basis: 当前调用面与最低迁移成本）

**Pros**:

1. 页面改动较少，回归范围更容易控制。
2. 现有类型与测试可以直接复用。

**Cons**:

1. 无法采用你选择的 `base-nova` 最终接口。
2. 旧抽象和新生成组件会继续重叠。

### Option 2: 分段替换并最终收口

先建立新主题和最小组件路径，再按页面簇迁移调用，最后删除旧实现。（basis: 项目 Tracer Bullet 方法，活系统迁移的 strangler pattern）

**Pros**:

1. 每段都有可运行证据，失败可以回退到临时兼容层。
2. 最终只有一套正式接口和样式来源。

**Cons**:

1. 迁移期间需要管理临时适配与新旧依赖边界。
2. 完整收口需要覆盖大量页面和测试。

### Option 3: 一次性直接替换

同步替换全局 CSS、依赖、组件和全部调用方，然后集中修复。（basis: `newTheme` 独立项目结构）

**Pros**:

1. 没有中间兼容状态。
2. 最快暴露全部编译错误。

**Cons**:

1. 失败来源混在一起，很难区分依赖、CSS 与组件问题。
2. 任一关键页面阻塞都会让整个迁移不可用。

## Rationale

你要求最终采用 `newTheme` 接口与 `base-nova` 配置，因此只在旧组件内换皮不能满足目标。一次性替换又会把框架升级、全局样式和上百个调用点放进同一个失败域。

分段替换让每个 Tracer Bullet 都穿过依赖、样式、组件、页面与运行验证。它允许短期兼容，但把删除旧组件作为明确终点，避免临时方案永久化。原生交互语义继续继承 spec 0002 中有效的原则，其旧表面词汇和 Sass 契约则由本规格取代。

## Code inventory

### Theme and styles

1. 当前入口是 `src/app/layout.tsx` 到 `src/styles/index.scss`，再加载 variables、reboot、global、mixin、neu、components、Tailwind、animate 与 theme.css。
2. 当前主题使用 `data-theme`、`feline-blog-theme`、系统 dark 回退、跨标签同步和过渡。
3. `newTheme` 使用 `src/app/globals.css` 形式的 Tailwind 入口、html theme class、`donmiss-theme` 和 ThemeProvider。
4. 两边基础主题色大体相近，但 sugar primary、状态色、语义 token、圆角、字体尺寸、阴影和布局 token 存在差异。

### Component mapping

| `newTheme` source | Existing source | Migration note |
| --- | --- | --- |
| `ui/neu-surface` | `NeuDiv` 与 surface helper | 采用 elevation 与 radius 新接口，保留非交互语义 |
| `ui/button` | `NeuButton` 与 `ui/button` | 新 Button 只负责操作，链接使用 Link 加 variants |
| `ui/calendar` | 无通用对应物 | shadcn 重新生成，不取代领域日历 |
| `ui/checkbox` | 无直接对应物 | 迁入 Base UI 版本 |
| `ui/popover` | 无直接对应物 | 修正错误的 `cn` 包导入，复用 `@/lib/utils` |
| ThemeProvider 与 ThemeSwitcher | `src/lib/theme.ts` 与 Theme | 采用新实现与新存储键 |
| Checklist 组件与 modal | 无对应物 | 迁入正式组件目录，修正卡片行为并改用 Base UI Dialog |
| Showcase route family | 无对应物 | 本轮不迁入，后续单独评估 |
| `newTheme/app/page.tsx` | 现有首页 | 不迁入 |

### Usage and risk

1. NeuDiv、NeuButton 与 NeuInput 覆盖主要正式页面，必须逐页面验证。
2. `src/components/ui/button` 被其他 ui 组件内部依赖，替换会产生级联类型与样式变化。
3. 新通用 Calendar 依赖 React Day Picker，ChecklistForm 依赖 React Hook Form。
4. 动态 class、Sass `@use` 和全局 reset 可能隐藏文本搜索看不到的依赖。

## References

**Project sources**:

1. `AGENTS.md`，项目技术栈、Tracer Bullet 方法、验证命令与组件复用规则。
2. `src/AGENTS.md`，App Router、Content 布局、组件与测试约定。
3. `design.md`，四主题、新拟态语言、交互语义与可访问性方向。
4. `newTheme/`，目标 token、组件、依赖与原始展示实现。
5. spec 0002，Neu 表面与原生交互语义契约。
6. `typescript-react-patterns`，组件 props、ref、Context 和事件类型约定。
7. `migrate-radix-to-base`，shadcn 与 Base UI 的组件迁移、调用方检查和行为差异约定。
8. `react-hook-form`，ChecklistForm 的表单配置、订阅、校验与受控组件集成约定。
9. `tailwind-css`，Tailwind CSS 4 的 token、静态 class、响应式和渲染验证约定。

**Practices and standards**:

1. Tracer Bullet，用可运行的端到端切片逐步扩大覆盖。
2. Strangler pattern，在活系统中逐段替换并在验证后退役旧实现。
3. 原生 HTML 语义优先，视觉容器不模拟按钮或链接。
