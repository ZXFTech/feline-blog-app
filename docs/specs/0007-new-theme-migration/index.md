# 0007. newTheme 组件与样式迁移

**Date**: 2026-09-16
**Updated**: 2026-09-18
**Status**: Accepted

## Summary

把 `newTheme` 的主题、视觉 token、基础组件和清单组件迁入正式应用。现有页面需要保持完整功能，但允许视觉和布局变化。迁移采用逐段替换，全部调用方通过验证后才删除旧组件、旧样式和 `newTheme` 文件夹。

## Requirements

**User stories**:

1. 作为现有用户，我希望组件升级后仍能完成原有操作，不因视觉体系变化失去任何功能。
2. 作为开发者，我希望正式应用只保留一套新主题和组件接口，后续页面无需在两套系统之间选择。
3. 作为开发者，我希望新基础组件和清单组件拥有独立测试，不依赖展示页面才能验证。

**Acceptance criteria**:

1. **AC-1**: `package.json` 和锁文件使用 `newTheme/package.json` 记录的 Next.js、React、React DOM、Tailwind CSS、Lucide、shadcn 和 Base UI 版本，并加入迁移所需的 React Hook Form 与 React Day Picker。升级后 lint、类型检查、构建和现有测试通过。
2. **AC-2**: `src/app/globals.css` 取代 `src/styles/index.scss` 作为唯一全局样式入口。两边仍被使用的 token、主题规则和通用工具合并到该文件，重复值统一使用 `newTheme` 名称，全站滚动条按 `newTheme` 规则隐藏。
3. **AC-3**: `src/styles/_reboot.scss` 被删除。每个其他样式文件只有在仓库搜索、构建和页面验证都证明无引用且无运行作用后才删除，仍被组件使用的 Sass 可以保留。
4. **AC-4**: 应用使用 `newTheme` 的 `ThemeProvider`、`ThemeScript`、主题 class 和 `donmiss-theme` 存储键。默认主题为 light，支持 light、dark、sugar、warm。用户切换主题时，颜色、背景、边框、描边、填充与阴影使用 800ms ease 过渡，系统要求减少动态效果时取消过渡。不保留旧键、系统主题回退、跨标签同步或额外的存储失败恢复。
5. **AC-5**: `Button`、`buttonVariants`、`NeuSurface`、`Checkbox`、`Popover` 与由 shadcn CLI 重新生成的通用 `Calendar` 成为正式基础组件。Button 支持 `newTheme` 的 variant、size、loading、disabled、ref 与键盘行为，NeuSurface 始终渲染非交互 `div` 且不公开 `asChild`。
6. **AC-6**: 所有链接式旧按钮迁为 Next.js `Link` 加 `buttonVariants`。所有旧 `NeuInput` 调用迁为 `base-nova` 的 Input、Textarea 与 InputGroup 组合，原有前缀、后缀、清除、受控输入、非受控输入、ref、表单和错误反馈能力保持可用。
7. **AC-7**: 现有领域日历改名为 `PomodoroCalendar`，继续保留记录日期、月份切换、日期键盘导航和番茄钟历史行为。新通用 `Calendar` 只承担通用日期选择与 ChecklistForm 的日期输入。
8. **AC-8**: ChecklistCard、ChecklistItemCard、ChecklistForm、两个详情弹窗和清单类型迁入正式源码，但不接数据库、服务端接口、正式导航或业务入口。ChecklistCard 的短按、Enter 与 Space 打开详情。ChecklistItemCard 的短按、Enter 与 Space 切换完成状态，长按打开详情，并有独立详情按钮作为键盘入口。编辑、删除、切换和详情事件彼此隔离。本轮用组件测试验证这些无入口组件的契约。依赖正式 Checklist 业务入口的真实浏览器交互验收延期到后续“Checklist 功能完善与交互验收”。
9. **AC-9**: `newTheme/app/page.tsx`、完整 `/showcase` 路由族、展示导航与展示数据不迁入正式应用。Showcase 是否进入产品留到后续单独决定。
10. **AC-10**: 现有正式页面的点击、键盘、链接、加载、禁用、表单、错误反馈、主题选择和响应式可用性保持一致。颜色、阴影、圆角、字号、控件尺寸和页面布局允许采用新体系后的结果。
11. **AC-11**: 迁移期间允许页面级临时兼容层。一个页面只有在相关组件测试和真实页面回归通过后才能删除旧依赖，迁移完成后不得保留新旧组件长期双轨。
12. **AC-12**: 所有调用方迁入新接口后，旧 NeuDiv、NeuButton、NeuInput、旧专用样式、确认无引用的样式文件和整个 `newTheme` 文件夹被删除。仓库中不存在旧组件导入、旧属性、第二份 manifest、锁文件或工作区配置。
13. **AC-13**: 四个主题、当前正式页面支持的响应式范围和受影响的正式用户流程都有可重复验证。验证包含 lint、类型检查、构建、Vitest、需要测试账号的 Playwright 和真实浏览器检查。
14. **AC-14**: 本轮不改变数据库模式、服务端 API、认证、权限或业务数据流，不新增环境变量，也不引入 `newTheme` 根布局中的 Analytics。

