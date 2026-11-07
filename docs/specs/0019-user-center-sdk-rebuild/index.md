# 0019. User Center SDK 认证重建与单账号数据恢复

**Date**: 2026-11-04
**Status**: In Progress
**Scope**: 条目 34，Tracer Bullet，GA
**设计确认**: 2026-11-04 初始规格确认；2026-11-05 已授权 SDK 0.1.6 实施与本地联调，后续明确先备份、跳过恢复演练并上线。
**生产存储确认**: 2026-11-05，复用原博客 Supabase 的同一数据库，新增隔离 schema，保留旧 public、旧账号和业务数据。补充约定见 [同库隔离生产目标](production-schema.md)。此选择不授权清空 public 或按相同邮箱关联旧账号。

## Summary

采用全新的账号体系，将博客 User、Session、Account、Verification 调整为 Better Auth 标准模型，通过官方 Prisma 适配器接入 SDK。认证和业务使用同一个 Prisma 客户端及连接池，新用户确认昵称后获得普通业务访问资格。

先备份 `zxf_tech@outlook.com` 的业务数据及指定共享业务表，再在新目标库完成认证和维护 CLI 的 ROOT 初始化，最后恢复业务数据并开放访问。接受期间停机，没有旧账号迁移、认领、关联或审核流程。其他旧账号及其数据不进入方案，也不执行删除。

## Requirements

用户故事：新用户可以通过中心登录并创建博客资料；操作者可以安全初始化唯一首位 ROOT；数据维护者可以把指定账号的业务数据恢复到新账号，保持原有业务功能和权限。

1. **AC-1**：消费已核验的 SDK/CLI 0.1.6、Better Auth 1.7.12，保留 Next 16.3.3、React 19.2.4、Prisma 7.3.0；验证使用 Node 22.21.1、pnpm 10.28.1，不导入中心私有实现。
2. **AC-2**：统一 Prisma 模型符合固定 Better Auth 合同；User 主键、Session token、Account `(providerId, accountId)` 唯一且外键有效。认证表和凭据仅能由限定服务端身份访问。
3. **AC-3**：SDK 标准 GET 回调及登录、会话读取、本地退出可用；Cookie 安全、会话 86400 秒且不自动续期。旧 JWT、密码登录、旧会话和旧 POST bridge 不能获得访问权。
4. **AC-4**：认证成功不自动完成博客资料；用户确认中心邮箱快照、填写昵称后完成资料，新用户默认 USER。确认快照与认证邮箱分开保存，后续登录不隐式覆盖；并发及重复提交不会重复创建用户、冒领资料或提高角色。
5. **AC-5**：页面、API、Server Action 使用同一业务身份与角色/归属检查。匿名 401、资料未完成或权限不足 403、依赖故障 503，不能将服务故障当作匿名放行。
6. **AC-6**：ROOT 仅由维护 CLI 初始化一次，目标是新认证体系中邮箱符合 `zxf_tech@outlook.com` 的明确用户 ID。网页、首个登录、邮箱匹配和客户端参数都不能自行授予 ROOT。
7. **AC-7**：备份只读来源库，在一致快照下导出指定用户业务数据、其依赖和全部明确选定的共享业务表；先校验所有触及所选记录的关系闭包及逻辑引用，越界或缺失则拒绝完成；提供清单、行数和摘要，不导出密码、令牌或旧认证存储。
8. **AC-8**：先备份，后新认证及 ROOT 初始化，再恢复数据。恢复显式绑定源用户 ID 与新用户 ID，不覆盖新账号认证字段、角色或会话，不改其他旧账号。
9. **AC-9**：恢复对主外键、逻辑引用、用户归属、标签关联、计数、自增序列和幂等性有校验；数据、完成收据、状态绑定及 revision 在同一事务更新。未完成的新操作遇到冲突、缺失引用、摘要不符或目标非空时停止，已完成操作按相同计划直接返回结果。
10. **AC-10**：初始化和恢复期间保持维护状态，普通业务访问与写入关闭；登录、资料创建、当前用户检查和维护流程仍可验证。完成目标认证/ROOT/恢复只读校验及隔离环境业务演练后，才允许显式开放；开放后另做目标真实业务冒烟，失败先停止流量，不宣称整体验收通过。
11. **AC-11**：秘密只在服务端和忽略配置中加载，错误与日志有限且去敏；退出未确认不显示成功、不自动重试退出或换码。
12. **AC-12**：实际结果分别记录本地实现、静态诊断、真实认证、存储、恢复和生产验收。mock、上游 66 项回归及 doctor exit 0 不替代本项目证据。

