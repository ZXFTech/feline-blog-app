# Verify: Neu 表面与交互契约迁移 · spec 0002 · updated 2026-08-29

_步骤由 spec 0002 的 Enforcement 条目派生；该 spec 未单列 AC 编号，以下 AC-1 至 AC-6 依次对应 Enforcement 1 至 6。`/check verify` 运行这些步骤，`/test` 固化适合自动化的步骤。_

## UI / manual

- [x] 在 `/daily` 依次用鼠标、Enter 和空格选择不同日期 → 每次只产生一次 `${pathname}?date=${day.date}` 路由替换，选中按钮独占 `aria-pressed="true"` → AC-3、AC-4
- [x] 分别渲染静态、可选择、可关闭、可选择且可关闭的 Tag → 元素语义分别符合 spec；组合 Tag 点击正文只触发选择，点击关闭只触发关闭 → AC-2、AC-3
- [x] 检查字符串 Tag 的关闭按钮，以及使用非文本 children 并显式传入 `closeLabel` 的 Tag → 可访问名称分别来自 `移除${children}` 和调用方 `closeLabel` → AC-2、AC-3
- [x] 在 light、dark、sugar、warm 四个主题检查 WeeklyView、Tag、Navbar 和 BlogList 的默认及悬停状态 → 颜色、字体、尺寸、边框、圆角、间距、阴影、缩放和过渡与迁移前一致 → AC-1
- [x] 检查 Pomodoro 历史卡片的默认及悬停状态 → 卡片保持平面，悬停不再抬起；不存在其他新增视觉变化 → AC-1（2026-08-29 由工程师手工确认）
- [x] 检查 Navbar 与 BlogList → Navbar 的 raise 表面位于真实链接上；BlogList 的装饰性 raise 容器不获得链接或按钮语义 → AC-1、AC-5

## Commands

- [x] `pnpm lint` → 无 lint error → AC-1 至 AC-6
- [x] `pnpm exec tsc --noEmit` → 类型检查通过，非法表面/强度/Tag 行为组合及旧公开值不能编译 → AC-1、AC-2、AC-6
- [x] `pnpm build` → 生产构建通过 → AC-1 至 AC-6
- [x] `pnpm test` → NeuDiv、Tag、WeeklyView 和 Pomodoro 相关组件测试通过 → AC-2、AC-3、AC-4
- [x] `rg -n -U '<NeuDiv(?:(?!>).)*(onClick|role=["'']button["'']|tabIndex)' src --pcre2` → 生产代码无匹配 → AC-5
- [x] `rg -n 'neu-(raised|recessed)-(sm|normal)|neuType=' src --glob '!src/components/NeuButton/**'` → 生产代码无旧 Neu 表面接口或选择器匹配 → AC-6
- [x] 运行相关 `pnpm test:e2e` 场景 → WeeklyView、Tag、Navbar、BlogList 和 Pomodoro 页面行为通过 → AC-3、AC-4、AC-5

## Acceptance-criteria coverage

- AC-1：表面联合类型和样式不变要求，由四主题视觉检查、Pomodoro 例外检查、lint、typecheck、build 覆盖。
- AC-2：NeuDiv 与 Tag 组件契约，由四种 Tag 行为、关闭名称、组件测试和 typecheck 覆盖。
- AC-3：Tag 与 WeeklyView 的元素语义、事件隔离和键盘行为，由手工交互及组件测试覆盖。
- AC-4：WeeklyView 的选中状态与单次导航，由鼠标和键盘路由检查及组件测试覆盖。
- AC-5：生产代码不得用 NeuDiv 模拟操作控件，由页面语义检查和仓库扫描覆盖。
- AC-6：旧公开值及旧选择器完全移除，由 typecheck 和仓库扫描覆盖。

## Current known blocker

- 2026-08-29 重新验证时，`pnpm exec tsc --noEmit`、`pnpm build`、`pnpm lint` 和 `pnpm test` 均通过。
- WeeklyView 已在真实浏览器中通过鼠标、Enter、空格、URL 更新和单一 `aria-pressed="true"` 验证。
- seeded user `zxf_tech@Outlook.com` 可以登录但没有番茄钟历史记录；历史卡片的平面显示与悬停不抬起已于 2026-08-29 由工程师使用实际数据手工确认。
- 番茄钟 Playwright 套件有 7 项通过，3 项因 MariaDB 连接池在 10 秒内无法取得连接而失败；单 worker 重试结果相同。该问题与本次 Neu 表面迁移没有已确认的因果关系。
- 本轮按工程师决定先进入 `/test`，Scope 的 `Verify it` 保持未勾选，待补齐历史卡片运行时证据后再完成 `/check verify`。