## Decision

**Chosen option**: Option 2: 分段替换并最终收口

采用 Tracer Bullet 逐段打通主题、基础组件和页面调用。每段都交付可运行结果，旧接口只作为临时迁移手段，最终只保留迁入后的 `base-nova` 组件体系。（basis: 项目 Tracer Bullet 方法，活系统迁移的 strangler pattern）

**Implementation skills**: `typescript-react-patterns` (`asyrafhussin/agent-skills`, `.agents/skills/typescript-react-patterns/`) · `migrate-radix-to-base` (`shadcn-ui/ui`, `.agents/skills/migrate-radix-to-base/`) · `react-hook-form` (`pproenca/dot-skills`, `.agents/skills/react-hook-form/`) · `tailwind-css` (`paulrberg/agent-skills`, `.agents/skills/tailwind-css/`)

## Feature design

### Package and generator target

1. 以 `newTheme/package.json` 为版本目标，同步 Next.js `16.3.3`、React 与 React DOM `19.2.4`、Tailwind CSS `4.3.3`、Lucide `1.16.0`、shadcn `4.11.0`、Base UI `1.5.0` 和相关 PostCSS 版本。
2. 加入 React Hook Form `7.88.0`。Calendar 通过目标版本的 shadcn CLI 重新生成，CLI 解析出的 React Day Picker 版本写入锁文件，不手工复制旧生成结果。
3. `components.json` 切换到 `base-nova`，CSS 路径指向 `src/app/globals.css`，其余别名继续指向现有 `@/*` 结构。
4. 不迁入 `@vercel/analytics`、`cn` 包、独立 Next 配置、独立 TypeScript 配置或 `newTheme` 的 package 与 workspace 文件。

### Global style contract

1. `src/app/layout.tsx` 只引入 `src/app/globals.css` 作为全局样式入口，不再引入 `src/styles/index.scss`。
2. 新文件以 `newTheme/app/globals.css` 为主体，补入现有应用仍实际需要的 token、主题值、动画和通用工具。相同含义的 token 只保留 `newTheme` 名称，调用方同步迁移。
3. 全局保留隐藏滚动条规则与 `no-scrollbar` 工具。滚动能力不能被关闭，键盘与触控滚动继续可用。
4. 删除 `_reboot.scss`。其他 Sass 文件按引用与运行证据逐个判断，不以扩展名批量删除。
5. 第一阶段即启用唯一 `globals.css` 与新 ThemeProvider。未迁移页面通过临时旧 token 与旧 selector 映射读取同一主题，不得再次加载 Tailwind、reset 或第二份全局入口。映射随调用方迁移逐步删除。

### Theme contract

1. `ThemeProvider` 在根布局中提供 `{ theme, setTheme }`，`useTheme` 在 Provider 外调用时抛出明确错误。
2. `ThemeScript` 在 hydration 前读取 `donmiss-theme` 并应用 `.dark`、`.sugar` 或 `.warm`。没有有效值时保持 light。
3. 主题切换器使用 `newTheme` 的视觉与 Context。旧 `feline-blog-theme` 值不迁移，系统颜色偏好不参与选择，其他标签页的变化不触发同步。
4. 本规格接受 `newTheme` 当前的存储写入行为。写入失败时允许本次切换失败，不补充旧实现的恢复逻辑。
5. 用户主动切换主题时，根元素添加 `theme-transitioning`，全局颜色、背景、边框、描边、填充与阴影使用 `--duration-theme: 800ms` 和 `ease` 过渡。800ms 后移除该 class，连续切换时重新计时。`prefers-reduced-motion: reduce` 下不执行过渡，首次加载与刷新恢复主题时也不执行入场过渡。

