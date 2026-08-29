# 0002. Neu 表面语义与交互契约

**Date**: 2026-08-29
**Status**: Accepted

## Summary

Neu 表面样式与 HTML 交互语义分开管理。`NeuDiv` 只表示非交互容器，按钮、链接和标签使用正确的原生元素，同时从同一个函数取得新拟态样式。本轮只调整代码结构，唯一获准的视觉变化是 Pomodoro 历史卡片取消悬停抬起效果并改为平面显示。

决策背景、备选方案和取舍记录见 [rationale.md](./rationale.md)。

## Decision

**Chosen option**: Option 1: 共享样式函数与语义元素

采用单次迁移。表面类型、交互效果和 HTML 元素各自表达一个概念，类型与 Sass 支持范围必须完全一致。

**Implementation skills**: `typescript-react-patterns` (`asyrafhussin/agent-skills`, `.agents/skills/typescript-react-patterns/`)

## Standard definition

### Canonical pattern

视觉表面由 `neuSurfaceClassNames` 生成。真实行为由 `div`、`button`、`span` 或 `Link` 的原生语义表达。组件不得通过给 `div` 补充角色和键盘事件来模拟已有的原生交互元素。

```tsx
<NeuDiv surface="embossed">稳定面板</NeuDiv>

<button
  type="button"
  aria-pressed={selected}
  className={neuSurfaceClassNames({
    surface: "embossed",
    className: "text-left",
  })}
  onClick={selectDate}
>
  日期内容
</button>
```

### 表面词汇

1. `embossed` 表示稳定抬起的表面。
2. `debossed` 表示稳定内凹的表面。
3. `flat` 表示无阴影表面。
4. 表面强度使用独立的 `NeuSurfaceIntensity`，只允许 `sm` 和 `normal`。
5. `interactionEffect="raise"` 表示现有的悬停抬起效果。它只控制视觉，不会添加按钮或链接语义。
6. `interactionEffect="raise"` 只允许与 `surface="flat"` 组合。基础态保持平面，悬停态按同一强度使用现有抬起阴影和缩放。
7. Neu 表面删除公开值 `raised`、`recessed`、`elevated` 和 `lg`，不提供兼容别名。`NeuButton` 的类型不在本决策范围内。

### 共享接口

```tsx
type NeuSurface = "embossed" | "debossed" | "flat";
type NeuSurfaceIntensity = "sm" | "normal";
type NeuInteractionEffect = "raise";

interface NeuSurfaceBaseOptions {
  surface?: NeuSurface;
  intensity?: NeuSurfaceIntensity;
  className?: string;
}

type NeuSurfaceOptions =
  | (NeuSurfaceBaseOptions & {
      surface?: "embossed" | "debossed";
      interactionEffect?: never;
    })
  | (NeuSurfaceBaseOptions & {
      surface: "flat";
      interactionEffect?: NeuInteractionEffect;
    });

function neuSurfaceClassNames(options?: NeuSurfaceOptions): string;
```

函数必须复用 `cn`。它负责当前的背景、文字、边框、圆角、间距、过渡和表面类名。调用方的 `className` 最后合并，以保留当前覆盖能力。

`flat` 必须显式成为受支持的分支，但不输出表面阴影类。它只输出公共基础类，因此不会通过新增 `box-shadow: none` 覆盖调用方样式。

`NeuSurface`、`NeuSurfaceIntensity` 和 `NeuInteractionEffect` 是新的独立类型。不得缩小现有 `NeuButton` 使用的 `NeuIntensity` 或 `NeuButtonType`。

### NeuDiv

```tsx
interface NeuDivProps extends ComponentPropsWithoutRef<"div"> {
  surface?: NeuSurface;
  intensity?: NeuSurfaceIntensity;
}

const NeuDiv = forwardRef<HTMLDivElement, NeuDivProps>(...);
```

`NeuDiv` 始终渲染 `div`。它不得提供 `as`、`onSelect` 或交互效果属性。原生 `div` 属性继续透传，但生产代码不得用 `onClick`、`role="button"` 或 `tabIndex` 将它伪装成操作控件。

### WeeklyView

日期卡片渲染为 `button type="button"`。它通过 `neuSurfaceClassNames` 取得与当前 `NeuDiv` 相同的默认表面样式，并用 `aria-pressed={selectedDateStr === day.date}` 表达选中日期。Enter 和空格使用原生按钮行为，不增加手写键盘监听。

按钮只执行一次路由替换，目标为 `${pathname}?date=${day.date}`。删除当前未使用的 `onDateSelect` 属性，不同时调用回调和路由。

按钮重置只能抵消浏览器默认按钮外观。迁移前后的颜色、字体、尺寸、边框、圆角、间距和阴影必须一致。

### Tag

Tag 使用联合类型表达合法行为。它不再继承宽泛的 `HTMLAttributes<HTMLElement>`，避免与 React 原生 `onSelect` 冲突。

```tsx
interface BaseTagProps {
  children: ReactNode;
  color?: string;
  icon?: IconType;
  className?: string;
  style?: CSSProperties;
  containerProps?: Omit<
    ComponentPropsWithoutRef<"span">,
    "children" | "className" | "style" | "onClick" | "onSelect"
  >;
}

type StaticTagProps = BaseTagProps & {
  onSelect?: never;
  onClose?: never;
};

type SelectableTagProps = BaseTagProps & {
  onSelect: () => void;
  onClose?: never;
};

type ClosableTagProps = BaseTagProps & {
  onSelect?: never;
  onClose: () => void;
  closeLabel?: string;
};

type SelectableClosableTagProps = BaseTagProps & {
  onSelect: () => void;
  onClose: () => void;
  closeLabel?: string;
};
```