## Decision

采用已确认的统一模型方案，不建立独立认证 schema、第二个 Prisma 客户端、额外 pg 连接池或旧账号映射/审核系统。

SDK 的 `database` 使用 `better-auth/adapters/prisma` 公开导出的 `prismaAdapter`，参数为当前 PostgreSQL Prisma 客户端及 `{ provider: "postgresql", transaction: true }`。宿主显式设置 `authUserPolicy: "allow-new"` 和 `sessionTtlSeconds: 86400`。Better Auth 创建的本地 User ID 同时作为新业务 User ID，这仅适用于本次已确认的全新账号前提。

**Implementation skills**：`prisma-orm-v7-skills`、`supabase-postgres-best-practices`；界面沿用 `design.md`、现有基础组件和严格 TypeScript 约定，不建立平行组件体系。

## Feature design

### 统一存储

所有模型继续位于 `prisma/postgres/schema.prisma`，迁移继续由 `prisma.postgres.config.ts` 和唯一的 `prisma/postgres/migrations` 管理。保留现有 `User`、`Session` 的 Prisma 模型名，新增 `Account`、`Verification`，使默认 delegate 名为 `user/session/account/verification`。物理表允许 `@@map` 为 `users/sessions/auth_accounts/auth_verifications`；不能用 `@@map` 冒充 Prisma delegate 改名。

| 模型 | 核心字段和规则 | 关系 |
| --- | --- | --- |
| User | 标准 `id/name/email/emailVerified/image/createdAt/updatedAt`；email 保持 citext 唯一；业务 `username` 默认空串、role 默认 USER；`profileCompletedAt/profileEmailSnapshot/profileEmailConfirmedAt/businessCreatedAt/businessUpdatedAt` 在资料完成前可空；保留 avatar/phone/work | 认证用户与业务用户为同一行，所有业务 FK 仍引用 User.id |
| Session | 标准 `id/token/expiresAt/createdAt/updatedAt/ipAddress/userAgent/userId`，token 为 text 且全局唯一 | 多对一 User |
| Account | 固定版本标准字段，包含 providerId/accountId/userId、可空 OAuth token/到期/scope/password 字段及时间；凭据列使用 text | 多对一 User；全局唯一 `(providerId, accountId)` |
| Verification | 标准 id/identifier/value/expiresAt/createdAt/updatedAt；identifier 索引，value 视为秘密 | 由 Better Auth 管理 |
| AuthInstallState | 单行 `id=primary`、phase、revision、targetGeneration；可空 rootUserId/rootInitializedAt/rootIssuer/rootSubjectDigest/operatorLabel/bootstrapPlanDigest；可空 restoreRunId、activationPlanDigest/activationEvidenceRef/activationEvidenceSha256/activatedAt | rootUserId FK User，restoreRunId FK BusinessRestoreRun，均删除 Restrict |
| BusinessRestoreRun | id、backupId、manifestSha256、planDigest、targetGeneration、sourceUserId、targetUserId、rowCounts、contentDigest、completedAt；完成收据字段非空 | targetUserId FK User；目标代次与清单摘要唯一 |

标准认证字段的类型、可空性、默认值和关系按固定 1.7.12 的官方 schema 合同核对，不从新版文档猜造。所有认证时间及新增状态时间使用 `timestamptz(3)`；OAuth token 由 SDK 固定的加密配置处理。Session token 和 Verification.value 仍按秘密管理，不能进入安全用户 DTO 或业务数据备份。

Prisma `User.username` 必须有默认值，避免 Better Auth 创建认证用户时缺少业务字段。认证 `name/image` 与业务昵称 `username/avatar` 分开，中心资料变化不自动覆盖已确认的博客昵称。业务资料创建只更新当前新 User，不再插入第二行 User。

`profileEmailSnapshot` 使用可空 citext，不设唯一约束；它是用户确认的联系邮箱，不是登录键。认证 `User.email/emailVerified` 由 SDK 管理，之后登录可能更新，不自动改写确认快照。资料完成时，上述五个业务状态/快照/时间字段均须非空；`businessCreatedAt/businessUpdatedAt` 使用独立 `timestamptz(3)`，不能与标准认证时间共用，也不使用会被 SDK 写入触发的 Prisma `@updatedAt`，由明确的业务资料操作或恢复写入。计划 digest、清单摘要和 subject 摘要为 64 位小写 SHA256 字符串，状态 revision 为非负整数。