### Canonical component interfaces

| Component | Final contract | Replaces |
| --- | --- | --- |
| `Button` | Base UI button，`variant=default|primary|danger|warning|success`，`size=xs|sm|md|lg|icon`，支持 loading、disabled 与 button ref | `NeuButton` 与旧 ui Button 的操作职责 |
| styled link | Next.js `Link` 加 `buttonVariants`，链接属性与 anchor ref 保持原生类型 | `NeuButton buttonType="link"` |
| `NeuSurface` | 非交互 `div`，`elevation=raised|raised-sm|inset|inset-sm|flat`，`radius=sm|md|lg|xl|full`，无 `asChild` | `NeuDiv` 与 `neuSurfaceClassNames` |
| input family | `base-nova` Input、Textarea、InputGroup 组合，使用原生 input 与 textarea 类型 | `NeuInput` |
| `Checkbox` | Base UI checkbox，保留 checked、disabled、invalid、focus 与 keyboard 契约 | 净新增 |
| `Popover` | Base UI popover，包含 Root、Trigger、Content、Header、Title、Description | 净新增 |
| checklist dialogs | Base UI Dialog，提供焦点约束、Escape、遮罩关闭、背景隔离与焦点返回 | 两个 showcase detail modal |
| `Calendar` | shadcn CLI 重新生成的通用日期选择器，再应用 `newTheme` token 和视觉 | 净新增 |
| `PomodoroCalendar` | 保留现有番茄钟领域日历全部行为，只改名与新 token | 现有 `Calendar` |

组件 props 使用 interface，互斥行为使用联合类型，DOM props 通过 `ComponentPropsWithoutRef` 派生。ref 必须指向真实 DOM 元素，事件使用 React 原生事件类型，不通过类型断言伪造 input 与 textarea 的公共接口。（basis: `typescript-react-patterns`）

### Checklist components

1. 清单组件保持 `newTheme` 的展示与表单能力，数据只来自组件 props。本轮不迁入 `showcase-data`、`showcase-nav` 或任何 Showcase 页面。
2. 整卡行为不得用 `role="button"` 的 `div` 模拟。详情、切换、编辑与删除使用并列的原生交互元素，避免嵌套按钮。（basis: spec 0002 的原生语义原则）
3. ChecklistCard 的短按、Enter 与 Space 打开详情。ChecklistItemCard 的短按、Enter 与 Space 调用 `onToggle`，独立详情按钮打开详情，500ms 长按也是详情快捷方式。
4. ChecklistItemCard 在 600ms 内只允许一次 toggle。pointercancel、明显移动滚动和组件卸载都取消长按计时。长按释放不得补发 toggle，编辑、删除与详情按钮不得启动长按。
5. 两个详情弹窗改用同一个 Base UI Dialog 结构。打开时焦点进入弹窗，Tab 保持在弹窗内，Escape 与遮罩可以关闭，背景不可操作，关闭后焦点返回触发器。
6. 本轮不为 Checklist 增加临时 Showcase 或测试专用产品路由。卡片交互、长按取消、节流和 Dialog 焦点契约由组件测试验收。接入正式 Checklist 业务入口后的真实浏览器验收属于后续“Checklist 功能完善与交互验收”。

### State and persistence

本功能没有数据库实体或服务端状态。唯一新增持久状态是浏览器 localStorage 中的 `donmiss-theme` 字符串，允许值为 `light`、`dark`、`sugar`、`warm`。

主题状态转换为任意主题到任意主题。页面刷新时由 ThemeScript 读取已保存值，无值或无效值进入 light。

### UI surface

