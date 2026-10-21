# 0013. Blog 目录与阅读进度修复，决策依据

## Context

本规格承接 `docs/scope/scope.md` 的条目 30，属于现有 Web 功能增强，交付要求为 Beta，构建方式为 Tracer Bullet。条目 28 的正文与代码块已完成，本项沿用 spec 0012 的正文结构、标题生成规则和阅读密度。设计依据是现有 `design.md` 与主题组件。（basis: scope 30，spec 0012，`AGENTS.md`，`design.md`）

源码中的 TOC 只在挂载时扫描 `#blog-container` 的 H1 至 H3，其中包括正文之外的文章名称。进度只监听 `#content`，并将该区域全部内容作为分母。共享 Content 在容器宽度低于 1088px 时将主区改为自然高度和 `overflow: visible`，目录排到正文后方。目录使用固定灰、蓝配色，进度使用黑白配色。上述为源码事实；窄屏进度是否停滞、标题观察是否跳动，仍需真实浏览器复现，不能记录为已经验证的故障。

当前工作区已有正文修复、测试和文档的未提交改动。本项在这些成果上设计，后续实现只调整自身需要的接入点。阅读操作、页面错误状态、其余容器收口和作者操作仍由 scope 29、31、32、33 承接。

## Options considered

### Option 1: 在现有 TOC 中分别修补

补充窗口监听、主题类和依赖项，保留现有扫描、观察和进度三个逻辑块。优点是改动入口少，容易逐项比较。缺点是目录与进度仍可能使用不同的边界，布局变化和旧回调清理需要重复处理。（basis: `src/components/Blog/TOC.tsx`）

### Option 2: 在当前入口内统一文章阅读状态

保留 TOC 消费入口，将正文注册、滚动区域、几何测量和导航集中到一个文章实例，目录与进度消费同一结果。优点是能用统一规则验证位置与生命周期，回退限于本次组件接入。缺点是需要小幅调整详情组合和新增有类型的交互边界。（basis: `src/AGENTS.md`，`typescript-react-patterns`，spec 0012）

### Option 3: 新旧阅读组件并行后逐步切换

保留旧版并用显式开关接入新版，逐步替换消费方。优点是可以分批切换和快速回退。缺点是当前只有一个业务目录入口，维护两套监听和切换配置的成本超过收益。（basis: TOC 调用位置盘点，现有单入口及可逆组件替换）

## Rationale

本项需要同一套位置判断同时适用于两种滚动方式，并在正文高度变化后持续成立。按当前正文注册和测量，比修补彼此独立的全局元素查询更容易保证目录、进度和导航一致。单个业务入口可通过组件回退恢复，暂不引入并行版本或功能开关。

## References

**Project sources**:

1. `AGENTS.md`、`src/AGENTS.md`，服务端边界、共享组件、默认内边距、Album 及测试约定。
2. `docs/scope/scope.md`，条目 30 的范围和 Blog Beta 交付要求。
3. `docs/specs/0012-blog-content-codeblock/index.md`，正文、标题 slug、共享渲染和范围边界。
4. `docs/specs/0008-album-component-showcase/index.md`，安全样例与来源覆盖规则。
5. `design.md`、`src/app/globals.css`，主题语义、容器断点、阴影、间距和减少动态效果。
6. `src/components/Blog/TOC.tsx`、`src/components/Content/index.tsx`、`src/app/blog/[id]/page.tsx`、`src/components/ui/progress-bar.tsx`，当前入口、计算和滚动布局。
7. `.agents/skills/typescript-react-patterns/`、`.agents/skills/tailwind-css/`，有类型的 React 状态、引用和既有 Tailwind 约定。