为减少无关改动，可暂时保留历史 `password/authMode/authVersion/updateAt` 列及闲置旧认证表；它们不参与新鉴权。新增迁移把新用户默认模式改为 `sdk`，允许 `sdk + password NULL`，旧版本字段不成为新会话条件。现有 User CHECK、ACL 和旧触发器需逐项调整；历史迁移不能重写。旧资产的物理删除不属于完成条件。

迁移前断言新目标没有用户和业务数据，不满足则停止。此规格没有在已有账号库上升级或批量迁移账号的路径。源数据库与备份始终保留，不能把 reset 源库当作准备新目标的步骤。

### 注册与业务授权

1. `/login` 调 SDK 客户端 `startLogin({returnTo})`；标准 callback 完成中心认证及本地 User/Account/Session 创建。
2. `getPrincipal` 调用只读 `resolveBusinessUser(identity, {requestId, signal})`。宿主按 `identity.authUserId` 读取同一 User，并要求 `profileCompletedAt` 非空；稳定中心身份仍由 SDK 的 issuer、subject 和唯一 Account 确认。
3. 未完成资料返回 unmapped，UI 文案为“完成博客资料”，导航到 `/auth/setup`。不出现旧账号认领、审批或按邮箱查找账号的操作。
4. setup DTO 明确区分 `action=complete-profile` 与 `action=confirm-email`，均要求 `emailConfirmed=true` 和展示邮箱的 `emailSnapshotDigest`；只有完成资料操作接收昵称及可选的允许 returnTo。邮箱值仅来自服务端 SDK identity.profile，浏览器不能指定写入邮箱。展示摘要为展示字符串 UTF-8 的 SHA256，服务端与本次 identity 重新计算比较，不一致返回 409 并要求刷新确认；摘要只防止过期界面确认，不是身份或近期邮箱验证证明。
5. 昵称去首尾空白，1 至 64 个 Unicode 字符，不允许控制字符。完成资料时在短事务中锁当前 User，复查 identity 对应的本地用户和邮箱未改变，一次写入 username、profileCompletedAt、profileEmailSnapshot、profileEmailConfirmedAt、businessCreatedAt、businessUpdatedAt，所有初始业务时间取本次服务端时间。role 不在 DTO 中。已经完成资料的重复 complete-profile 返回存储结果，不覆盖昵称或快照。
6. 已完成资料的用户可在账号页通过 confirm-email 明确重确认当前认证邮箱：按同样的展示摘要与服务端 identity 检查，只更新确认快照、确认时间及 businessUpdatedAt，不改变昵称、角色或 profileCompletedAt。初始化阶段沿用候选邮箱/ROOT 的阶段限制；ready 后仅允许当前本人。后续登录若认证邮箱变化，账号页同时显示当前认证邮箱与已确认联系邮箱，直到用户主动重确认；业务授权始终依赖 SDK 身份、资料状态及角色，不依赖邮箱相等。
7. `userAuth.ts` 输出当前业务安全投影，业务 `email` 来自 profileEmailSnapshot，业务 `createdAt` 来自 businessCreatedAt；账号页可额外显示当前认证邮箱。继续复用 `requireAuth`、Todo/Blog/ROOT 守卫及资源归属条件。SDK 安全会话里的 email 仍是认证邮箱，不代表业务确认快照或角色检查。

### 初始化与开放状态

`AuthInstallState` 随迁移建立一行，phase 为 `awaiting_root`、revision 为零、targetGeneration 为新 UUID。缺行、非法状态或配置不一致时拒绝业务访问。

```text
awaiting_root → awaiting_restore → ready
```

`awaiting_root` 只允许符合初始化邮箱的新认证用户完成博客资料；其他身份可有 SDK 会话，但 setup 返回固定 `INITIALIZATION_PENDING`。这不授予该邮箱任何角色。

维护 CLI 的 `bootstrap --plan --auth-user-id <新ID>` 使用显式维护配置，重新读取 User、Account 和未到期的本地 Session：当前认证邮箱符合指定值、emailVerified 为 true、资料已完成、确认快照与当前认证邮箱相符、对应当前派生 Provider 的账号恰好一个、仍有有效本地会话、初始化尚未完成。初始化邮箱及快照比较采用去首尾空白和小写化后的字符串；不一致时拒绝并指向账号页显式重确认，不能自动改写快照。emailVerified 仅作已存本地验证状态，不声称证明中心当前邮箱或最近输入过密码。

