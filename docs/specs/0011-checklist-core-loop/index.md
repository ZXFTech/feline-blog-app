# 0011. 确认清单核心闭环

**Date**: 2026-09-20
**Updated**: 2026-09-23
**Status**: In Progress

**交互修订确认**: 2026-09-23，用户接受另一模型交叉审阅后的推荐修正；AC-28 至 AC-35、短屏例外及详情页筛选契约已确认，增量开发与验收仍待完成。

## Summary

为登录用户提供独立的确认清单页面。用户可以创建带必填截止时间和主题色的清单，用一个固定输入器连续添加只有必填详情的清单项，并通过逐项确认完成整份清单。每个清单在自己的详情 Dialog 中管理已删除项目。正式数据写入 PostgreSQL，所有读取和写入都按当前用户隔离。

页面严格复用现有清单卡片、清单项卡片、清单表单、日历、弹窗、按钮、链接、复选框、消息提示、`Content`、`NeuPanel`、`NeuSurface`、`globals.css` 和 `design.md`。清单项目使用最小边长 `12rem` 的自适应正方形网格，在当前容量内连续缩小并在空间不足时自然减列。`ButtonGroup` 只用于表达互斥分段筛选，包括搜索栏筛选和详情页的清单项完成状态筛选；其他操作按钮按间距 token 独立并排。宽屏使用卡片网格，窄屏使用固定高度的全宽列表。长列表复用已安装的 `react-virtuoso`，不新增虚拟列表依赖或平行视觉组件体系。

本次交互修订按 2026-09-23 用户要求及后续澄清编写，详见下方“清单交互修订”。它在相关界面规则冲突时优先适用；功能状态仍为 In Progress，本轮仅更新设计，不代表已开发或验收。

## Requirements

**User stories**:

- 作为登录用户，我希望创建带截止时间的确认清单，并在保存前列出所有需要确认的事项。
- 作为登录用户，我希望逐项确认、取消确认和编辑清单，从而知道准备工作是否完整。
- 作为登录用户，我希望在清单详情中只查看全部、已完成或未完成的清单项，从而快速定位仍需处理的内容。
- 作为登录用户，我希望按过期状态、确认状态和搜索条件快速找到清单。
- 作为登录用户，我希望误删后可以立即撤销，并能在三十天内从回收站恢复。
- 作为登录用户，我希望直接在当前清单详情中查看和恢复它自己的已删除项目，而不进入跨清单的项目回收站。
- 作为维护者，我希望清单数据有稳定的所有权、并发、分页、清理和错误契约。

**Acceptance criteria**:

- **AC-1**: 主导航为登录用户提供“清单”入口，并提供 `/checklists`、`/checklists/new`、`/checklists/[id]`、`/checklists/[id]/edit` 和 `/checklists/trash`。未登录访问使用现有登录引导，不泄露私人数据。
- **AC-2**: 创建清单必须提交去除首尾空格并规范化为 Unicode NFC 后长度为 1 到 100 个 code point 的名称、现有八种主题色之一、精确到分钟且晚于当前时间的本地截止时间，以及 1 到 200 个有效清单项。每个清单项只包含详情内容，不再有独立名称。保存成功后可以在列表和详情中读到持久化数据；同一所有者的 `createRequestId` 只在规范化载荷指纹相同时视为重试并返回原结果，载荷不同则返回 `conflict`。一次新的创建意图必须生成新的 ID。
- **AC-3**: 编辑保存与创建使用相同的清单和清单项规则，且保存后仍至少有一个有效清单项。整份表单在一个事务中创建、更新和软删除清单项，任一步失败不留下部分结果，并保留用户当前表单输入。表单内删除已有项也先确认；保存成功后的 10 秒撤销只恢复该次删除的项目，不回滚同次保存的其他编辑。
- **AC-4**: 清单项只有一个必填详情字段；详情去除首尾空格并规范化为 Unicode NFC 后长度为 1 到 2000 个 Unicode code point，不允许为空。同一清单内允许多项拥有完全相同的详情。已删除项不占 200 项上限，恢复时只重新校验数量和父级状态。任何入口都不得删除最后一个有效项。
- **AC-5**: 详情和编辑读模型按 `(createdAt DESC, createdOrder ASC)` 显示清单项，新增项置顶；同一批次按提交数组顺序分配不可变 createdOrder，保留同时间项目的表单顺序。编辑和恢复保留原创建时间与序号，旧项不因此置顶。点击或用 Enter、Space 操作清单项的详情内容区域可以在已确认和未确认之间切换，卡片按钮和留白不触发切换。服务端通过设置或清空 `confirmedAt` 持久化状态。界面先乐观更新，失败或版本冲突时回滚并给出刷新重试提示。
- **AC-6**: 清单状态由有效清单项实时派生为全部确认、部分未确认或全部未确认。总数、已完成数量和是否过期也实时派生而不存储。`expiresAt <= now` 即为已过期，过期只影响展示和筛选，不禁止确认、编辑或删除。
- **AC-7**: 截止时间提交分钟精度的原始 `localDateTime` 和浏览器当前 IANA `timeZone`。服务端按该时区解析为 UTC 时刻，不存在的本地时间报字段错误，重复时间采用较早偏移，秒和毫秒必须为零。表单用现有辅助文本显示时区，跨时区后展示同一 UTC 时刻对应的新本地时间。编辑保留数据库原 UTC 时刻，只有服务端解析后的值实际改变时新值才必须晚于提交时的服务端当前时间。
- **AC-8**: `/checklists` 默认显示未过期清单，使用已过期和未过期按钮组切换独立列表，并使用全部、全部确认、部分未确认、全部未确认筛选。未过期按 `(expiresAt ASC, id ASC)`，已过期按 `(expiresAt DESC, id ASC)` 排序。页面停留期间跨过截止时间的清单立即更新状态并移出当前未过期结果。
- **AC-9**: 搜索和筛选写入 URL。规范搜索值是对原始输入先去除首尾空格再做 Unicode NFC，长度按 Unicode code point 计算且最多 100，300 毫秒防抖，从 1 个字符开始。搜索按部署环境固定并由迁移验证记录的 PostgreSQL `LC_COLLATE` 使用参数化 `ILIKE`，对清单名称或有效清单项详情做字面包含匹配；所有环境必须通过同一大小写测试向量，否则部署停止。游标绑定规范搜索值。搜索与过期和确认筛选组合生效，清空搜索恢复对应筛选结果。
- **AC-10**: 首屏由服务端领域查询直接读取。后续批次通过已认证的 Route Handler 按 24 条加载，使用绑定当前用户、筛选条件、`asOf`、排序值和 ID 的有版本签名游标。分页是冻结过期判断时间的实时 keyset，不承诺跨请求数据库快照；本地变更后重载首批并按 ID 去重。结果采用无限滚动和虚拟化，失败时保留已加载内容并提供行内重试，不显示页码。
- **AC-11**: `/checklists` 结果容器宽度至少 1400 像素时使用 `lg` 卡片网格，1088 到 1399 像素使用 `md` 卡片网格，640 到 1087 像素使用高度 80 像素的 `md` 全宽列表，小于 640 像素使用高度 64 像素的 `sm` 全宽列表。`lg` 列表变体保留 96 像素高度供其他调用使用，但本页面不在列表模式选择它。内容水平靠左、垂直居中。溢出文本使用省略号，桌面通过原生 `title` 查看完整内容，移动端通过卡片或现有详情弹窗查看。
- **AC-12**: 删除单个清单或清单项前必须使用现有 `AlertDialog` 确认，且不得删除最后一个有效项。每个可撤销删除响应都返回数据库事务时间生成的 `undoVisibleUntil`、恢复所需 revisions 和 `serverNow`，现有 `ProMessage` 只在该截止前提供撤销入口。清单和清单项均软删除，并在删除后的三十天内分别从清单回收站或所属清单详情的已删除项目 Dialog 恢复；十秒只控制快捷入口显示，恢复权限始终使用三十天规则。到期后立即失去恢复资格，正常每日调度下以随后 24 小时内完成物理清理为目标，而不是强一致保证。
- **AC-13**: 删除清单只设置清单的 `deletedAt`，其仍有效的子项随父级隐藏。恢复清单时这些子项重新可见，而此前单独删除的子项保持删除。父清单已删除时不能单独恢复清单项；恢复会使有效项超过 200 个时返回冲突并说明处理方式。重复详情不构成恢复冲突。
- **AC-14**: 批量管理只选择当前已加载并显式勾选的清单，单次最多 100 个，不提供跨全部结果的全选。批量模式下卡片短按、Enter 和 Space 切换选择，独立详情按钮打开详情。切换筛选、搜索、记录移出结果或退出批量管理会清除相应选择。批量删除先显示数量并确认，再在一个事务中按版本原子删除；整批撤销也全有或全无。任一过期、版本或不变量冲突终止整批并列出安全冲突 ID。
- **AC-15**: 所有实体读取和写入只允许当前已认证所有者。普通产品路径不允许 ADMIN 或 ROOT 越权查看其他用户。未认证返回 `unauthenticated`，其他用户的资源与不存在资源统一返回 `not_found`。输入、权限、冲突、临时故障和 HTTP 状态遵循 spec 0005，日志不记录名称、详情、令牌、完整请求或数据库原始错误。
- **AC-16**: 清单和清单项使用递增 `revision` 做乐观并发控制。所有聚合写入先锁父清单行，再校验父子版本；批量操作按清单 ID 稳定顺序加锁。表单保存、确认切换、删除和恢复都拒绝陈旧版本且不静默覆盖。同一详情页的项目确认请求按清单串行提交。任何业务清单项变更同时递增父清单 `revision` 和 `updatedAt`。
- **AC-17**: 每日 03:00 UTC 的 Vercel Cron 调用受保护的 GET Route Handler，使用 `Authorization: Bearer CRON_SECRET` 和常量时间比较，缺少 secret 时拒绝启动。Route Handler 声明 `export const maxDuration = 60`，并在调用开始后的第 55 秒停止开启新批次。每个短事务批次最多物理删除 500 个实际父子记录，选择父级时把其级联子项计入上限；单个聚合最多 201 条记录，因此可作为有界整体处理。批次使用 `SKIP LOCKED` 并在锁内重验条件。仅连接中断、事务序列化失败和死锁属于可重试数据库错误，分别在 50 毫秒和 100 毫秒退避后最多重试两次；其余错误立即停止，剩余积压由下一次或人工受保护调用继续处理。重复调用安全，并且只记录计数、结果和耗时。
- **AC-18**: 数据库迁移只加入 `prisma/postgres`，业务代码只经 `src/db/client.ts` 或 `src/db/postgres` 访问。服务端以 ECMAScript `TrimString` 的 WhiteSpace 与 LineTerminator 集合去除两端字符并做 NFC；数据库对已规范化值再次检查 `char_length` 范围和 ASCII space `btrim` 后非空，并约束主题色 allowlist、正整数 revision、正整数 createdOrder、必填详情、唯一键和外键。共享测试向量覆盖普通空格、制表符、换行、不换行空格和全角空格，证明应用层拒绝纯空白而数据库拒绝可表达的空值。活动数据部分索引、列表复合索引和 `pg_trgm` GIN 搜索索引在本地空库重放与 PostgreSQL 验证中通过。一个尚未在共享环境应用的清单迁移直接创建最终 `Checklist` 和 `ChecklistItem`，不创建旧 `ChecklistItem.name`、不重建索引、不改写数据，也不使用 procedural block。新对象依赖预先配置给对象创建者 `app_migrator` 的 default privileges，把最小表 DML 和序列权限授予 `app_runtime`；环境验证证明 Supabase `anon` 和 `authenticated` 无权直接访问。迁移通过现有严格 SQL 安全分类器，不为通过门禁而放宽规则。迁移一旦在共享环境应用便不得改写。不修改生成的 Prisma 客户端文件。
- **AC-19**: 复用并扩展现有卡片，不创建平行卡片。`ChecklistCard` 和 `ChecklistItemCard` 新增默认保持当前行为的 `layout="card" | "list"`。清单卡片短按、Enter 或 Space 打开详情。清单详情遵循 spec 0003 的 96rem 主轨契约，并按项目网格布局容器的 content box 自适应布局。项目网格按 content box、12rem 最小轨道和项目数量计算列数，不使用固定列数断点，gap 固定使用 gap-3。卡片宽高相等，均为 12rem 至 12.5rem；同一列数内连续缩小，低于 12rem 前减少一列。达到最大尺寸后整个轨道组水平居中，间距不变；不完整末行保持轨道对齐。项目页面必须在支持范围内为网格提供至少 `12rem` content box。若第三方嵌入或调试环境把它压到更窄，卡片仍保持 `12rem` 正方形，溢出只由项目网格包装层局部横向滚动，不得扩散为页面级横向滚动。清单项详情区域占满操作按钮之外的剩余高度，允许换行，超出可显示区域时使用多行省略号。详情区域使用语义化 button 和 `aria-pressed`，短按、Enter 或 Space 切换确认。同一项目采用 leading edge 节流，写入期间禁用切换区并忽略 600 毫秒内重复输入；不同项目仍进入父清单串行队列并使用前一次成功响应的新父 revision。右上角独立详情按钮打开只读 Dialog，不再使用长按。删除按钮位于左下，编辑按钮位于右下，三个按钮都不触发确认切换。
- **AC-20**: 所有页面覆盖加载、空、错误、重试、禁用提交、焦点可见、键盘操作、Dialog 焦点圈、Escape、遮罩、背景隔离和焦点返回。四种现有主题、宽屏和窄屏均可用。**AC-25** 指定的主题色按钮使用 `size-8`，并且必须有可访问名称、可见焦点和规范间距。所有按钮和按钮式链接严格使用 `@/components/ui/button`、`@/components/ui/button-group` 或 `@/components/ui/styled-link`，不得自行拼接平行按钮样式。`ButtonGroup` 只允许用于表达互斥的分段筛选，包括搜索栏筛选和 **AC-33** 的详情页清单项完成状态筛选；新增、编辑、删除、保存等独立动作使用符合间距规范的独立并排布局。不得新增视觉 token、基础视觉组件或未经确认的样式规则。
- **AC-21**: 创建和编辑清单都只显示一个固定的“新增清单项”输入表单，表单只包含必填详情和“添加”按钮，不包含名称或删除按钮，也不会因点击添加而复制出更多输入表单。创建页的“已添加清单项”列表初始为空；编辑页初始展示全部当前有效项。点击添加时先按 **AC-4** 校验草稿，成功后把它置于已添加列表最前面并清空详情输入；空白或超长内容保留并显示字段错误，重复详情正常添加。未进入已添加列表的输入不参与清单保存；已添加列表为空时不能提交清单。
- **AC-22**: 已添加清单项统一复用 `ChecklistItemCard` 展示和承载编辑、删除操作，卡片在创建和编辑表面不切换确认状态。卡片的删除按钮独立左对齐，编辑按钮独立右对齐。点击编辑打开现有 Dialog 体系中的清单项编辑弹窗，弹窗复用新增表单的同一字段组件并预填目标详情，提供保存、取消和删除；点击保存或 Ctrl 加 Enter 只更新本地已添加列表，取消不产生变化，弹窗删除和卡片删除都使用现有 `AlertDialog` 二次确认。新建且尚未持久化的项确认后只从本地列表移除，不生成恢复记录；既有项确认后从本地列表移除，并且仅在整份清单保存成功时随聚合事务软删除、进入所属清单的已删除项目集合并获得 **AC-3** 的十秒撤销入口。取消整份编辑或明确回滚的保存失败不得删除既有项。
- **AC-23**: 每个清单只管理自己的已删除清单项。清单详情页提供“已删除项目”入口并在当前详情内打开 Dialog；Dialog 只查询该清单下仍在三十天恢复期内的软删除项目，展示详情、删除时间和恢复操作，支持空、加载、失败与重试状态。`/checklists/trash` 只保留清单级回收站，不再承载清单项恢复或通过查询参数切换项目回收站。恢复成功后关闭或刷新 Dialog、更新详情计数和卡片列表；父清单已删除时必须先从清单回收站恢复父级，不能直接打开其项目恢复 Dialog。
- **AC-24**: 用户点击主保存按钮时，如果固定新增器的详情输入包含任何尚未点击“添加”的原始内容，包括仅空白内容，先使用现有 `AlertDialog` 提示“有未添加的清单项内容，继续保存将不会包含这些内容”。取消时不提交、保留输入并把焦点返回详情字段；继续时按当前已添加列表创建不可变提交快照，排除新增器内容并开始保存。请求期间冻结清单元数据、新增器、卡片编辑和删除及重复提交；明确失败时保留整份本地草稿和新增器内容，成功导航后才丢弃该输入。
- **AC-25**: 清单表单遵循 spec 0003 的 96rem 主轨契约。已添加项目与详情项目使用 **AC-19** 的同一自适应正方形网格契约。网格容量只由项目网格布局容器的 content box、`12rem` 最小轨道和固定 `gap-3` 决定；实际活动列数还受当前项目数量限制。祖先 padding 不计入布局容器的 content box，不新增视觉 token。截止时间控件左对齐展示日期时间文本和仅含日历图标的按钮；未选择时文本为“请选择截止日期时间”，选择后文本显示选中值。固定新增器的“添加”使用共享 `Button`，放在详情输入框之后独立的一行并右对齐。八个主题色按钮使用共享按钮的 `size-8` 尺寸，不使用 `size-11` 或自定义按钮样式。表单底部的取消和主保存按钮都使用共享 `Button` 的 `md` 尺寸，主保存按钮文本统一为“保存”。
- **AC-26**: 详情页仅在批量管理模式显示清单项编辑、删除按钮；编辑按钮打开与表单一致的编辑 Dialog，保存或 Ctrl 加 Enter 通过 `updateChecklistItemDetail` 立即持久化，复用 **AC-4** 的校验。写入必须按所有者锁定父清单并同时校验父项和子项 revision，成功后递增两者 revision 并刷新卡片，失败时保留输入且不静默覆盖。右上角详情按钮打开相同内容结构的只读 Dialog，不提供编辑控件。删除、编辑、查看详情与详情区域切换状态互不触发。
- **AC-27**: 活动清单的剩余时间以 `expiresAt` 和校准后的权威当前时间之差显示。正数不足一分钟显示 `1min`；小于 60 分钟时按分钟向上取整显示 `Nmin`，精确差值小于 10 分钟时前置 danger 样式的“即将到期”，精确 10 分钟不前置。至少 60 分钟且不足 24 小时时，精确整数小时显示 `Nh`，否则按小时向上取整显示 `< Nh`。至少 24 小时时，精确整数天显示 `Nd`，否则按完整天数向下取整显示 `> Nd`。`expiresAt <= now` 显示过期状态，不显示正数剩余时间。

