# 0019 验收合同

以下为后续实施的验收计划，本轮均未运行。实际数据操作与生产操作需具备对应环境的明确授权。缺少资源时记录未运行原因，不用 mock 或上游结果关闭验收项。

## 固定组合及静态检查

核验 SDK/CLI 0.1.4 摘要、Better Auth 1.7.12 的唯一实际解析、公开导入、Node 22.21.1、pnpm 10.28.1、Next 16.3.3、React 19.2.4 和 Prisma 7.3.0，满足 AC-1。

运行 `pnpm prisma:validate`、`pnpm typecheck`、`pnpm lint`、`pnpm build`、`pnpm test` 和数据库边界检查。确认导入和构建不迁移、不读取来源数据、不要求实际认证网络请求，也不将秘密打入客户端。服务端模块进入客户端须构建失败，满足 AC-1、AC-2、AC-11。

使用目标实际安装 CLI 运行 doctor，显式指定 Manifest 和忽略环境文件。没有具体 issuer 的网络授权时不加 `--network`。逐项记录 status/code 及退出码：0 无 FAIL/BLOCKED、1 有 FAIL、2 无 FAIL 但有 BLOCKED、3 调用或配置错误。registration/storage/真实接线的 NOT_CHECKED 不得改写为通过，满足 AC-12。

## 隔离数据库

在授权隔离目标运行新增迁移、dev/shadow/verify 空库重放。非空目标必须在变更前拒绝，不能 reset 来源或重写历史迁移。核验原业务 User 关系、标准 User/Session/Account/Verification 字段、数据库默认角色、唯一键、FK、RLS、运行及维护角色权限，满足 AC-2、AC-4、AC-6、AC-8。

真实 Prisma adapter 验证新认证用户创建、事务回滚、同一中心 Account 首次并发关联冲突、Session token 唯一。应用角色不能 UPDATE role/维护状态或执行 bootstrap，匿名 Data API 角色不能读认证及维护表。不能靠扩大到对象所有者权限获得通过，满足 AC-2、AC-6。

## 新认证与普通用户

使用专用 Client、可信 HTTPS 和受控邮箱实际完成中心注册邮件、不自动登录、主动授权及 GET 回调，核对实际派生 Provider/callback。之后确认昵称并创建资料，刷新 `/profile`、读取 `/api/me`，核对默认 USER 与各业务角色限制，满足 AC-3 至 AC-5。

覆盖缺配置、匿名、资料未完成、解析故障及 5 秒超时、中心初始化失败后的显式恢复、重复资料提交、非法 returnTo、跨源写请求、越权参数、数据库故障。分别核对 401/403/409/429/503，不把临时故障当作匿名或允许业务访问，满足 AC-4、AC-5、AC-10、AC-11。

核对 setup 从服务端 identity 原子保存 profileEmailSnapshot/确认时间和独立业务时间；展示邮箱变更导致确认摘要不一致时返回 409。后续认证邮箱变化不覆盖确认快照、昵称或业务时间，账号页能展示差异并由当前用户显式重确认；重复 complete-profile 不隐式重确认。bootstrap 前认证邮箱与确认快照不一致须拒绝，满足 AC-4、AC-6。

旧 token JWT、旧随机会话 Cookie、旧密码和 POST bridge 不得认证。SDK 禁止路径、错误方法及原生额外登录参数按公开合同拒绝。正常退出后原 Cookie 不能认证；撤销失败或确认读取失败显示退出未确认，不自动重试。不能宣称已退出中心或强制新密码认证，满足 AC-3、AC-11。

## ROOT 与维护状态

初始化前普通业务不可用，只有指定新账号可完成初始化候选资料。CLI plan 不写数据库；错误邮箱/确认快照、错误用户、缺有效本地会话、非唯一 Account、错误 issuer/数据库代次、并发与重复 apply 都按规定拒绝或返回同一完成结果。仅一次显式 apply 提升指定新账号为 ROOT，满足 AC-6、AC-10。