计划输出目标代次/数据库指纹、新用户 ID、issuer、subject 摘要、当前角色与 USER→ROOT 变化。操作者从新登录的安全当前用户结果取得 ID，不能以源用户 ID 或邮箱联表代替。`--apply --plan-file <忽略路径>` 按下方统一计划及锁顺序重查全部条件，同事务更新角色、初始化审计字段、bootstrapPlanDigest、phase 及 revision。操作者标识为审计标签，维护数据库凭据才是执行授权。

普通运行角色不能执行 bootstrap，也不能 UPDATE role。网页没有提升权限接口。相同完成记录重复执行返回已初始化，其他用户或不同计划再次执行均拒绝。维护配置仅显式读取 `POSTGRES_MIGRATION_URL` 和远程可信 CA，不回退到运行连接，不向 Next 注入维护凭据。

`awaiting_restore` 允许该 ROOT 验证 `/profile`、`/api/me` 和 SDK 会话；普通业务访问及写操作仍处于维护状态。`requireAuth` 等业务入口增加统一就绪检查，不能只隐藏按钮。开放前条件为本目标的认证、ROOT 和恢复只读校验通过，以及授权隔离验收库的业务演练通过；不要求在维护门禁仍关闭的目标上先执行业务写入验收。满足这些条件后维护 CLI 的 `activate --plan/--apply` 才把状态改为 ready，开放普通用户资料创建和既有角色允许的业务功能。

维护门禁也覆盖无需 requireAuth 的公开文章、列表和业务 API，统一返回维护页/503，不能仅在登录用户守卫或导航中检查。登录、SDK 路由、setup、profile、当前用户和最小健康接口按上述阶段单独允许，不通过门禁直接泄露业务数据。

activate 只能使用当前状态 restoreRunId 指向的完成收据，核对目标代次、ROOT ID、manifestSha256 及恢复计划摘要，并由操作者提供已审阅的开放前验收记录引用和文件 SHA256。记录须分别标明本目标认证/ROOT/只读恢复结果与隔离库业务演练结果；引用只记录维护者的开放决定，不能冒充工具独立证明认证已通过。apply 重读本地验收记录并核对摘要，不执行其中脚本、不自动抓取网络引用；同事务保存 activationPlanDigest、activationEvidenceRef、activationEvidenceSha256、activatedAt，增加 revision 并进入 ready。

进入 ready 后另行执行本目标真实业务冒烟，覆盖恢复内容、ROOT 操作及普通用户隔离，并单独记录结果。冒烟失败时先停止业务流量/写入，保留新数据并报告；不能标整体验收通过，也不自动回退阶段、重放旧备份或恢复旧登录。生产流量开放及停止由相应环境的已授权操作者执行。

### 维护计划与幂等合同

bootstrap、restore、activate 共用版本化计划 envelope：`schemaVersion=1`、command、targetGeneration、databaseFingerprint、expectedRevision、规范化 issuer/clientId/providerId、操作对象 ID、完整命令输入、issuedAt、expiresAt、planDigest。restore 输入包含 backupId、manifestSha256、源/目标用户 ID、每表文件摘要及资料覆盖差异；activate 输入包含 restoreRunId、收据摘要及验收记录引用/摘要；bootstrap 输入包含目标新用户 ID、subject 摘要、预期角色与确认邮箱快照。所有字段严格校验，未知字段拒绝。

issuedAt/expiresAt 为 UTC 毫秒精度的 `YYYY-MM-DDTHH:mm:ss.sssZ` 字符串，issuedAt 及新 apply 的校验时间取目标维护连接的数据库时钟，expiresAt 固定为 issuedAt 加 15 分钟；开始新 apply 时须处于此时间窗，未来 issuedAt、到期或 revision 陈旧均拒绝。planDigest 为不含自身字段的计划体的 SHA256：使用 UTF-8 JSON、对象键递归排序、数组保留顺序；版本和 revision 等计数为非负安全整数，拒绝非有限数或有歧义的数字表示。完整输入包含备份或验收文件摘要；apply 重算摘要并重新读取数据库当前事实。摘要用于识别和防误改，不是签名或授权证明，能够重算摘要不等于取得维护权限。