- **AC-28**: 详情页默认隐藏清单项左下删除、右下编辑按钮，仅在进入批量管理后在原位置显示，退出后隐藏且不参与 Tab 导航。切换模式不改变卡片尺寸或底部操作槽的位置。表单页的两个按钮始终显示，不增加批量管理入口；只读展示不出现无回调的可操作按钮。按钮点击不得切换确认状态或改变批量选择。
- **AC-29**: 清单项未完成状态使用 square-exclamation-point 形状，完成状态使用 square-check-big，均为 strokeWidth={2}。尺寸沿用各卡片尺寸档，未完成继续使用 --status-warning，完成继续使用 --status-success；保留“未确认”“已确认”可访问名称。批量勾选框是选择状态，不替换为完成状态图标。
- **AC-30**: 清单表单的添加按钮另起一行并保持右对齐。清单名、主题色、截止时间各组继续纵向排列，不恢复多列元数据布局。每个 fieldset 内标题与对应控件同一行、垂直居中、整体左对齐；主题色标题与八色按钮组同排，截止时间标题与“日期文本、日历按钮”同排。名称 label 与名称输入框维持现状。窄屏允许组内控件区域换行，标题与控件容器保持同一布局行，不造成页面横向滚动。
- **AC-31**: 截止时间弹层使用现有主题化 Select 组合独立小时、分钟选择框，小时为 00 到 23，分钟为 00 到 59，步长为一分钟。不再使用原生 type=time 弹出的系统列表。选择小时保留分钟和日期，选择分钟保留小时和日期；选择日期保留既有时间，未有时间时沿用 09:00。无日期时先选任一时间部分，沿用浏览器当前本地日期和 09:00 的另一部分组成完整值。完整值仍为 YYYY-MM-DDTHH:mm，时区与服务端校验遵循 AC-7。
- **AC-32**: 时间选择的触发器、弹层、选项、选中、悬停、焦点及禁用状态在 light、dark、sugar、warm 四主题下使用已有 token 与拟态表面。小时和分钟有独立可访问名称，支持键盘选择与 Escape，关闭子列表返回相应触发器且不误关日期弹层；关闭日期弹层返回日历按钮。不让点击选择或 Enter 提交整份表单。沿用 default 内边距和 gap-2。常规高度下仅列表填满剩余高度并独立滚动；剩余空间不足完整一行卡片及列表上下内边距时，按下文短屏例外允许表单内部整体滚动，页面仍不滚。不得隐藏字段或将元数据改为多列。整个日期浮层与选项列表均按当前可见视口限高并支持滚动，所有控件可达。
- **AC-33**: `/checklists/[id]` 的清单项工具栏在“新增清单项”按钮之前使用组名为“清单项完成状态筛选”的 `ButtonGroup`，按“全部”“已完成”“未完成”筛选当前清单的有效项目。默认且每次首次挂载选择“全部”；已完成表示有效完成状态为 true，未完成表示 false。恰好一个按钮使用 `aria-pressed=true` 和共享 `Button` 的 `primary` variant，其他按钮显式为 false 并使用 `default` variant。筛选只改变当前挂载实例中的可见卡片，不写入 URL，不请求新的服务端集合，不改变项目顺序、总数或已确认计数。服务端重读和写入后的数据协调保留当前筛选；浏览器刷新、离开后重新进入或 checklist ID 改变时重置为“全部”。筛选值实际改变时清空全部批量选择，重复点击当前筛选不清空；同一筛选下的数据重读只剔除已不存在或不再可见的选择。新增项目保持未选中且不清除已有选择。项目有效完成状态变化后立即按当前筛选进入或离开结果；被聚焦卡片移出时，焦点依次转到下一张可见卡片、上一张可见卡片，最后回到当前筛选按钮，并通过状态区域宣布结果。筛选结果为空时使用 `role="status"` 分别显示“没有已完成的清单项”或“没有未完成的清单项”，不把整个清单误报为空。
- **AC-34**: 详情页“新增清单项”打开表单类 Dialog。取消不写入，关闭后焦点返回新增入口；详情按 **AC-4** 校验，确认后调用独立即时写入。每次新增意图生成一个浏览器 UUID `itemId` 并在相同意图的重试中保持不变。服务端按所有者锁定父清单，校验父 revision 和 200 项限制，使用数据库事务时间生成 `createdAt`，分配下一个不可变 `createdOrder`，以 `confirmedAt=null` 和 revision 1 创建项目，并递增父 revision。相同所有者、父清单、`itemId` 和规范化详情的重试返回权威聚合，任何不同详情或已删除同 ID 返回冲突。成功返回完整权威详情、父 revision、项目与确认计数及 `serverNow`，关闭 Dialog、把焦点返回新增入口并提供成功反馈。新项按 **AC-5** 置顶并保持当前筛选：在“全部”或“未完成”中可见，在“已完成”中隐藏但整份清单总数更新。字段或明确写入失败保持 Dialog、输入与 `itemId`，聚焦详情字段并显示错误。结果未知时保留相同 `itemId` 和规范化详情供用户重试以辨认原结果，不生成第二个项目。
- **AC-35**: 详情页项目批量管理只能选择当前筛选下可见的有效项目，不提供跨筛选全选，单次最多 100 个。选择使用项目 ID 和当前项目 revision；真正切换筛选会按 **AC-33** 清空选择。批量删除显示数量并确认，提交父 revision 和去重后的目标项目 revisions，在锁定父清单后一次事务校验所有目标仍有效、版本一致且删除后至少保留一个有效项目。任一失败整批不变；成功用同一数据库时间软删除全部目标、分别递增项目 revision、只递增一次父 revision，并返回精确目标、删除时间、父 revision、`undoVisibleUntil` 和 `serverNow`。成功后清空选择并退出批量管理；十秒撤销把该次响应的精确目标交给 `restoreChecklistItems`，不会恢复其他删除。结果未知时权威重读并要求用户核对，不用新 revision 自动重放。

## Decision

**Chosen option**: 使用现有组件和 PostgreSQL 领域服务构建独立页面的完整服务端闭环

采用 Tracer Bullet 顺序，先打通一个真实的创建、列表、详情、确认和持久化路径，再加入搜索、虚拟列表、回收站、批量删除和定时清理。首屏由服务端组件直接调用领域查询，浏览器交互使用类型化 Server Action，滚动加载使用 Route Handler。

虚拟列表只用于无限加载的清单列表和清单回收站，复用现有 `react-virtuoso`。网格使用 `VirtuosoGrid` 或同库等价能力，窄屏列表使用 `Virtuoso`，两者共享同一条服务端游标查询。单个清单最多 200 个项目，表单、详情和已删除项目 Dialog 不引入项目级虚拟化，以保持 Dialog 焦点和键盘导航简单。实现不得引入 TanStack Virtual 或新的基础列表组件。

软删除是本功能明确需要的恢复能力。用部分索引、到期判断和每日物理清理限制软删除对正常查询的影响。提醒和分享不在本次实现中。

**Implementation skills**: `react-hook-form` (`pproenca/dot-skills`, `.agents/skills/react-hook-form/`) · `supabase-postgres-best-practices` (Supabase, `.agents/skills/supabase-postgres-best-practices/`) · `tailwind-css` (`paulrberg/agent-skills`, `.agents/skills/tailwind-css/`)

## Feature design

### Page and component composition

| Surface | Composition | Responsibility |
| --- | --- | --- |
| `/checklists` | `Content`, existing buttons, `ChecklistListFilters`, `ChecklistVirtualGrid`, `ChecklistCard` | search, expiry and confirmation filters, infinite results, batch mode |
| `/checklists/new` | `Content`, `NeuPanel`, `ChecklistForm`, existing Calendar and fields | create one checklist with embedded items |
| `/checklists/[id]` | `Content`, summary, existing buttons and dialogs, `ChecklistItemCard`, `ChecklistItemEditDialog`, `ChecklistItemDetailDialog`, `ChecklistItemTrashDialog` | read summary, toggle items, view or edit one item, delete list, restore this checklist's deleted items |
| `/checklists/[id]/edit` | `Content`, `NeuPanel`, `ChecklistForm` | atomically edit checklist and embedded items |
| `/checklists/trash` | `ChecklistTrashView`, existing cards, buttons, dialogs and `ProMessage` | deleted checklist recovery only |

允许新增的都是业务组合组件：`ChecklistVirtualGrid`、`ChecklistListFilters`、`ChecklistTrashView`、`ChecklistItemEditDialog`、`ChecklistItemDetailDialog`、`ChecklistItemTrashDialog` 和 `ChecklistBulkActions`。它们必须组合已有视觉原语，不得定义新的阴影、颜色、圆角、断点、滚动条或弹窗体系。实现中若发现现有组件无法表达必要状态，暂停并与用户确认后再改设计。

### Checklist item authoring workflow

项目卡片网格在详情、新建和编辑表面共享尺寸契约。W 为网格 content box 宽度，m 为根字号对应的 12rem，M 为 12.5rem，g 为固定 gap-3。非空集合的活动列数 N = min(itemCount, max(1, floor((W + g) / (m + g))))，卡片边长 S = max(m, min(M, (W - (N - 1) × g) / N))。使用等价于 repeat(N, minmax(12rem, 12.5rem)) 的轨道并整体居中，不拉大卡片或 gap 填充余白；不完整末行对齐既有轨道。卡片 border box 宽高相等，内部文本槽可收缩并截断。W 小于 m 的异常嵌入只允许网格包装层局部横向滚动，页面不得横向滚动。空集合显示空状态，不参与除以 N 的计算。

`ChecklistForm` 将清单元数据、固定新增器和已添加列表组织在同一个清单提交边界中。固定新增器与编辑 Dialog 共享一个只包含必填详情的 `ChecklistItemFields` 字段组件，但各自使用隔离的 React Hook Form 状态；这样打开或取消 Dialog 不会覆盖新增器中尚未添加的输入。新增器校验成功后调用聚合表单唯一的 `useFieldArray("items")` 实例执行 `prepend`，再重置新增器；Dialog 保存使用目标卡片的稳定草稿键执行 `update`。列表渲染始终使用 React Hook Form 生成的 `field.id` 作为 React key，不把它当作服务端 ID 或业务 ID。

已添加列表中的每项使用显式来源判别联合：既有项携带 `kind="existing"`、服务端 `itemId`、`expectedRevision` 和稳定草稿键；新项携带 `kind="new"` 和只在本次表单生命周期有效的 `clientKey`。创建页不预置空白项。编辑页把服务端返回的有效项映射为既有项。固定新增器中的半成品不是列表项，不计入 200 项上限和最终提交载荷，直到“添加”成功。

卡片在表单中是草稿管理控件，不是详情页的确认控件：禁用卡片主体的状态切换和详情查看，只保留左侧删除与右侧编辑按钮，并继续满足键盘和焦点要求。卡片使用共享的自适应正方形网格，间距来自现有 token。卡片把详情作为唯一主文本，不再预留名称行。编辑 Dialog 打开时复制目标项的详情；点击保存或 Ctrl 加 Enter 前执行与新增器相同的非空、规范化、长度和容量校验，重复详情不报错；成功后更新目标草稿，且不改变既有项的 `itemId`、`expectedRevision`、`createdOrder` 或 `confirmedAt` 语义。Dialog 的删除操作先关闭编辑意图，再进入与卡片删除相同的确认路径，避免嵌套模态焦点竞争。