| Surface | Input | Output | Access | Failure handling |
| --- | --- | --- | --- | --- |
| ThemeProvider | `children` | 当前主题与 setter | 全站 | Provider 外 hook 抛错，存储写失败允许切换失败 |
| Button | variant、size、loading、disabled、原生 button props | 原生 button 事件与状态 | 全站 | loading 与 disabled 阻止操作 |
| styled Link | href、buttonVariants、原生 anchor props | 客户端导航 | 全站 | 由 Next.js Link 处理无效目标 |
| input family | 原生字段 props、组合前后缀 | 输入值、change、ref、错误状态 | 全站 | 表单显示现有错误反馈 |
| Calendar | React Day Picker props | 选中日期或日期范围 | 表单组件 | 无可选日期时保持可理解空状态 |
| checklist dialogs | open、详情数据、关闭回调、触发器 ref | 可访问详情弹窗 | 尚无产品入口 | Escape、遮罩与显式关闭按钮关闭并恢复焦点 |

### Value sourcing

| Action | Value produced or displayed | Source |
| --- | --- | --- |
| 初始化主题 | 当前 theme | `donmiss-theme`，无有效值时为 light |
| 切换主题 | html theme class 与 Context 值 | 用户选择的 Theme 值 |
| 渲染按钮 | variant、size、loading、disabled | 调用方 props 与组件默认值 |
| 渲染输入组合 | 值、前后缀、清除入口、错误状态 | 调用方原生字段 props 与表单状态 |
| 选择日期 | Date 或日期范围 | React Day Picker 的受控或非受控 props |
| 渲染 Checklist | 清单、项目、倒计时与主题色 | 组件 props |
| ChecklistItem 操作 | toggle、详情、编辑或删除意图 | 对应原生控件事件、500ms 长按阈值与 600ms toggle 节流 |
| 打开详情弹窗 | 标题、正文、初始焦点与返回目标 | 组件 props、Dialog primitive 与触发器 ref |

### Key invariants

1. 表面视觉不能赋予元素交互语义，交互必须由 button、anchor、input 或其他原生元素承担。
2. 同一职责在迁移完成后只有一个正式组件接口和一个样式来源。
3. 旧页面的业务调用、路由目标、数据读写和权限检查不得因组件迁移改变。
4. 通用 Calendar 与 PomodoroCalendar 的职责和类型不得互换。
5. 删除文件必须有无引用搜索、构建和运行验证三项证据。

### Security model

清单组件本轮没有页面入口，也不调用 Action 或 API。正式页面继续使用现有认证和权限边界，本规格不改变任何服务端授权。

### Configuration required

不新增环境变量、密钥或外部服务配置。

### Critical test scenarios

1. 四个主题中刷新与切换页面，ThemeScript 和 ThemeProvider 使用 `donmiss-theme` 得到预期 class。用户切换时 `theme-transitioning` 保持 800ms 后移除，连续切换重新计时，减少动态效果时不执行过渡，验证 **AC-4**。
2. Button 的全部 variant、size、loading、disabled、ref、鼠标与键盘行为通过，styled Link 使用真实链接语义，验证 **AC-5**、**AC-6**。
3. 原 NeuInput 页面继续支持 input、textarea、前后缀、清除、受控值、ref、提交与错误提示，验证 **AC-6**、**AC-10**。
4. PomodoroCalendar 继续完成月份导航、日期选择、记录显示与键盘操作，新 Calendar 独立完成表单日期选择，验证 **AC-7**。
5. 组件测试验证 ChecklistCard 的短按、Enter 与 Space，以及 ChecklistItemCard 的短按、Enter、Space、详情按钮、500ms 长按、取消和 600ms 节流契约，验证 **AC-8**。正式业务入口中的真实浏览器交互留给后续“Checklist 功能完善与交互验收”。
6. 组件测试验证两个详情弹窗的初始焦点、Tab 循环、Escape、遮罩关闭、背景隔离和焦点返回，验证 **AC-8**。正式业务入口中的真实浏览器焦点验收留给后续“Checklist 功能完善与交互验收”。
7. 受影响的登录、文章、待办、日常记录、番茄钟和主题流程在现有视口范围内继续完成，验证 **AC-10**、**AC-13**。
8. 删除旧文件前后运行引用搜索、类型检查、构建和测试，确认没有旧导入或隐式样式依赖，验证 **AC-3**、**AC-11**、**AC-12**。

## Build plan