对 bootstrap/restore/activate 分别验证统一计划：数据库时钟来源、15 分钟期限、未来 issuedAt、expectedRevision、严格字段和确定性摘要。修改字段而不匹配 digest 必须拒绝；即使重算摘要，也必须重查实际目标、身份、状态和文件，摘要不构成维护授权。核对各完成计划 digest 和开放验收引用/文件摘要的持久字段；相同完成计划在到期或 revision 推进后只读返回原结果，不再次写入，不同计划拒绝，满足 AC-6、AC-9、AC-10、AC-11。

确认 ROOT 尚未完成恢复时可验证账号页面和安全当前用户接口，不能写业务。网页、客户端 role 和邮箱相同不授予 ROOT。开放前验收记录必须分别证明本目标认证/ROOT/恢复只读检查，以及独立授权隔离库的业务演练，不能要求先通过被维护门禁禁止的目标业务写入；缺收据或缺这些证据不能 activate，满足 AC-5、AC-6、AC-10。

## 指定业务数据备份与恢复

只读来源包含指定用户的全部可归属业务及完整选定共享表，导出在同一快照。对所有触及所选 Blog/Todo/Tag 的关系边先做闭包扫描；以“根记录在范围而另一端越界”和“Tag 在范围而关联文章/Todo 越界”两类夹具，确认都拒绝 complete，不能仅过滤后凭 FK 通过。确认失败、文件中断、跨范围引用和摘要错误时不产出 complete 备份；检查文件/日志无密码、token、原始认证数据或连接串，满足 AC-7、AC-11。

恢复计划必须指向新完成认证的 ROOT User，源/目标 ID 明确。新操作遇到变更备份文件、错误目标、目标非空、主键/唯一键冲突、悬空关联或未知 assignedBy 必须停止；目标为空检查不排斥已经建立的新认证行和安装状态。事务中分别在数据写入、收据写入、restoreRunId 绑定及 revision 更新时注入故障，均不得提交部分结果，仍处于维护状态。并发 restore/activate 按统一锁顺序执行，不能提前开放，满足 AC-8 至 AC-10。

核对 Blog/Tag/Todo/Checklist/ChecklistItem/Pomodoro、互动、两个标签关联表，以及 DailyStat/Workout/Exercise/Prompt 的行数、摘要、FK、用户归属、时间和软删除状态。显式制造 WorkoutItem.exerciseId 找不到 Exercise 的源数据及目标导入缺失，分别验证导出完成和恢复后校验都拒绝；不能因为数据库没有这个 FK 就通过。计数按目标互动重算，自增序列后续插入成功，Checklist 请求幂等及 Pomodoro eventId 唯一有效，满足 AC-9。

确认源 username 对新昵称的覆盖已逐值显示在恢复计划中，avatar/phone/work 按白名单恢复，源 createdAt/updateAt 只写 businessCreatedAt/businessUpdatedAt。新 User 的标准认证时间、id、认证邮箱、确认邮箱快照/确认时间、ROOT、资料状态和认证字段均不覆盖；不导入源 User 整行、Session/Account/Verification 或旧认证记录。确认数据、完成收据、状态 restoreRunId 和 revision 同事务提交；重复相同计划在目标已有数据时直接返回完成，不重复导入，不同计划/清单不能自动合并；源库和其他旧账号均未修改，满足 AC-7 至 AC-9。

开放前在隔离验收库完成业务读写、角色/归属、界面与失败分支演练，该结果不能冒充本目标恢复后真实业务冒烟。显式 activate 后另在目标进行真实冒烟：ROOT 能访问恢复数据和原有作者/工作台功能，新普通用户能完成资料但不能读取 ROOT 私有数据或行使 ROOT 权限。覆盖桌面、窄屏、键盘、四主题、维护/错误/退出未确认状态及安全 Album 场景。开放后冒烟失败先停止流量/写入，保留新数据、报告失败，不把激活成功写为整体验收通过，也不自动回切数据库，满足 AC-4、AC-5、AC-10、AC-12。

## 交付记录

逐项保存环境指纹、包摘要、非敏感登记、schema/ACL、实际命令、计数/摘要及失败证据。对每条 AC 给出实际结果，明确本地实现、本地检查、真实认证/存储/恢复及生产状态。GA 阶段另做独立代码复审和交付说明；未经真实认证和存储验证，不更新 M2 为已验证，满足 AC-12。