删除是聚合草稿操作。新项确认删除后立即从 field array 移除且没有服务端副作用。既有项确认删除后也从当前可见草稿列表移除；服务端在锁住父级并校验父 revision 后，将锁内当前有效 ID 与最终提交的保留 ID 比较得到删除集合，并从数据库当前行取得子 revision。只有 `updateChecklist` 成功提交后才设置 `deletedAt`、递增子项和父级 revision、返回撤销所需版本并显示十秒撤销。用户取消整个编辑或事务明确回滚时，数据库中的既有项保持有效。任一删除会令最终草稿少于一个有效项时，删除操作被阻止；创建页可以处于零项草稿状态，但提交必须被客户端和服务端共同拒绝。

固定新增器使用原始详情值决定是否存在未添加内容，而不是用规范化后的有效性决定；因此仅空白但尚未添加的输入同样触发保存前警告。确认继续后，父表单以当时的 field array 生成提交快照，新增加的输入不并入载荷。请求在途时整页编辑控件共享父级 `isSubmitting` 禁用状态，避免迟到响应覆盖快照之后的草稿变化。明确失败时解除禁用并保持快照、待删除状态和新增器输入；结果未知的网络失败按失败状态章节处理。

### Checklist item detail interaction

详情页卡片把详情文本区设为唯一状态切换区域，并让它填满三个显式操作按钮之外的剩余高度。详情允许换行，超过卡片可显示高度时使用多行省略号。右上详情按钮打开只读 `ChecklistItemDetailDialog`，仅在批量管理中显示左下删除按钮和右下编辑按钮，分别走确认流程及打开共享 `ChecklistItemEditDialog`。按钮事件必须与详情区域隔离，任何按钮操作都不得连带切换确认状态。

详情页清单项筛选是瞬时展示状态。筛选组固定放在“新增清单项”之前，默认显示全部项目，并直接从当前详情读模型中的有效项目派生已完成和未完成结果。它不引入新的查询参数、服务端查询或持久化字段。同一挂载实例中的服务端重读和写入协调保留筛选；刷新、重新进入或 checklist ID 改变时重置。筛选值真正改变时清空全部选择，重复点击当前值不改变选择；数据重读只剔除已不存在或不再可见的 ID。原始项目顺序和整份清单汇总计数保持不变。

详情页复用上文的容量与活动列数契约，由 CSS 根据布局容器 content box、根字号、固定 `gap-3` 和筛选后的可见项目数量自动布局，不按 viewport 重复判断，也不新增独立网格组件。整份清单的 `itemCount` 和 `confirmedCount` 不参与筛选后网格列数计算。

详情页新增项目使用独立 Dialog 和即时写入边界。浏览器为一次新增意图生成稳定 UUID，服务端用父级锁、父 revision、该 UUID 和规范化详情识别安全重试。服务端分配持久化时间、顺序和 revision，成功后返回完整权威详情。新项初始未完成，因此只在“全部”或“未完成”结果中出现，在“已完成”筛选中保持隐藏；筛选本身和已有选择保持不变。

详情页项目批量管理只选择当前可见卡片。筛选值改变时清空全部选择，数据协调只移除已不可见的选择。批量删除以父 revision 和每个目标 revision 为输入，在一个事务中完成全部软删除并返回精确撤销目标。它与清单列表的父清单批量删除是两个不同动作，但都遵循最多 100 个、原子失败、权威 revision 和十秒撤销规则。

项目确认的乐观展示使用 `effectiveCompletion`，待提交的目标布尔值优先，否则读取权威 `confirmedAt`。筛选、乐观汇总和空状态只读取这个布尔值，不生成客户端确认时间。成功后采用 action 返回的服务端 `confirmedAt`；明确失败恢复原卡片、顺序、计数和选择，结果未知则权威重读并保留当前筛选。聚焦卡片因筛选离开时，焦点按下一张、上一张、当前筛选按钮的顺序恢复，并用状态区域宣布变化。

详情页编辑不是父表单草稿的一部分。保存或 Ctrl 加 Enter 调用 `updateChecklistItemDetail`，按当前所有者锁定父级，再校验父级和目标项 revision，成功后在一个事务中更新详情并递增父子 revision。这个即时写入边界只存在于没有未保存父表单的详情页。聚合编辑页仍只更新本地 field array，并在整份清单保存时统一持久化。

### Form controls and deadline display

截止时间控件在表单中左对齐，标题和控件的排布遵循 **AC-30**。文本标签与仅含日历图标的共享 `Button` 并排，未选择时标签固定为“请选择截止日期时间”，选择后显示选中的本地日期时间。固定新增器的“添加”使用共享 `Button` 并右对齐。主题色选择仍来自共享八色列表，每个按钮使用 `size-8`，不得通过局部类重新实现按钮尺寸或状态。表单底部取消和保存按钮都使用共享 `Button` 的 `md` 尺寸，主按钮只显示“保存”，不根据创建或编辑场景改成“创建清单”或“保存修改”。

活动清单的剩余时间按 **AC-27** 格式化。所有列表、详情、编辑和回收站读模型都返回数据库 `serverNow`。客户端收到响应时记录 `performance.now()`，随后用 `serverNow + 单调经过时间` 推进权威当前时间；页面重新可见和任何成功写入后重新读取或使用响应中的 `serverNow` 校准，绝不使用可被用户调整的浏览器墙上时钟。

### 清单交互修订（2026-09-23）

**范围与依据**：用户确认采用主题化小时／分钟选择框，且按钮隐藏不覆盖表单。本次在现有清单组件上原地改进，不变更数据模型、API、所有权、revision、截止时间解析或删除确认规则，不新增依赖和环境配置。已有的新增项置顶、卡片最大宽高 12.5rem、固定间距居中、系统快捷键提示、default 内边距与列表剩余高度都是保留基线，不按早期段落回退。

**详情管理状态**：继续使用详情页现有 batchMode。进入后卡片主体仍只切换选择，退出后清空选择并恢复确认切换。保留顶部只读详情按钮的现有模式行为，本次不改变其显示策略。编辑和删除仅作用于点击的当前卡片；单项成功删除后移除对应选中 ID，失败保持选择。编辑保存与取消均保持批量模式。关闭 Dialog 后焦点回到触发按钮；触发卡片已不存在时回到相邻可用卡片，无卡片时回到批量管理入口。隐藏按钮使用不进入可访问树和键盘顺序的方式，同时保留底部空操作槽，不能仅设置 opacity。

**组件边界**：ChecklistItemCard 将操作可见性与 selectionMode 分开表达。推荐增加显式 showActions 属性，默认 false，详情由 batchMode 传入，表单显式传 true，Album 对相应场景显式传值。按钮仅在可见且对应 onEdit/onDelete 存在时渲染；共享 loading 禁用规则继续生效。draftMode 仍只控制草稿语义，不隐式打开批量选择。

**图标兼容**：当前安装的 lucide-react 提供 SquareCheckBig，但未导出 SquareExclamationPoint。完成图标直接复用前者；未完成图标使用已有 Lucide 的 createLucideIcon 定义一个同体系适配图标，逻辑名 SquareExclamationPoint，24×24 viewBox、圆角方框和居中的感叹号，继承 Lucide 的 currentColor、线帽与线连接规则。可复用现有 Square 的方框路径，再加入竖线与点，不引入第二套图标库、不把 CircleAlert 当作等价替代，也不为此升级整个依赖树。两种状态显式指定 strokeWidth={2}；保持原尺寸与颜色 token。

**表单布局**：删除 fillHeight 分支中把新增器 textarea 与添加按钮并排的布局规则。新增器仍按标题、输入框、独立右对齐按钮行排列。fieldset 外层保持纵向 gap-2；fieldset 内建立同排标题与控件区域，不能依赖 legend 在各浏览器下天然参与 flex。推荐保留语义 legend，视觉上使用关联标题布局，必要时以视觉隐藏 legend 加 aria-hidden 标题副本实现同排，避免辅助技术重复读标题。错误提示和时区帮助在本组控件下方，不挤入同排标题。名称输入不因为本次 fieldset 调整而改为横排。

**时间组件**：保留现有 Calendar 与日期 Popover。在时间区域组合两个共享 Select，名称分别为“小时”“分钟”，显示两位数字，可用现有冒号分隔。适配样式局部作用于时间组合，复用背景、前景、primary、focus、禁用以及 NeuSurface 的既有 token；不要为修复清单时间选择而改变全站 Select 默认外观。日期层使用 Base UI，Select 使用 Radix；通过局部 Portal 容器适配把子列表放入父层认可的交互区域，并验证跨库焦点管理，不能只提高 z-index。必要时为共享包装层增加可选 Portal 容器透传，保持其他调用默认行为。点击子列表、移动焦点和选择值不得触发父层 outsidePress/focusOut 关闭。第一次 Escape 仅关闭子列表并返回该触发器，第二次关闭日期层并返回日历按钮。小时与分钟之间可切换，同时只展开一个子列表。整个日期弹层和子列表分别按当前可见视口可用高度限高并滚动，保留碰撞避让；软键盘或视口变化后重算，底部时间控件及全部选项可达。关闭浮层不撤销已经选中的字段值，也不自动保存清单。编辑预载从当前 localDateTime 拆分；无值时显示占位，首次操作使用 AC-31 的补齐规则，不能因切换一个部分清空另一部分。父表单提交中禁用日期和两个选择框。

**高度与狭窄环境**：父容器继续使用 default 内边距，元数据和新增器参与实际高度计算，列表使用 min-height: 0、flex: 1 和 overflow: auto。添加按钮换行后可视列表会缩短，这是保留字段排列的代价。默认字段行能容纳时不主动换行；非常狭窄时八色按钮在控件区域内换行。不以减少 padding、裁掉帮助或把元数据并排来换取列表高度。短屏例外按实际内容判定：H 为扣除导航、页面标题、父级内边距后的表单可用高度，F 为表单内列表滚动区之外的全部内容（元数据、新增器、列表标题、底部操作）及间距的实际总高度，L 为当前卡片边长加列表上下 default 内边距（空列表仍按当前宽度的卡片边长计算）。H - F >= L 时仅列表独立滚动；H - F < L 时，包括软键盘挤压，表单内部整体纵向滚动，列表保留至少 L 高度并继续支持多项内容滚动。页面与导航不滚；字段、帮助、添加和保存按钮可通过内部滚动到达，焦点控件自动滚入可见区域。尺寸变化后重算，空间恢复后返回常规模式并保留草稿及选择。零高或仅露卡片边缘不得通过验收。此例外仅适用于清单表单；详情页保持既定的列表独立滚动。

