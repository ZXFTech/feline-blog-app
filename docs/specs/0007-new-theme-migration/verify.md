# Verify: newTheme 组件与样式迁移 · spec 0007

## Automated checks

1. [x] `pnpm install --frozen-lockfile` 成功，依赖与锁文件一致，验证 **AC-1**。
2. [x] `pnpm lint` 无错误，验证 **AC-1**、**AC-5**、**AC-12**。
3. [x] `pnpm exec tsc --noEmit` 通过，新接口、ref 和事件类型无断言逃逸，验证 **AC-5**、**AC-6**、**AC-7**。
4. [x] `pnpm build` 通过，全部正式路由可构建，验证 **AC-1**、**AC-9**、**AC-12**。
5. [x] `pnpm test` 通过，受影响组件与页面测试覆盖新契约，验证 **AC-4** 到 **AC-10**。
6. [x] 配置测试账号后运行 `pnpm test:e2e`，验证登录、文章、待办、日常记录、番茄钟和主题流程，验证 **AC-10**、**AC-13**、**AC-14**。

## Repository checks

1. [x] `src/app/layout.tsx` 只导入 `src/app/globals.css`，不再导入 `src/styles/index.scss`，验证 **AC-2**。
2. [x] 仓库搜索没有旧 `NeuDiv`、`NeuButton`、`NeuInput` 导入或旧 props，验证 **AC-6**、**AC-12**。
3. [x] 仓库搜索没有 `src/styles/_reboot.scss`、旧 Neu 专用样式引用或 `newTheme` 路径引用，验证 **AC-3**、**AC-12**。
4. [x] 仓库根目录不存在 `newTheme` 文件夹及其中的 manifest、lockfile、workspace 与配置文件，验证 **AC-12**。
5. [x] 每个删除的样式文件都有无引用搜索、成功构建和受影响页面运行证据，验证 **AC-3**。
6. [x] `src/app` 中不存在本轮新增的 `/showcase` 路由，验证 **AC-9**。

## Component checks

Button 和 Input 仍属于本规格的当前验收范围。Checklist 的独立组件契约由自动化组件测试验收，依赖正式业务入口的真实浏览器检查列在后续范围，不阻塞本规格关闭。

1. [x] Button 的五种 variant、五种 size、loading、disabled、ref、click、Enter 与 Space 都符合契约，验证 **AC-5**。
2. [x] styled Link 保持 anchor 语义、href、键盘导航与 ref，验证 **AC-6**。
3. [x] NeuSurface 只渲染非交互 div，不公开 `asChild`，验证 **AC-5**。
4. [x] Input、Textarea 与 InputGroup 覆盖前后缀、清除、受控、非受控、ref、提交和错误状态，验证 **AC-6**。
5. [x] Checkbox 与 Popover 覆盖鼠标、键盘、disabled、focus 和开关状态，验证 **AC-5**。
6. [x] Calendar 与 PomodoroCalendar 类型和行为彼此独立，验证 **AC-7**。

## Deferred Checklist browser checks

以下检查等待“Checklist 功能完善与交互验收”提供正式业务入口后执行。它们不是当前 `newTheme` 迁移的完成门槛，也不能在没有入口时标记通过。

1. [ ] ChecklistCard 的短按、Enter 与 Space 打开详情。ChecklistItemCard 的短按、Enter 与 Space 只触发 toggle，详情按钮与 500ms 长按打开详情，600ms 内不重复 toggle，验证 **AC-8**。
2. [ ] pointercancel、明显移动滚动和组件卸载取消长按计时，长按释放、编辑与删除不补发 toggle 或详情动作，验证 **AC-8**。
3. [ ] 两个详情弹窗使用 Base UI Dialog，并覆盖初始焦点、Tab 循环、Escape、遮罩关闭、背景隔离和焦点返回，验证 **AC-8**。

## Runtime matrix

1. [x] light、dark、sugar、warm 四个主题都能通过 ThemeSwitcher 选择并在刷新后从 `donmiss-theme` 恢复。用户切换时 `theme-transitioning` 存在 800ms 后移除，连续切换重新计时，`prefers-reduced-motion: reduce` 下不执行过渡，验证 **AC-4**。
2. [x] 无存储值时初始主题为 light，不读取旧 `feline-blog-theme`，不跟随系统主题，也不响应其他标签页变化，验证 **AC-4**。
3. [x] 全站滚动条不可见，但鼠标滚轮、触控板、触屏和键盘仍能滚动所有可滚动区域，验证 **AC-2**、**AC-10**。
4. [x] 当前正式页面支持的窄屏与宽屏范围内，全部关键操作可达且可执行，验证 **AC-10**、**AC-13**。
5. [x] `newTheme/app/page.tsx` 与 `newTheme/app/showcase/**` 的内容没有进入现有路由，验证 **AC-9**。

## Acceptance criteria coverage

1. **AC-1** 由冻结安装、版本检查、lint、类型检查、构建和测试覆盖。
2. **AC-2** 与 **AC-3** 由入口检查、样式引用证明、滚动验证和构建覆盖。
3. **AC-4** 由四主题、刷新、800ms 过渡、减少动态效果、旧键、系统主题和跨标签检查覆盖。
4. **AC-5** 与 **AC-6** 由基础组件、链接、输入族和正式页面行为检查覆盖。
5. **AC-7** 由两个 Calendar 的独立组件与领域流程检查覆盖。
6. **AC-8** 由当前自动化组件测试覆盖，接入正式业务入口后的真实浏览器检查延期到“Checklist 功能完善与交互验收”。**AC-9** 由路由缺失检查覆盖。
7. **AC-10** 与 **AC-11** 由页面簇回归和兼容层删除门槛覆盖。
8. **AC-12** 由仓库搜索、目录检查、构建和完整测试覆盖。
9. **AC-13** 与 **AC-14** 由运行矩阵、Playwright 和服务端边界检查覆盖。