纯展示 Tag 使用 `span`。可选择 Tag 使用单个 `button type="button"`，该按钮承载完整表面。可关闭 Tag 使用外层 `span` 和独立关闭按钮。同时可选择和可关闭时，正文按钮与关闭按钮作为外层 `span` 的并列子元素。关闭不得触发选择。

组合 Tag 的外层 `span` 承载统一表面、颜色、边框、圆角、间距和布局。内部正文按钮与关闭按钮使用无外观重置，不各自生成独立表面。最终仍呈现为一个完整 Tag，而不是两个新拟态小块。

`className`、`style`、`color`、`icon` 和 `containerProps` 作用于外层表面。`onSelect` 只作用于正文按钮，`onClose` 只作用于关闭按钮。本轮不新增 Tag ref。旧 `onClick` 映射为 `onSelect`，旧 `closable` 由是否提供 `onClose` 取代。

`children` 是字符串 `x` 时，默认关闭名称精确生成为 `移除${x}`。`children` 不是字符串时，`closeLabel` 必须由调用方提供。关闭图标不得直接承载点击事件。

### 现有悬停效果

Navbar 中确有导航含义的现有抬起效果迁移到链接元素，并通过 `surface="flat" interactionEffect="raise"` 保持计算样式不变。

BlogList 当前没有整卡点击目标。它保留非交互容器和现有装饰性抬起效果，通过 `neuSurfaceClassNames({ surface: "flat", interactionEffect: "raise" })` 保持视觉不变。该效果不得被解释为整卡可点击，也不得由实现者发明导航目标。

Pomodoro 历史卡片取消 `raise` 悬停效果，改为 `flat`。这是本轮唯一获准的视觉变化。

### Replaces

1. 用 `NeuDiv` 的 `onClick`、`role="button"` 或 `tabIndex` 模拟按钮。
2. 用 `raised` 或 `recessed` 同时表达静态表面和悬停行为。
3. 允许类型生成 Sass 没有实现的组合。
4. 直接给图标绑定 Tag 关闭事件。

### Enforcement

1. 编译期联合类型只允许已实现的表面、强度和 Tag 行为组合。
2. NeuDiv 组件测试覆盖默认值、每个合法表面、两档强度、类名覆盖、原生属性和引用透传。
3. Tag 组件测试覆盖四种行为组合、元素语义、关闭名称、事件隔离和键盘操作。
4. WeeklyView 组件测试覆盖按钮角色、选中状态、Enter、空格和单次导航。
5. 仓库搜索不得发现生产代码给 `NeuDiv` 传入 `onClick`、`role="button"` 或 `tabIndex`。
6. 类型检查不得发现旧公开值。

### Rollout

采用一个迁移变更完成共享函数、类型、Sass、NeuDiv、Tag、WeeklyView 和全部生产引用。先落共享函数与类型，再逐一迁移引用，最后删除旧值和未使用规则。每一步都保持可编译。

特殊迁移点如下。

1. WeeklyView 将可点击日期 `NeuDiv` 改成原生按钮，并删除未使用的 `onDateSelect`。
2. Tag 将 `onClick` 改成 `onSelect`，将 `closable` 改成 `onClose` 是否存在，并迁移所有调用点。
3. Navbar 将抬起效果放到真实链接元素。
4. BlogList 保留非交互容器与装饰性抬起效果。
5. Pomodoro 历史卡片取消抬起效果并改为平面显示。
6. 其他引用把 `neuType` 机械迁移为 `surface`。
7. 使用 `rg` 确认生产代码中没有旧 `NeuDiv` 属性、旧表面值或伪按钮用法。

删除不再使用的 `.neu-raised-*` 与 `.neu-recessed-*` 选择器。NeuButton 仍需要的类型或 Sass mixin 必须保留。

回滚时整体还原该迁移，不保留新旧接口并存状态。

### 样式不变验证

1. 修改代码前，使用项目锁定的 Playwright Chromium 和 `1280 × 720` 视口生成计算样式 JSON 基线。
2. 基线覆盖 `embossed`、`debossed` 和 `flat` 在 `sm` 与 `normal` 下的默认与悬停状态。
3. 在 light、dark、sugar 和 warm 四个主题中记录背景、文字、边框、圆角、间距、阴影、缩放和过渡。
4. 对 WeeklyView、Tag、Navbar、BlogList 和 Pomodoro 保存定点计算样式与截图证据。
5. 迁移后逐字段比较。允许的唯一差异是 Pomodoro 历史卡片不再出现悬停抬起效果。
6. 运行 `pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm build`、`pnpm test` 和相关 `pnpm test:e2e` 场景。

### Exceptions

BlogList 可以在非交互容器上保留装饰性 `raise`，因为你要求保持现有视觉。它不是交互语义先例。除此之外没有生产代码例外。测试可以验证 `NeuDiv` 透传原生属性，但不得把该能力描述为推荐的交互模式。

## Consequences

**Positive**:

1. 表面样式和 HTML 语义可以独立演进。
2. 无实现的类型组合在编译期消失。
3. WeeklyView 与 Tag 获得原生键盘行为。

**Negative / tradeoffs**:

1. 本轮需要迁移所有旧引用。
2. Tag 类型和渲染分支会比当前实现更长。
3. 共享函数成为新拟态样式的公共入口，修改它需要更完整的回归验证。

**Neutral**:

1. 不增加依赖、环境变量、数据迁移或服务端接口。
2. Pomodoro 历史卡片的装饰性悬停抬起效果被明确移除。

## Follow-up

1. [ ] 提交 `focus-visible` 视觉方案供你批准。方案需要为四个主题定义可见但克制的键盘焦点样式，在批准前不得实现。
2. [ ] 提交减少动态效果方案供你批准。方案需要在 `prefers-reduced-motion: reduce` 下关闭缩放与旋转，在批准前不得实现。