**新增值来源**：

| 值 | 来源 |
| --- | --- |
| 详情操作可见性 | 当前详情组件 batchMode，初始 false |
| 表单操作可见性 | 表单调用点固定 true，与批量选择无关 |
| 状态图标及颜色 | 当前 item.done，由 confirmedAt 派生；现有 status token |
| 已选小时与分钟 | expiresAt.localDateTime 的 HH 与 mm 部分 |
| 小时及分钟选项 | 本规格固定整数域 0..23 和 0..59，补齐两位 |
| 首次选择的另一时间部分 | 既有默认时间 09:00 |
| 首次选择时间时缺失的日期 | 操作当下浏览器当前本地日期 |
| UTC 截止时刻 | 原有 localDateTime + 浏览器 IANA timeZone 经服务端解析 |
| 内边距、按钮、阴影、颜色和焦点 | 现有 globals.css、共享基础组件及 design.md |

**验证重点**：AC-28 覆盖详情默认／进入／退出批量、表单常显和焦点；AC-29 覆盖两个状态与批量勾选；AC-30 覆盖宽窄屏组间纵排、组内横排和添加按钮换行；AC-31、AC-32 覆盖 00:00、23:59、先日期／先时间、编辑预载、分钟不丢失、键盘、四主题及服务端分钟精度。更换时间输入后仍跑真实保存、刷新与时区回归。

### Data model

```text
User 1 ── N Checklist 1 ── N ChecklistItem
```

| Entity | Field | Contract |
| --- | --- | --- |
| Checklist | `id` | UUID primary key |
| Checklist | `userId` | existing User string ID foreign key and ownership key |
| Checklist | `createRequestId` | client generated UUID, unique with `userId`, used only for create retry idempotency |
| Checklist | `createPayloadHash` | SHA-256 of versioned canonical normalized create payload, required for retry equivalence |
| Checklist | `name` | normalized nonempty string, max 100 |
| Checklist | `themeColor` | one value from shared `THEME_COLOR_OPTIONS` |
| Checklist | `expiresAt` | `timestamptz`, required |
| Checklist | `revision` | integer, starts at 1 and increments per mutation |
| Checklist | `createdAt`, `updatedAt`, `deletedAt` | `timestamptz`; `deletedAt` nullable |
| ChecklistItem | `id` | UUID primary key |
| ChecklistItem | `checklistId` | Checklist foreign key, physical delete cascades |
| ChecklistItem | `detail` | normalized nonempty string, max 2000; duplicate values allowed |
| ChecklistItem | `confirmedAt` | nullable `timestamptz`; null means unconfirmed |
| ChecklistItem | `createdOrder` | immutable positive integer allocated by the server within the checklist |
| ChecklistItem | `revision` | integer, starts at 1 and increments per mutation |
| ChecklistItem | `createdAt`, `updatedAt`, `deletedAt` | `timestamptz`; `deletedAt` nullable |

UUID primary keys and all persisted timestamps are generated by the server. New items begin with `confirmedAt = null`. Editing and restoring preserve an existing confirmation timestamp, while deletion does not clear it. `createdOrder` is assigned from the next aggregate sequence while the parent row is locked and is never reused or changed. ChecklistItem has no separate name field; every card, search result, trash row and accessibility label derives its user-facing text from `detail`.

Required database enforcement includes foreign key indexes, unique `(userId, createRequestId)`, required 64 character lowercase hexadecimal `createPayloadHash`, unique `(checklistId, createdOrder)`, named checks for normalized name length 1 to 100, detail length 1 to 2000, theme allowlist, `revision > 0` and `createdOrder > 0`, an active checklist query index on `(userId, expiresAt, id)` with `deletedAt IS NULL`, and an item order index on `(checklistId, createdOrder, id)` with `deletedAt IS NULL`. Name and detail checks apply `btrim` for ASCII space as the database backstop; full Unicode trim and NFC remain mandatory server validation. Checklist item detail uses PostgreSQL `text`, is `NOT NULL`, and has no uniqueness constraint; duplicate normalized details are valid. Empty database replay and catalog verification confirm the named constraints after the migration is applied.

Enable reviewed `pg_trgm` migration support and add GIN indexes for checklist name plus item detail. Search uses Unicode NFC case insensitive literal substring semantics; `%`, `_` and the escape character are escaped before parameterized `ILIKE`. One and two character searches remain valid but may use a less selective plan. Every query is parameterized.

Checklist confirmation state, active item count, confirmed count and expiry are query projections, not columns. An active checklist must always have at least one active item after a create or edit transaction.

### Time and pagination contract

The browser sends the raw minute precision `localDateTime` plus its current IANA `timeZone`. The server resolves that wall time, rejects a nonexistent local time, chooses the earlier offset for an ambiguous repeated time, rejects non minute precision input, and persists the resulting `timestamptz` instant. The displayed helper text names the submitted zone. The server clock is authoritative for future deadline validation, expiry transitions, undo duration and recovery cutoff.

Each list request fixes an `asOf` instant and returns both `asOf` and `serverNow`. A version 1 HMAC cursor signed with the server only `CHECKLIST_CURSOR_SECRET` binds owner ID, expiry after 30 minutes, `asOf`, normalized filters, normalized search text, ordering timestamp and ID. A cursor cannot be reused by another owner or with different filters. Omitted filters use documented defaults; unknown enum values, overlong queries, expired signatures and malformed cursors return `invalid_input` or HTTP 400 with a reset action.

This is a live keyset query with frozen expiry classification, not a repeatable read snapshot. The client removes duplicate IDs. A successful local mutation invalidates the current query and reloads its first batch. Concurrent mutations from another session can cause a temporary omission until reload, which is accepted. Every query generation has an ID; late responses from older generations are discarded.

The client schedules expiry from calibrated `serverNow`, not its uncorrected wall clock. It advances time with the monotonic clock and revalidates when the document becomes visible or a mutation succeeds. At a deadline it removes the item from the unexpired view and requests a fresh first batch; if refresh fails, it retains an explicit retry state rather than reinserting the expired item.

### Search and trash contract

Active list search matches active checklist name or its active item detail. Checklist trash search matches a deleted checklist name and the item details that belonged to it when deleted, excluding items that had already been individually deleted. The deleted-item Dialog has no search input in this slice. It is scoped by its active parent ID and pages all recoverable individually deleted items in deletion order, so local filtering never presents an incomplete result as complete.

`getChecklistTrash` returns deleted parents in 24 row batches ordered `(deletedAt DESC, id ASC)` and binds normalized `q` into its signed owner-bound cursor. `getChecklistItemTrash` is called only by the detail Dialog, takes an active owner-scoped parent ID and returns its individually deleted children in 24 row batches ordered `(deletedAt DESC, id ASC)` without `q`; its signed cursor is bound to owner and parent ID. Rows return safe display fields, `deletedAt`, `recoverableUntil`, parent and target revisions, `nextCursor` and `serverNow`. Records at or beyond `recoverableUntil` are hidden because they are no longer restorable even if physical cleanup has not run.

Trash results apply the same owner boundary. Restore eligibility is calculated as `deletedAt > now - 30 days`. Restoring a checklist preserves its original deadline, so it appears in the expired or unexpired view according to that instant. The cleanup handler counts actual deleted child and parent records toward each 500 row batch. It can run again after interruption without changing eligible active data.

### Mutation and concurrency contract

Create uses a browser generated `createRequestId` and a server generated SHA-256 fingerprint of versioned canonical JSON containing normalized name, theme, resolved UTC deadline and ordered normalized item details. Reusing the same owner and request ID returns the first result only when the fingerprint matches; a different fingerprint returns `conflict`. A new create intent gets a new UUID. Create and edit use one interactive transaction. Update input contains only the final active draft list plus the parent revision and each retained existing child ID and revision; an originally loaded existing ID omitted from that final list is the explicit aggregate diff signal for soft deletion. The client never calls `softDeleteChecklistItem` while the parent edit form still has unsaved changes. Every aggregate mutation locks the owner scoped parent row before it verifies revisions and invariants, computes the item diff, applies it, and increments the parent once. A no-op `updateChecklist` returns the authoritative unchanged aggregate without incrementing any revision. Successful create and edit navigate to detail and re-read the authoritative aggregate, so no new-item `clientKey` to server ID mapping is required. Batch operations lock parents in ascending ID order.

`updateChecklistItemDetail` is an immediate detail-page mutation, not an aggregate edit-form operation. It accepts the parent ID and revision, target item ID and revision, and normalized detail. It locks the owner scoped parent, verifies both revisions and active state, updates only that item detail, then increments the item and parent revisions in the same transaction. The aggregate edit form never calls it because doing so would invalidate its unsaved parent snapshot.

`addChecklistItem` is the detail-page immediate create mutation. It accepts the parent ID and revision, a browser generated item ID retained for one add intent, and normalized detail. It locks the owner scoped parent, enforces the 200 active item limit, allocates database `createdAt` and the next immutable `createdOrder`, creates an unconfirmed revision 1 item and increments the parent once. An existing active item with the same owner scoped ID and normalized detail is the idempotent result of the same intent; a different detail or deleted row with that ID is a conflict. It returns the complete authoritative detail projection so counts, order and revisions share one source.

`softDeleteChecklistItems` is the detail-page project batch mutation. It accepts one parent revision and 1 to 100 deduplicated item IDs with revisions. After locking the owner scoped parent it verifies every target, refuses to remove the final active item, updates all targets with one database deletion time and increments the parent once. The response contains the exact deleted items with new revisions, `deletedAt`, new parent revision, `undoVisibleUntil` and `serverNow`.

Toggle, delete and restore use target state semantics where possible. Repeating an already reached target returns the authoritative state only when the supplied revision still identifies that state. A genuinely stale revision returns `conflict` with safe resource IDs and a refresh instruction. `softDeleteChecklistItem` takes the item revision and parent revision, locks the parent, refuses the final active item, and returns both new revisions, deletion time, `undoVisibleUntil` and `serverNow`. Item confirmation uses leading edge semantics: the first input is accepted, the same target is disabled while it is pending, inputs within 600 milliseconds are ignored, and different items enter one parent queue that advances with each successful parent revision.