databaseFingerprint 对连接配置中的规范化主机名、显式端口、数据库名计算 SHA256，不包含用户名、密码或完整 URL；apply 还须从数据库读取并匹配 targetGeneration，不能只相信计划内指纹。命令从显式维护配置取得实际连接、固定 Manifest 和本地输入，不能从计划切换任意连接或执行任意 SQL。

所有维护写命令统一锁顺序：目标代次对应的事务级 advisory lock、AuthInstallState 行、目标 User 行，之后才检查或写入相关收据。执行身份先通过维护角色核验，计划本身不是身份凭据。在锁内，先检查本命令、同一目标代次、相同 planDigest 的已完成记录及其不可变输入；完全匹配则只读返回完成结果，不因到期、revision 已推进或目标已有恢复数据而重复写入。不存在完成记录才检查期限、expectedRevision、phase、目标为空等新操作前置条件。

已完成的同一命令若提交不同 planDigest，拒绝为不同计划，不重新执行。`restore --plan` 在检测到相同已完成收据时只报告既有结果，不生成一份新的可写计划。bootstrapPlanDigest 与 activationPlanDigest 存在 AuthInstallState，restore 的 planDigest 存在 BusinessRestoreRun；完成记录同时约束当前目标代次和操作对象，不能以别的环境或用户的结果满足重放检查。

### 备份与恢复

来源使用显式选定的只读配置，快照为 read only repeatable read。备份目标是当前被邮箱精确选中的一个源 User；零个或多个候选均停止。该邮箱只用来选择备份对象，不参与新认证账号认领。

| 范围 | 导出与恢复规则 |
| --- | --- |
| 业务 User 资料 | 导出 ID、邮箱、昵称、avatar、phone、work、业务时间等白名单资料；不导出密码、authMode、authVersion 或旧认证身份 |
| Blog、Tag、Todo、Checklist、PomodoroRecord | 只选择源用户为 owner 的根记录，保留正文、软删除、时间、事件标识和修订数据 |
| ChecklistItem | 按已选 Checklist 完整导出 |
| TagsOnBlogs、TagsOnTodos | 先扫描所有触及所选 Blog/Todo/Tag 的边；任一端越界或缺失则记引用异常并拒绝 complete，不静默过滤。闭包通过后才导出两端在范围的集合；assignedBy 必须可明确改写 |
| BlogLike、BlogFavorite | 只导出源用户自己的互动；引用不在范围的文章时列为引用异常并停止完成，不自动携带其他账号文章 |
| DailyStat、WorkoutItem、WorkoutSet、Exercise、Prompt | 用户已明确全部纳入；检查完整父子关系和全局键，并显式检查没有 FK 的 WorkoutItem.exerciseId→Exercise.id，每项都必须存在；不能伪称这些无归属表已按邮箱筛选 |
| 认证及运维运行数据 | 不导出 Session、Account、Verification、旧 JWT/中心 grant/flow/browser/session、清理运行记录或 Prisma 迁移元数据 |

备份目录位于忽略的 `.feline-blog/backups/<backupId>/`，按表保存稳定顺序的 UTF-8 数据文件。清单记录 schemaVersion、backupId、源库非敏感指纹、源 User ID、共享表范围、每表列白名单、行数、SHA256、引用检查及完成状态。文件使用本机受限权限，不上传或提交；日志只输出阶段、计数和有限错误码。读取所有数据并完成摘要及引用校验后，才能把备份记为 complete。凭据和源连接串不写进清单。

恢复是宿主维护工具的数据库操作，没有网页导入和账号关联接口。`restore --plan` 先查同一目标代次与清单的已完成收据；匹配时只返回完成结果，否则核对完整备份、列白名单、摘要、目标代次、初始化 ROOT 身份、phase=awaiting_restore 及目标业务表为空，生成明确的 `sourceUserId → 新 ROOT User.id` 归属改写计划。目标业务表为空不包括已经建立的新认证 User/Account/Session 和安装状态，但其他业务根、子表及共享表必须为空。其他旧 User 不导入，新 User 不以旧行覆盖。

`restore --apply --plan-file ...` 按统一锁顺序持锁，以一个数据库事务恢复父表、子表和关联，按明确映射改写 userId/authorId 及 assignedBy。锁内先处理完全匹配的完成重放，新操作才核对 expectedRevision、awaiting_restore、ROOT 和目标为空。若 assignedBy 不是源 ID，不猜测归属，计划阶段报告异常。保留业务行主键；新操作的目标非空或主键冲突一律停止，不自动合并或重新编号。维护状态阻止并发业务写入，SDK 自身的必要会话读写继续允许。