1. 升级目标依赖与 `components.json`，建立并立即启用唯一 `src/app/globals.css` 与新 ThemeProvider，加入旧 token 和 selector 临时映射，并打通 NeuSurface 与 Button 的组件测试，满足 **AC-1**、**AC-2**、**AC-4**、**AC-5**。
2. 迁移全站 Button、styled Link、Input、Textarea、InputGroup、NeuSurface 和相关 ui 依赖。按页面簇逐批验证，旧接口仅在未完成页面保留临时适配，满足 **AC-5**、**AC-6**、**AC-10**、**AC-11**。
3. 重新生成 shadcn Calendar，迁入 Checkbox、Popover、Checklist 领域类型、三个清单组件和基于 Base UI Dialog 的两个详情弹窗，落实卡片短按、键盘、长按、取消和节流契约，并确认不迁入 Showcase 路由与展示数据，满足 **AC-7**、**AC-8**、**AC-9**。
4. 迁移并改名 PomodoroCalendar，删除 `_reboot.scss`，逐步删除旧 token 与 selector 映射，并按证据删除未使用样式，收口四主题和响应式页面验证，满足 **AC-2**、**AC-3**、**AC-7**、**AC-10**、**AC-13**。
5. 删除旧 Neu 组件、旧专用样式与整个 `newTheme` 文件夹，运行完整静态检查、构建、Vitest、Playwright 和真实浏览器矩阵，满足 **AC-1**、**AC-11**、**AC-12**、**AC-13**、**AC-14**。

## Migration plan

**Strategy**: strangler，按页面簇逐步切换，最终一次清理旧实现

**Phases**:

1. 新 ThemeProvider、唯一 `globals.css`、临时旧 token 映射与最小基础组件先通过组件测试和一个现有正式页面，证明升级后的构建、主题和组件运行成立。
2. 正式页面按组件族和页面簇迁移。每个页面在功能回归通过前继续使用临时兼容层。
3. 清单组件、通用 Calendar 与可访问详情弹窗迁入，不接业务数据或页面入口。
4. 删除临时 token 映射，完成样式文件清理和旧组件删除。

**Rollback**: 每个阶段保留独立提交边界。某页面回归失败时回退该页面到临时兼容层，不提前删除旧组件。依赖升级或全局 CSS 导致系统性失败时回退当前阶段的依赖、锁文件和入口改动。

**Risks**:

1. 全局 CSS 替换和框架依赖同步升级扩大了变更面，可能暴露与组件迁移无关的兼容问题。
2. 全局隐藏滚动条会降低滚动区域的可发现性，必须验证键盘、触控和鼠标滚轮仍可用。
3. 删除旧 Sass 时，动态 class 或间接 `@use` 可能无法只靠文本搜索发现。
4. shadcn CLI 的重新生成结果可能与 `newTheme` 文件不同，套用视觉时必须保留生成组件的行为和类型契约。

## Consequences

**Positive**:

1. 正式应用只保留一套主题 token、基础组件和生成配置。
2. 新组件使用明确的原生语义和严格 TypeScript 接口。
3. 新组件通过独立测试验证，不依赖产品化展示页面。

**Negative / tradeoffs**:

1. 用户会失去旧主题选择，系统主题、跨标签同步和存储失败恢复也会消失。主题切换需要等待 800ms 才完全稳定，但减少动态效果偏好会关闭这段过渡。
2. 视觉与布局可以改变，因此本迁移不提供像素级回归保证。
3. 同时升级框架与迁移组件增加定位失败原因的成本。
4. 全站隐藏滚动条会降低部分用户对可滚动区域的识别能力。

**Neutral**:

1. 数据库、服务端接口、认证和权限不变。
2. 迁移期间存在短期兼容层，完成后必须全部删除。
3. 本规格完成只证明 Checklist 组件源码和独立组件契约已经迁入，不代表尚未建立的 Checklist 正式业务流程已经通过真实浏览器验收。

## Follow-up

1. [ ] Showcase 页面、导航和展示数据留待后续单独评估，本轮不迁入任何 `/showcase` 路由。
2. [ ] “Checklist 功能完善与交互验收”已登记为 scope 25。正式业务入口完成后，在真实浏览器中验收卡片短按与键盘操作、500ms 长按、取消、600ms 节流，以及 Dialog 的焦点约束、Tab、Escape、遮罩关闭、背景隔离和焦点返回。

## Rationale

决策背景、备选方案、代码盘点与参考来源见 [rationale.md](./rationale.md)。验证矩阵见 [verify.md](./verify.md)。