Immediate undo receives only the affected IDs, revisions and `undoVisibleUntil` from the successful action response. A successful `updateChecklist` that soft-deletes existing items returns the final parent revision, authoritative `serverNow`, `undoVisibleUntil`, and `deletedItems: [{ id, revision, deletedAt }]`; the page-level `ProMessage` host retains that response across the success navigation until the supplied deadline and calls `restoreChecklistItems` for exactly those items without undoing other edits. A successful `softDeleteChecklistItems` response supplies the same exact child target shape for its own batch undo. Batch undo uses the corresponding response deadline and does not require a database deletion batch entity. `restoreChecklistItems` and `restoreChecklists` are atomic and lock parents in the same order as their matching delete. Any expired item, stale revision or count violation fails the whole batch; duplicate details are valid.

`restoreChecklist` restores one parent by parent ID and deleted revision. `restoreChecklistItem` restores one child by active parent ID and revision plus child ID and deleted revision. `restoreChecklistItems` restores exactly the child set returned by one successful `updateChecklist` or `softDeleteChecklistItems` response. `restoreChecklists` restores one explicit batch of deleted parents. Each action returns authoritative parent and target revisions, affected counts, `serverNow`, and any changed summary needed by its current surface.

For every mutation without a stable retry identity, a transport failure after dispatch is result unknown. The client never substitutes a newly read revision and automatically resends. It first reads the authoritative owner-scoped resource, presents the resulting state, and requires the user to confirm any still-needed action. This rule covers toggle, detail edit, single and batch delete, aggregate edit, and every restore action. Aggregate create supports retry through its request ID and matching fingerprint. Detail-page item add supports retry only with the same browser item ID and identical normalized detail; it returns the existing authoritative result instead of creating a duplicate.

Once a parent is deleted, ordinary detail reads and all child create, edit, confirm and delete actions return `not_found`; only parent restore is allowed. Restore and physical cleanup use the same parent then child lock order and recheck eligibility after locks are held. Physical retention cleanup does not increment business revisions because the records are already outside every product read path.

### Authentication and authorization

Every server entry resolves the current user from the existing HttpOnly `token` cookie and confirms the live User row. Owner scoped queries include both resource ID and current `userId`. Missing and foreign resources share `not_found` to prevent enumeration.

No browser code accesses Prisma or Supabase. Row level security is not introduced because this application uses its own JWT identity rather than Supabase Auth and all database access is server side. The runtime database role keeps the least privileges defined by the PostgreSQL environment.

### Server interface

| Surface | Input | Output | Failure contract |
| --- | --- | --- | --- |
| server list query | owner, expiry, confirmation, q, limit 24 | first batch, next cursor, canonical `asOf` and `serverNow` | spec 0005 result categories |
| `GET /api/checklists` | URL filters, q, signed cursor, limit fixed at 24 | later batch, next cursor, canonical `asOf` and `serverNow` | 400, 401, 404, 409, 503, 500 mapping |
| `getChecklistDetail` | owner and checklist ID | parent fields and revision, derived state and counts, active items ordered by `(createdAt DESC, createdOrder ASC)`, `serverNow` | `unauthenticated`, `not_found`, `temporary_failure` |
| `getChecklistForEdit` | owner and checklist ID | raw `expiresAt`, parent revision, active item IDs, revisions, `createdOrder`, `confirmedAt`, `serverNow` | same as detail |
| `createChecklist` | normalized aggregate, raw `localDateTime`, IANA zone, `createRequestId` | created checklist ID, revision and `serverNow` | `ActionResult`, including fingerprint `conflict` |
| `updateChecklist` | final aggregate snapshot plus parent and retained child revisions | authoritative aggregate, final parent revision, `serverNow`, optional `undoVisibleUntil`, and `deletedItems: [{ id, revision, deletedAt }]` | `ActionResult`, including no-op and result-unknown reconciliation |
| `addChecklistItem` | parent ID and revision, browser item ID for one add intent, normalized detail | complete authoritative detail projection with new item, counts, revisions and `serverNow` | owner scoped `ActionResult`, including 200 item limit, idempotent same-intent result and payload conflict |
| `updateChecklistItemDetail` | parent ID and revision, item ID and revision, normalized detail | updated item detail, new parent and item revisions, `serverNow` | owner scoped `ActionResult`, including `invalid_input`, `not_found` and `conflict` |
| `toggleChecklistItem` | item ID, target state, item and parent revisions | authoritative item and parent summary, new revisions, `serverNow` | `ActionResult` |
| `softDeleteChecklistItem` | item ID, item revision and parent revision | deleted ID, deletion time, revisions, `undoVisibleUntil`, `serverNow` | `ActionResult`, including final item conflict |
| `softDeleteChecklistItems` | parent ID and revision, 1 to 100 deduplicated item IDs and revisions | exact deleted item IDs and revisions, deletion time, new parent revision, `undoVisibleUntil`, `serverNow` | atomic owner scoped `ActionResult`, including final item, missing target and revision conflict |
| `softDeleteChecklist` | ID and revision | deleted ID, deletion time, new revision, `undoVisibleUntil`, `serverNow` | `ActionResult` |
| `softDeleteChecklists` | selected IDs and revisions | deleted IDs and revisions, deletion time, `undoVisibleUntil`, `serverNow` | atomic `ActionResult` |
| `restoreChecklist` | checklist ID and deleted revision | restored parent view, new revision, `serverNow` | owner scoped `ActionResult` with retention or revision conflict |
| `restoreChecklistItem` | active parent ID and revision, item ID and deleted revision | restored item, new parent and item revisions, counts, `serverNow` | owner scoped `ActionResult` with capacity conflict |
| `restoreChecklistItems` | active parent ID and revision, exact deleted items from one successful `updateChecklist` or `softDeleteChecklistItems` result | restored items, new parent and item revisions, counts, `serverNow` | atomic `ActionResult` |
| `restoreChecklists` | explicit deleted parent IDs and revisions, max 100 | restored parents and new revisions, `serverNow` | atomic `ActionResult` |
| `getChecklistTrash` | owner, q and signed cursor | rows with `recoverableUntil` and revisions, `nextCursor`, `serverNow` | spec 0005 result categories |
| `getChecklistItemTrash` | owner, active parent ID and signed cursor | rows with parent and target revisions plus `recoverableUntil`, `nextCursor`, `serverNow` | spec 0005 result categories |
| `GET /api/cron/checklists/purge` | Vercel Cron bearer secret | sanitized counts and duration | 401 or safe 5xx response |

### Value sourcing

| Value | Source |
| --- | --- |
| current user and owner scope | verified JWT claims plus live User lookup |
| checklist name and item detail | validated and normalized form input; item detail is the only item content |
| theme | shared `THEME_COLOR_OPTIONS` allowlist |
| entity IDs and persisted timestamps | server UUID generator and PostgreSQL transaction time, except a detail-page item add uses its browser UUID as the stable retry identity |
| create retry identity | browser generated UUID retained for one create intent plus server SHA-256 of the normalized semantic payload |
| stable item order | persisted createdAt DESC then immutable createdOrder ASC; draft additions use prepend; same-batch sequence follows submitted array order |
| stored deadline | browser local date time plus IANA zone resolved to an explicit UTC instant, then server validated |
| expired flag | stored `expiresAt` compared with authoritative current or `asOf` time |
| authoritative confirmation state and counts | active child `confirmedAt` values in the owner scoped query |
| effective completion during a pending toggle | pending target boolean when present, otherwise authoritative `confirmedAt`; no client confirmation timestamp is created |
| list search, expiry filter, confirmation filter and initial list view | URL parameters normalized as NFC after trim, with length measured in Unicode code points |
| detail item completion filter | component-local `all | completed | incomplete` state; initial mount is `all`, same-instance reads preserve it, remount or checklist ID change resets it |
| detail visible items and empty result | full active detail items filtered by effective completion while preserving server order |
| server time calibration | database backed `serverNow` returned by every read and successful mutation, advanced with elapsed `performance.now()` time |
| next batch | version 1 HMAC cursor signed with `CHECKLIST_CURSOR_SECRET` and bound to owner, query and `asOf` |
| revision | database current row and mutation result |
| detail-page item edit result | validated Dialog input plus owner scoped current parent and item revisions |
| item detail Dialog content | active item `detail` from the owner scoped detail view; no editable local source |
| remaining deadline label | `expiresAt` minus response `serverNow`, formatted by the thresholds in **AC-27** |
| deadline picker label | selected browser-local date and time, or the fixed unselected prompt from **AC-25** |
| checklist item grid capacity and active column count | grid content-box width W, root computed 12rem, fixed gap-3, visible item count; N = min(visibleItemCount, max(1, floor((W + gap) / (12rem + gap)))) for nonempty filtered collections |
| checklist item card size | S = max(12rem, min(12.5rem, (W - (N - 1) × gap) / N)); equal width and height; centered track group, fixed gap, final-row track alignment |
| undo targets and deadline | each successful delete response supplies exact target IDs and revisions plus database generated `undoVisibleUntil`; aggregate edit uses `updateChecklist.deletedItems` |
| detail add identity and persisted order | browser UUID retained for one add intent; database transaction time and locked maximum `createdOrder` plus one |
| detail batch selection | current visible active item IDs and revisions, limited to 100 and reconciled against the current filter |
| focus after a filtered card leaves | next visible card, otherwise previous visible card, otherwise the current filter button |
| deleted-item Dialog scope | authenticated current checklist ID from the detail route, rebound and owner-checked by `getChecklistItemTrash` |
| pending composer warning | raw composer detail differs from the empty string, including whitespace-only input |
| submit snapshot | final field-array values captured when the user submits or confirms discarding pending composer input |
| draft identity | browser generated stable UUID `clientKey`; React Hook Form `field.id` is a separate render key and is never sent as business identity |
| restore cutoff | server clock minus thirty days |
| cleanup authority | `CRON_SECRET` from server environment and request Authorization header |
| cleanup execution deadline | invocation start plus 55 seconds from the route's 60 second `maxDuration` |
| safe conflict identifiers | owner scoped IDs already present in the validated request plus current database revisions |