恢复 User 使用下列逐列白名单，所有将覆盖新资料的值都须列入 plan 中的前后差异，并纳入 planDigest；不允许笼统的“业务时间”或任意列覆盖。

| 源 User 字段 | 目标或用途 |
| --- | --- |
| id | 仅作为源标识和所有权改写输入，绝不更新目标 User.id |
| email | 仅保留在受限备份元数据中用于源选择核对，不写新认证邮箱或确认快照 |
| username | 明确覆盖刚确认的新昵称，保留原业务昵称；由恢复计划逐值展示 |
| avatar、phone、work | 对应写入同名业务字段，包括源 null 值；phone 唯一冲突则拒绝 |
| createdAt | 写入独立 businessCreatedAt，不更新标准认证 createdAt |
| updateAt | 写入独立 businessUpdatedAt，不更新标准认证 updatedAt 或历史兼容 updateAt |

恢复不写 name、image、emailVerified、profileEmailSnapshot、profileEmailConfirmedAt、role、profileCompletedAt、password、认证模式/版本或任何认证时间。businessCreatedAt/businessUpdatedAt 初次完成资料时取新时间，只有受控业务恢复才按上表导入源历史；普通资料修改仅推进 businessUpdatedAt。安全业务用户投影继续从这两个业务字段取业务时间，不暴露或混用认证时间。

核对各表行数、归一化内容摘要、所有外键、标签关系闭包、WorkoutItem.exerciseId→Exercise.id 逻辑引用、组合唯一约束、Checklist 请求标识和 Pomodoro eventId。逻辑引用缺失与 FK 错误同样拒绝完成，不新增占位 Exercise 或自动改写来源。Blog 的 likeCount/favoriteCount 按目标中实际恢复的互动行重算，并记录与源计数的差异。对自增表把 sequence 调整到不小于已恢复最大 ID 的安全后继位置。PostgreSQL sequence 调整不保证事务回滚时还原原值，失败可能留下编号空隙；不得留下部分业务行，也不能因此开放业务。

`BusinessRestoreRun` 在数据事务结束前写入完成收据，记录 planDigest、目标代次、备份摘要、源/目标用户 ID、计数和最终摘要；同一事务把 AuthInstallState.restoreRunId 绑定到该收据并将 revision 加一，phase 仍为 awaiting_restore。数据、收据、状态绑定任一写入失败，整个事务回滚；并发 restore/activate 使用相同锁顺序，不能看到未提交或未绑定的完成结果。完成收据不是 activate，后者仍需维护者明确执行。

### HTTP 与界面表面

SDK authBasePath 使用 `/api/auth`，只公开 SDK 的 POST sign-in/social、GET callback/{providerId}、GET get-session、POST sign-out。删除或停用旧静态认证入口，避免它们抢占 catch-all；安全业务用户接口迁为 `/api/me`。不暴露原始 Better Auth handler、通用用户管理或原生扩展登录参数。

| 表面 | 输入与身份 | 输出/失败 |
| --- | --- | --- |
| `/login`、SDK 四个端点 | 客户端仅传 returnTo；路由 runtime=nodejs | 有限错误页；退出不明保持失败反馈，可由用户主动检查安全会话 |
| `/auth/setup`、POST `/api/account/setup` | SDK getIdentity，action、昵称、邮箱确认及展示摘要、returnTo；confirm-email 不接收昵称 | 完成资料/显式重确认或 401/403/409/503；维护阶段按候选/ROOT 限制 |
| `/profile`、GET `/api/me` | getPrincipal，读取业务资料和安装状态 | 安全用户 ID、昵称、业务邮箱快照/业务时间、角色、资料/维护状态；账号页可显示当前认证邮箱，不返回认证秘密 |
| 既有业务页面/API/Action | requireAuth + 就绪状态 + 现有角色/归属检查 | 401、403、503；合法访问维持原有业务规则 |
| 维护 CLI | 显式维护配置、计划文件、目标代次 | plan 默认不写 DB；apply 单独执行并重查前置条件 |

returnTo fallback 为 `/profile`，精确允许 `/`、`/profile`、`/todo`、`/tomato`、`/blog/new`、`/checklists`，按段允许 `/blog/edit`、`/checklists` 前缀；query 键初始为空。未提供使用 fallback，非法值拒绝。资料页的继续目标由宿主再次校验，不把浏览器提供的协议参数透传 SDK。