### View model and input contract

List reads expose `rows`, `nextCursor`, `asOf` and `serverNow`; each row contains `id`, `name`, `themeColor`, `expiresAt`, derived `expiryState`, derived `confirmationState`, `itemCount`, `confirmedCount` and `revision`. Detail adds parent fields and revision, derived counts, active items ordered by `(createdAt DESC, createdOrder ASC)`, and `serverNow`; each item contains `id`, `detail`, `confirmedAt`, `createdOrder` and `revision`. Edit reads include raw `expiresAt`, parent revision, each item ID, revision, `createdOrder`, `confirmedAt` and `serverNow`. The client edit draft represents each item as either `{ kind: "existing", itemId, expectedRevision, clientKey, detail }` or `{ kind: "new", clientKey, detail }`. `clientKey` is a browser generated stable UUID distinct from React Hook Form `field.id`. Identity and concurrency metadata sent for existing items are `itemId` and `expectedRevision`; every final item also sends its `detail`, while both client keys stay browser-local. Checklist trash rows add `recoverableUntil`, target revision, `nextCursor` and `serverNow`; deleted-item Dialog rows add `detail`, `deletedAt`, `recoverableUntil`, parent revision, target revision, `nextCursor` and `serverNow`.

Canonical enum values are `expiry=active|expired` and `confirmation=all|confirmed|partial|unconfirmed`. Omitted expiry defaults to `active`; omitted confirmation defaults to `all`; omitted q means no search. Initial page reads surface invalid URL input with a reset filters action. Route Handlers return 400. Field errors use stable paths such as `name`, `expiresAt`, `items.3.detail` and `root`. For each submit snapshot the client retains an index-to-`clientKey` map; a server `items.N.detail` error is attached to the matching card with an “编辑修正” action, and opening that Dialog focuses its detail field. Parent and root errors remain on the aggregate form.

Conflict results may expose only IDs already submitted by the current owner, the conflict category and current revisions. They do not return foreign values or conflicting item content. Batch inputs are deduplicated, limited to 100 IDs and rejected before opening a transaction when malformed.

## Failure states

- Initial page failure uses the existing page level error and retry treatment. Incremental load failure preserves earlier rows and exposes an inline retry.
- A parent submit freezes the checklist fields, fixed composer, card edit and delete actions, Dialog controls and repeated submission against one immutable snapshot. Field errors attach to fields or their stable cards, aggregate errors use the React Hook Form root error, and typed data remains in the form.
- Adding an item disables only the fixed item composer for the duration of its validation step. An invalid add retains the detail; a successful add resets it and moves focus back to the detail input for rapid repeated entry.
- If the composer has pending raw content, submitting opens the discard warning before any request. Cancel preserves content and focuses the composer; continue excludes it from the snapshot. An explicitly failed parent save preserves the complete local draft, pending removals and composer content for correction and retry.
- A transaction/business failure explicitly reported by the server means no database rows changed. A transport failure after dispatch is treated as result unknown, not as rollback: keep the local draft read-only and re-fetch the authoritative aggregate plus its deleted-item state. Only when the authoritative parent revision is unchanged may the exact original snapshot be retried. If the revision changed for any reason, preserve the local draft as a comparison copy, show the authoritative state and require explicit conflict resolution; never replace the draft's expected revisions or automatically resubmit it. Do not promise a ten-second undo when the success response carrying its targets was lost.
- The same result-unknown rule applies to toggle, detail edit, single and batch delete, and every restore action. Re-read the authoritative owner-scoped resource before offering another action. Never adopt a newly read revision and silently replay the previous intent. Aggregate create may retry with the same request ID and matching payload fingerprint. Detail-page add may retry only with the same item ID and identical normalized detail.
- While an item edit Dialog is validating or resolving its delete confirmation, its controls are disabled. A failed local validation leaves the Dialog open and focuses the detail field. Cancelling the nested delete confirmation reopens the edit Dialog with its unsaved value. Aggregate form editing success restores focus to the same card's edit button by `clientKey`; confirmed deletion focuses the next card, then previous card, then composer detail input.
- Detail-page item editing keeps the Dialog open on validation, permission, transport or conflict failure and preserves the typed value. A conflict never replaces the user's value or silently retries with new revisions. Success closes the Dialog, updates the card with returned revisions and restores focus to that card's edit button.
- A stale revision never silently overwrites. Toggle rolls back the effective completion state, card order, counts and selection. Edit and delete preserve the server version and guide the user to refresh. If a successful optimistic toggle removes the focused card from the active filter, focus moves to the next visible card, previous visible card or current filter button, and a status region announces the result.
- If another tab deletes the current resource, the detail or edit surface receives `not_found`, explains that the resource is unavailable, and returns to the owner list.
- Restore conflicts identify the safe target ID or capacity rule without returning another user's data or raw database diagnostics.
- Successful create and aggregate edit navigate to the checklist detail page and re-read it. Successful checklist deletion returns to `/checklists`. Successful item restore keeps the deleted-item Dialog open, refreshes its first batch and detail counts, then focuses the next restore button or the “已删除项目” trigger when no row remains. Successful checklist restore keeps the trash page active and focuses the restored row's detail link or the trash heading when it leaves the result.
- Cron authentication failure performs no query. A batch failure rolls back that batch, can be retried, and leaves later batches untouched.
- Search and cursor parsers reject malformed or mismatched values before database access.
- Virtualized keyboard focus moves to the next visible row, the previous row, or the batch toolbar in that order when a focused row is removed or unmounted. The explicit detail button is the only entry to the read-only item detail Dialog.

## Critical test scenarios

- 创建包含两个项目的清单，逐项确认到全部确认，再刷新验证持久化和派生计数，覆盖 **AC-2**、**AC-5**、**AC-6**。
- 创建页初始已添加列表为空；连续两次填写固定新增器并点击添加相同详情，确认只存在一个输入表单、每次成功后字段清空且两个重复内容卡片按序出现，覆盖 **AC-2**、**AC-4**、**AC-21**。
- 用相同 `createRequestId` 分别重试相同和不同规范载荷，确认前者返回原结果而后者冲突；开始新创建意图时使用新 ID，覆盖 **AC-2**。
- 编辑页加载既有项卡片；分别从卡片和编辑 Dialog 删除既有项并取消二次确认，确认无变化；再确认删除并取消整份编辑，刷新后项目未进入所属清单的已删除项目集合，覆盖 **AC-3**、**AC-22**。
- 在同一次编辑中新增一个未保存项并直接删除，保存后确认没有该项及其恢复记录；删除另一个既有项并保存，确认它出现在所属清单详情的已删除项目 Dialog，且十秒撤销只恢复该项，覆盖 **AC-3**、**AC-12**、**AC-22**、**AC-23**。
- 打开项编辑 Dialog，验证详情预填、取消不改草稿、保存更新卡片、空白和超长详情留在弹窗报错，并验证焦点圈、Escape 和关闭后按稳定 `clientKey` 返回原编辑按钮，覆盖 **AC-4**、**AC-20**、**AC-22**。
- 在清单详情先进入批量管理，再打开项目编辑 Dialog，使用按钮和 Ctrl 加 Enter 分别保存，确认父子 revision 同时更新；制造版本冲突后确认输入保留且不覆盖服务端，覆盖 **AC-4**、**AC-16**、**AC-26**。
- 在已添加项目和详情项目网格中放入足够覆盖目标列数的项目，再从能容纳多列的宽度连续缩小 content box。确认当前容量内卡片连续缩小，每张保持正方形；在 `N × 12rem + (N - 1) × gap-3` 的边界两侧确认只减少一列，减列后轨道等宽且边长不超过 12.5rem，轨道组居中、gap 不变，最终进入单列。分别用 0、1、2 个项目、一个满行和一个不完整末行确认 列数不超过项目数、少量项目不超过 12.5rem 且轨道组居中、末行保持轨道对齐。再把调试容器压到窄于 `12rem`，确认卡片仍为 `12rem` 正方形且只有网格包装层局部横向滚动。确认删除左对齐、编辑右对齐、添加右对齐、主题按钮为 `size-8`，日历按钮仅显示图标且提示文本与选中值左对齐。确认底部取消和保存按钮为 `md`，主按钮文本为“保存”，覆盖 **AC-19**、**AC-20**、**AC-22**、**AC-25**。
- 在新增器分别留下有效、无效和仅空白的未添加内容后保存，确认都先出现丢弃警告；取消保持内容和焦点，继续提交不包含该内容，慢响应期间全部编辑操作被冻结，覆盖 **AC-21**、**AC-24**。
- 让服务端返回 `items.N.detail` 错误，确认错误映射到快照中的稳定卡片并可打开 Dialog 定位；模拟更新已提交但响应丢失，确认进入结果未知的权威重取流程而不误报回滚，revision 变化时不自动套用新版本重试，覆盖 **AC-3**、**AC-16**、**AC-20**。
- 在宽屏网格和移动端全宽列表中滚动超过三个批次，并在截止时间跨越后刷新实时 keyset 首批，覆盖 **AC-8**、**AC-10**、**AC-11**。
- 在分页期间从另一会话修改排序或筛选字段，确认已知本地变更重载、旧响应丢弃、结果按 ID 去重，并记录实时 keyset 允许的暂时遗漏，覆盖 **AC-8**、**AC-10**。
- 用清单名和项目详情搜索并组合过期和确认筛选，刷新 URL 后结果不变，覆盖 **AC-8**、**AC-9**。
- 并发编辑、确认、删除和批量删除同一资源，后提交者收到冲突且没有部分写入，覆盖 **AC-3**、**AC-14**、**AC-16**。
- 在同一详情页快速确认不同项目，确认客户端队列与父级锁不会制造自冲突，覆盖 **AC-5**、**AC-16**。
- 在清单详情中确认完成状态筛选组位于“新增清单项”之前，默认选择“全部”；依次选择“已完成”和“未完成”，确认只显示匹配卡片、顺序不变、汇总计数不变且空结果使用对应文本。切换筛选会清空批量选择，项目状态变化后会立即进入或离开当前结果，覆盖 **AC-20**、**AC-33**。
- 在三个详情筛选中新增项目，确认同一新增意图重试不重复创建，父 revision 和整份清单计数更新；新项在“全部”和“未完成”中置顶，在“已完成”中保持隐藏且成功反馈清楚，覆盖 **AC-4**、**AC-5**、**AC-16**、**AC-34**。
- 在详情页当前筛选中选择多个项目，确认最多 100 个、切换筛选清空、重复点击当前筛选不清空、重读只剔除不可见选择。批量删除必须保留最后一项并整批成功或失败，十秒撤销只恢复该批精确项目，覆盖 **AC-12**、**AC-16**、**AC-33**、**AC-35**。
- 在“已完成”和“未完成”筛选中切换聚焦项目状态，确认筛选使用目标布尔值而不是客户端时间戳。成功移出时焦点和状态提示正确，明确失败完整回滚，结果未知时权威重读并保留筛选，覆盖 **AC-5**、**AC-16**、**AC-20**、**AC-33**。
- 删除父级前单独删除一个子项，再删除并恢复父级，确认该子项仍只在所属清单详情 Dialog 中且重复详情可恢复，覆盖 **AC-12**、**AC-13**、**AC-23**。
- 分别验证四种 restore action、200 项容量冲突、数据库生成的 `undoVisibleUntil` 和写入响应丢失后的权威重读，覆盖 **AC-12**、**AC-13**、**AC-14**、**AC-16**。
- 用另一账号和管理员角色尝试读取已知资源 ID，所有普通产品路径均不泄露资源，覆盖 **AC-1**、**AC-15**。
- 并发运行两个受保护的清理请求，验证三十天边界、有界批次和重复调用安全，覆盖 **AC-12**、**AC-17**。
- 验证 DST 不存在时间、重复时间、浏览器时钟偏差和后台恢复可见，覆盖 **AC-7**、**AC-8**。
- 用可控时钟验证不足一分钟、5 分钟、精确 10 分钟、36 分钟、精确 60 分钟、精确 5 小时、5 小时 03 分、精确 24 小时、3 天 20 小时 40 分和到期边界，覆盖 **AC-27**。
- 从空 PostgreSQL 数据库重放迁移并验证索引、约束和参数化搜索，覆盖 **AC-4**、**AC-18**。
- 用鼠标、触控和键盘验证详情页自适应多列到移动端单列、严格正方形、详情区域切换、显式只读详情、编辑和删除按钮隔离、节流、Dialog 焦点与四种主题，覆盖 **AC-19**、**AC-20**、**AC-26**。