页面默认服务端组件，仅按钮和表单交互使用客户端。复用 Content、NeuPanel 和现有主题；覆盖匿名、资料未完成、维护中、处理中、依赖失败、退出未确认及恢复后的成功状态。新界面同步安全 Album 场景。登录/资料界面不展示数据库、适配器或运维细节。

所有宿主写入口重新验证 Origin、同源请求、服务端身份及严格 DTO，拒绝跨源和多余字段；JSON 接口只接受 application/json，跨站表单不能写入。SDK 内部 CSRF 不被关闭。资料操作按当前 authUserId 及可信 IP 限流，不直接复用绑定旧 browser epoch 的 CSRF 实现。限流状态采用数据库桶，匿名/资料/维护相关请求的建议上限为每 IP 20 次/分钟、每用户资料提交 5 次/分钟，超出返回 429 和 Retry-After。

### Value sourcing

| 值或动作 | 唯一来源 |
| --- | --- |
| issuer、平台 origin、Client ID、Provider ID、callback | 操作者提供的非敏感配置及 SDK describeRegistration；不能采用旧生产默认值 |
| 当前身份、认证邮箱、本地 User ID | SDK getIdentity/getPrincipal；不采信浏览器 userId/role/email |
| 确认邮箱快照及展示摘要 | 服务端 identity.profile.email 写入 User.profileEmailSnapshot；展示摘要仅与当前服务端值比较，确认时间由服务端生成 |
| 业务昵称、角色、资料状态及业务时间 | 当前 User 行，昵称来自已校验表单或明确恢复白名单；业务时间取 businessCreatedAt/businessUpdatedAt，role 默认 USER 或维护 CLI 明确提升 |
| ROOT 候选和授权 | 新 User ID、对应唯一 Account、有效本地 Session、固定初始化邮箱及受信维护操作者 |
| 源用户、共享表、备份完成性 | 只读来源快照、源选择结果及已批准表清单、文件摘要和引用校验 |
| 恢复所有权 | 计划文件中的源 ID→新 ROOT ID，双方均在 plan/apply 重新核对 |
| 计划有效期、身份识别摘要 | 版本化计划 envelope、固定 15 分钟时窗和确定性 JSON 摘要；实际维护凭据才是执行授权 |
| 业务就绪、幂等结果、审计及开放依据 | AuthInstallState 的完成计划 digest/restoreRunId/验收引用及 BusinessRestoreRun，来自相同事务；开放前/后证据分开，不从事件日志推定成功 |

### 配置与权限

实际 issuer、可信 HTTPS origin、Client ID 和回调登记仍是环境输入，不填旧生产地址或占位值冒充有效配置。维护命令缺少这些值时失败，不能自行建生产 Client。

| 配置 | 用途 |
| --- | --- |
| `integration.json` | 真实非敏感 Manifest，固定 authBasePath、returnTo 和有限 errorPath |
| `USER_CENTER_CLIENT_SECRET`、`PLATFORM_SESSION_SECRET` | 独立服务端秘密，后者至少 32 字符；不通过 NEXT_PUBLIC、props、日志或命令参数传递 |
| `POSTGRES_DATABASE_URL`、`POSTGRES_SSL_CA` | 唯一应用运行连接及可信 CA；保留现有连接池总预算 |
| 显式维护 env 文件 | 只供 bootstrap/restore/activate 进程读取 POSTGRES_MIGRATION_URL、CA，不能回退运行连接 |
| 显式只读来源 env 文件 | 备份读取来源；不自动合并其他 .env，不将来源连接注入 Next |

应用运行角色拥有 Better Auth 所需的限定表操作及业务资料操作，不拥有 DDL、维护状态更新或角色提升权。User 新建角色由数据库默认/受控约束保证 USER；role 更新仅维护身份可用。Prisma adapter 实际生成 SQL 的列权限和失败回滚行为必须在隔离库验证，不能为消除权限错误直接授予所有者或 BYPASSRLS。

数据库新增 guard，明确配置的运行角色 INSERT User 时只允许默认 USER，拒绝显式 ROOT/ADMIN 等值；运行角色不能 UPDATE role，也不能删除已完成业务资料的 User。未完成资料的认证用户在官方适配器失败回滚中需要删除时，可按这一受限条件允许。维护身份与运行身份不得互相继承；任何受控函数也不能成为绕过这些限制的提权入口。