完整的人工与自动化验证矩阵见 [verify.md](verify.md)。

## Build plan

The implementation follows Tracer Bullet. Every milestone remains runnable and proves a complete user visible path before the next breadth is added.

1. Add the PostgreSQL models, owner scoped domain projection and one runnable create, unexpired list, detail and item confirmation tracer path. Wire the navigation and approved routes through existing components. Satisfies **AC-1**, **AC-6**, **AC-15**.
2. Complete the forward migration and constraints, strict create validation and fingerprinted idempotency, raw local-time parsing, aggregate transactions, stable item order, optimistic concurrency, and the fixed composer plus card draft workflow. Add the shared item field, edit Dialog, pending-content warning, spec 0003's 96rem `Content` track, the shared centered 12rem to 12.5rem square-card grid contract, approved controls, shared buttons, keyboard save and stable error mapping. Satisfies **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-7**, **AC-16**, **AC-19**, **AC-20**, **AC-21**, **AC-22**, **AC-24**, **AC-25**.
3. Add expiry and confirmation URL filters, the detail page item completion filter, immediate detail-page item add, server time deadline transitions and remaining-time labels, normalized search, signed live keyset cursors, `react-virtuoso`, approved card and list variants, overflow behavior, explicit item detail action, direct detail-page item editing and responsive states. Satisfies **AC-8**, **AC-9**, **AC-10**, **AC-11**, **AC-16**, **AC-19**, **AC-20**, **AC-26**, **AC-27**, **AC-33**, **AC-34**.
4. Add confirmed deletion, immediate undo, checklist-only trash page, per-checklist deleted-item Dialog, restore invariants, explicit loaded-row checklist batch deletion and current-filter detail item batch deletion. Satisfies **AC-12**, **AC-13**, **AC-14**, **AC-16**, **AC-23**, **AC-35**.
5. Add the protected Vercel Cron purge route, cascade-aware bounded cleanup, backlog continuation, database constraint and privilege verification, strict migration SQL classification and retry safety. Complete unit, integration and browser coverage including spec 0007 deferred interactions and all failure states. Satisfies **AC-17**, **AC-18**.

## Migration plan

### Strategy

Keep the existing aggregate transaction boundary and create ChecklistItem with one required `detail` field, no `name` field and no per-checklist content uniqueness index. The six provably unapplied checklist migration drafts are squashed into one migration that creates the final tables, constraints and indexes from an empty schema. It contains no data rewrite or procedural block and relies on the already configured `app_migrator` default privileges for runtime access. A migration file that has been applied in any shared environment is immutable. The client migration still replaces repeated inline forms with one composer plus a card draft list and moves item recovery into its parent detail Dialog.

### Phases

1. From an empty PostgreSQL schema, apply the single squashed migration that directly creates final `Checklist` and `ChecklistItem` tables, constraints and indexes, then verify object ownership, default runtime grants and denied direct access for untrusted roles.
2. Extract the shared detail field and introduce the fixed composer while retaining the existing final aggregate transaction boundary and server validation.
3. Render the field array as non-toggleable `ChecklistItemCard` drafts; add the edit Dialog, pending-content warning, source-aware deletion behavior and per-checklist restore Dialog.
4. Prove create, duplicate details, edit, cancel, atomic save, result-unknown recovery, trash and undo behavior before removing the old repeated inline form and item-trash page path.

The existing in-memory checklist utility and showcase-oriented component data are adapted behind explicit view models. Existing visual components remain available during the tracer path and are extended compatibly.

### Rollback

Before the new migration is applied, rollback is a normal code revert. After application, do not rewrite migration history or delete retained data. Disable incompatible feature surfaces, restore the previous client against a compatible forward schema when possible, and require a separately reviewed reverse migration for any column restoration.

### Risks

The principal migration risk is applying the squashed history to an environment where any of the replaced checklist migrations already ran. Deployment reconciliation must prove the checklist migration is still pending before application; after first shared application its checksum and history are immutable. The principal client risk is accidental duplicate state between the composer, Dialog and aggregate field array. Component tests must prove that only the field array enters the parent payload, Dialog cancellation cannot mutate it, and existing IDs and revisions survive local edits. A further risk is making a staged existing-item deletion look immediately durable; copy and verification must make clear that it enters the parent checklist's deleted-item Dialog only after the parent save succeeds. Schema and search tests must also prove that duplicate details are accepted while null, blank and overlong details remain impossible.

### 本轮增量构建顺序

沿用 Tracer Bullet，三个切片都先覆盖生产入口和实际保存／取消，再补齐状态与回归，不重做服务端。

1. 将详情的 batchMode 接入卡片操作可见性，并保持表单常显，走通单项编辑和删除的真实路径；替换状态图标并同步 Album，覆盖 **AC-28**、**AC-29**。
2. 恢复新增器独立按钮行，实现 fieldset 内横排而各组纵排，实测 padding、焦点和剩余高度滚动，覆盖 **AC-30**、**AC-32**。
3. 用两个现有 Select 替换原生时间输入，走通日期时间选择、创建／编辑保存及刷新；补齐四主题、键盘、未选择、边界、禁用和时区回归，覆盖 **AC-7**、**AC-31**、**AC-32**。

## Consequences

**Positive**:

- The feature becomes a real owner scoped workflow instead of an in memory component demonstration.
- Required deadlines, stable sorting and derived progress make omissions visible without adding reminder infrastructure.
- Existing components, tokens and virtualization dependency remain the single UI foundation.
- Soft deletion and short undo reduce the cost of accidental deletion.
- A single fixed composer keeps repeated entry fast while cards make the staged aggregate visible before commit.
- Explicit card actions make view, edit, delete and confirmation behavior discoverable without long press.

**Negative and tradeoffs**:

- Soft deletion complicates every query and restore path.
- Existing-item deletion in the edit page is intentionally not durable until the parent save succeeds; the UI must communicate this staged state clearly.
- Search across child content and exact derived status requires careful SQL and indexes.
- Snapshot cursors may refresh visible rows when time crosses a deadline, rather than preserving an indefinitely stable list.
- Vercel Cron adds a deployment environment secret and operational route even though reminders are out of scope.
- Immediate item editing on the detail page increments the parent revision and can correctly invalidate an aggregate editor that was opened earlier in another tab.
- Cards stop growing at 12.5rem. The centered track group deliberately leaves symmetric side space; fixed gaps and final-row track alignment take priority over filling every pixel.

**Neutral**:

- Checklist names and item details may repeat; item identity comes from its server ID, never from displayed content.
- Expired lists remain fully usable.
- One and two character search is supported but can be less efficient than longer trigram searches.

## Out of scope

- Checklist reminders and notifications.
- Checklist sharing, collaboration and public links.
- Templates, copying, recurrence and repeat schedules.
- Manual reordering of checklist items.
- Standalone item edit routes or pages. The in-context detail Dialog is part of this feature.
- Autosaving individual item edits or deletions while the parent form has unsaved changes.
- Batch confirmation and cross result select all.
- Public or SEO checklist pages.
- New analytics, visual primitives, design tokens, breakpoints or external image assets.
- TanStack Virtual or another virtual list dependency.

## Follow-up

- [ ] `supabase-postgres-best-practices` is not yet named in root or `prisma/AGENTS.md`. After implementation proves the applicable rules, `/sync` should record only the durable schema, index and transaction conventions in the relevant context file.
- [ ] The official Vercel MCP may be evaluated later only if deployment or Cron log diagnosis needs it. It is not required for implementation and is not installed by this decision.

## Rationale

Reasoning, alternatives and sources: see [rationale.md](rationale.md).

## Verification

Runtime verification matrix: see [verify.md](verify.md).