认证及维护表启用 RLS，显式撤回 PUBLIC、anon、authenticated 等非运行身份的表/列/函数访问；业务 User 的安全公开投影仍经宿主接口提供。旧认证 ACL 安装脚本不得在新部署重放覆盖新权限。运行角色不得直接修改安装状态、恢复收据或完成 ROOT 提升。所有需要的受控函数固定 search_path、限定对象名并显式撤回 PUBLIC 执行权限。

## Build plan

1. 固化真实配置输入和可信制品获取方式，核验固定包与公开入口；实现独立的业务备份计划和一致快照导出，在任何目标重建前产出可检查的完整备份，覆盖 AC-1、AC-7、AC-8、AC-11。
2. 在空目标上调整统一 User/Session/Account/Verification、资料状态及维护收据；通过唯一 Prisma 链生成新增迁移、空库重放和权限校验，覆盖 AC-2、AC-6、AC-9、AC-10。
3. 先打通一个新用户的 SDK 登录、GET 回调、资料确认、`/profile` 与 `/api/me`、刷新及退出，再接统一角色守卫和旧入口停用，覆盖 AC-3、AC-4、AC-5、AC-10、AC-11。
4. 完成维护 CLI 的 plan/apply、唯一 ROOT 初始化与维护状态检查，以新 ROOT 身份验证受保护路径，覆盖 AC-5、AC-6、AC-10、AC-11。
5. 完成恢复计划、事务导入、计数/引用/摘要/序列校验和完成收据；验证后显式 activate，开放普通用户并核对原有业务，覆盖 AC-7、AC-8、AC-9、AC-10。
6. 执行静态检查、全部适用回归、真实浏览器及存储失败分支，进行独立复审并更新接入记录和过时认证约定，覆盖 AC-1 至 AC-12。实际数据和生产操作仍需对应环境授权。

## Migration plan

**Strategy**：接受维护窗口，来源只读备份，新空目标重建，完成新认证后显式恢复。没有双写、旧登录兼容或在线账号迁移。

顺序为备份验证、停止旧写入、核对或重做最终一致快照、新空目标迁移、新 SDK 认证/资料确认、CLI ROOT 初始化、业务恢复和核验、显式开放。最终导出至开放期间，来源业务写入保持冻结，不能用过期备份覆盖后来产生的数据。

目标迁移只修改 `prisma/postgres` 的新文件，不能重写已有已审核迁移。目标非空即停止，不自动 reset、drop 源库或删除其他账号。接受停机不代表授权在本轮执行停机、数据库重建或生产切换。

**Rollback**：开放前失败时保持维护状态，保留源库与备份，在隔离目标修复或重建后重新认证和恢复；不恢复旧密码或旧登录入口。开放后已有新业务写入时，不直接重放旧备份或回切旧库，先冻结写入并另定恢复方案。

**Risks**：非空目标、来源发生变化、跨范围外键、共享表冲突、用户 ID 改写遗漏、计数或 sequence 错误、列权限不兼容。任一前置校验失败都不能以“部分恢复成功”开放业务。

## Consequences

统一模型消除第二个认证数据库和身份桥接，使用固定公开适配器。代价是 User/Session 模型、旧认证消费代码及权限脚本要配套调整，并需要停机窗口。恢复后的用户 ID 是新值，原业务行所有权由显式恢复计划改写；不保证旧会话、旧浏览器本地缓存或旧用户 ID 外部链接继续有效。

SDK 标准平台会话不承诺中心撤销立即使博客退出，也不承诺本地退出后中心要求重新输入密码。中心注册和邮件验证不自动登录；真实邮件和授权有效期问题按中心合同重新发起授权，不重放旧 state/code。

## Follow-up

1. 提供真实 issuer、HTTPS、专用 Client、受控邮箱、隔离目标和只读来源配置，核实制品许可及 CI 私有获取路径；这些资源仍待准备或核验。
2. 实施时同步根/嵌套 AGENTS.md、`docs/auth/user-center.md` 和 scope 条目 11 的旧密码恢复方向；本轮不修改规则以伪装代码已经切换。
3. 旧认证表、函数、依赖和运维资产的最终物理清理单独审阅；不启用云端清理或监测，不改变配额或购买资源。
4. 按 [verify.md](verify.md) 留证。M2、真实存储及生产验收在证据齐全前仍为待验。

## Rationale

约束、选项及核验来源见 [rationale.md](rationale.md)。前期评估 0018 保留为历史材料，本规格采用后续已确认的全新账号与单账号数据恢复前提。
