# SDK 生产维护命令

这些命令只支持已配置的博客 production → production 和 `feline_sdk_prod`。它们复用同一份 profiles，显式读取运行配置以确认目标，但数据库连接只取维护文件的 `POSTGRES_MIGRATION_URL` 和可信 CA，不回退运行身份或旧平铺变量。执行身份必须是新 schema 的专用 owner。来源、目标、用户、代次或状态不符时停止。

当前配置文件均在忽略目录 `.feline-blog/auth-rebuild/production-0.1.6/`。不要把实际 env、计划、验收证据、备份或 CLI 凭据上传、提交或贴聊天。独立 Node 脚本保留 `--conditions=react-server`，验证使用固定 Node 22.21.1 / pnpm 10.28.1。

## 公共入口

`pnpm auth:maintenance` 提供 inspect、bootstrap、restore、verify、activate。三个写命令必须显式选择 `--plan` 或 `--apply`，未知选项拒绝。plan 不写业务行；apply 从受限计划文件执行，并在同一事务内重新核对所有前提。

公共参数：

| 参数 | 内容 |
| --- | --- |
| --env-file | 专用维护 env，只允许 POSTGRES_MIGRATION_URL 和 POSTGRES_SSL_CA |
| --runtime-env-file | 明确的运行配置，供 profiles 环境和数据库绑定核对，不用其身份维护 |
| --profiles-file | 明确的非敏感 profiles JSON |
| --auth-user-id | 从此次新认证身份取得的目标 ID，仅 plan 使用，不能从旧用户邮箱联表代替 |
| --operator-label | 审计标签，不是执行凭据 |
| --out | 新计划的忽略路径，已存在时拒绝覆盖 |
| --plan-file | apply 或 verify 使用的完整计划 |

生产的前三个参数分别对应同一目录 `.env.maintenance.local`、`.env.runtime.local`、`integration.profiles.json`。维护命令显式使用 profiles-file，不把 profiles 直接交给 doctor。

## ROOT 初始化

先用 inspect 读取目标代次、状态和安全的新用户信息。bootstrap plan 需要指定的新用户已验证邮箱、资料完成、确认快照与当前邮箱一致、对应 Provider 的 Account 恰好一个，并有未到期的本地会话。当前邮箱仅用于已确认的初始化资格，不用来合并旧账号。User ID 必须属于新认证体系。

bootstrap 的 plan 记录 USER → ROOT、issuer、subject 摘要、资料确认和认证字段指纹。apply 只修改该用户角色及安装状态的初始化审计字段，进入 awaiting_restore，revision 加一。网页和运行角色不能执行此操作。完全相同的已完成计划返回 ALREADY_COMPLETE；不同计划再次初始化拒绝。

## 最终来源截止

`pnpm auth:source-cutoff --lock-env-file <受限来源持锁配置> --source-env-file <只读来源配置> --out <新的证明文件>` 是前台持锁命令。持锁配置只允许 POSTGRES_SOURCE_LOCK_URL 和 POSTGRES_SSL_CA，必须是既有来源 owner app_migrator，不能回退 postgres 观察身份或目标 runtime。它按固定排序仅对白名单来源表取得 SHARE 锁，不执行来源 DML、DDL、ACL 或清理；随后用独立来源只读身份执行 REPEATABLE READ 最终备份，并在锁内再次读取完整范围，比对全部内容摘要后签发审计证明。首次 postgres 观察连接没有足够锁权限，已回滚并保留记录；复用既有 owner，不为此改变旧 ACL 或角色权限。

证明绑定来源指纹、完整内容摘要、backupId、manifestSha256、数据库 OID、表 OID 摘要、持锁 PID 和截止时间。证明是维护流程记录，不是密码学签名或身份凭据。每 30 秒做只读健康确认，证明最多有效 5 分钟。保持此终端运行，在另一终端完成 restore、verify、activate，再输入 release 或按 Ctrl+C 释放；到期、EOF 或中止同样释放。

如已有完成收据但需要重试激活，可额外指定 `--backup-id` 与 `--manifest-sha256`，两者必须同时提供。只有当前被锁定来源的完整摘要仍与该备份一致时，才会重新认证同一备份；不重新导入、合并或删除目标数据。来源已变化时停止，不用新证明掩盖旧快照。

既有正式域名已指向 SDK 的新 schema。来源锁须保持到恢复、只读核验和开放完成，不能让正式写流量回到旧 public。普通读取仍可进行，白名单表的写入在短窗口内等待。

## 业务恢复

restore plan 还需要 `--backup-id`、`--manifest-sha256`、`--source-cutoff-file`。它核对完整备份、来源绑定、锁仍有效、ROOT、awaiting_restore 及全部目标业务与共享表为空。计划逐列列出覆盖的新旧业务资料、所有归属改写、行数、每表文件摘要、内容摘要、互动计数差异与自增序列下界。

旧 User 只恢复 username、avatar、phone、work，及 createdAt/updateAt 到独立 businessCreatedAt/businessUpdatedAt。认证 ID、邮箱、确认快照、角色、凭据和认证时间不导入。旧昵称不符合当前约束或 phone 冲突时拒绝，不能静默截断。业务主键保持，所有 owner 和 assignedBy 精确改写为指定新 ROOT ID。

apply 在事务内按父子顺序批量插入，重算实际导入的文章互动计数，复查完整归属、外键和 Workout 逻辑引用、唯一键、每表行数与归一化内容摘要，并确认认证字段指纹未改变。PostgreSQL 默认 UNIQUE 允许多条 NULL，旧 Pomodoro 的空 eventId 按此语义处理。

目标序列只校正新 schema 的 8 个 SERIAL，不后退、不越界。setval 不保证事务回滚时恢复原值，失败可以留下编号空隙，但业务行、完成收据和安装状态必须整体回滚，不能留半份恢复或自动开放。成功将 BusinessRestoreRun 与 AuthInstallState 原子绑定，revision 加一，仍为 awaiting_restore。

`verify --plan-file <restore计划>` 只读重查内容、身份、关系、序列和收据。restore 的完全匹配完成重放只返回既有收据，先于到期和 revision 检查；目标有数据且没有匹配收据时停止。

## 开放

activate plan 需要 `--evidence-file`，读取受限本地 JSON，不执行其中脚本或抓取远程内容。证据须绑定目标代次、新 ROOT、恢复收据、manifest 和内容摘要，记录真实认证、ROOT 与恢复核验，以及最终来源锁证明。apply 会重读证据、重算摘要、重查实际目标内容/序列和来源锁后，再设置 ready、保存证据引用并增加 revision。

2026-11-06 操作者明确跳过恢复演练，因此本次证据的 rehearsal 为 `status=not-run` 加明确授权，不写 passed。它不免除实际恢复和数据核验。开放后另做真实业务冒烟；缺第二个真实普通账号时，应明确记录普通账号完整隔离验证的边界。

所有维护事务统一使用目标代次 advisory lock、AuthInstallState 行、目标 User 行的锁顺序。新 apply 使用数据库时钟，计划期限固定 15 分钟；代次、指纹、schema、issuer/client/provider、revision 或输入变化即拒绝。摘要识别输入，不授予维护权限。完整状态和实际运行结果另记在 docs/reviews，不能只凭命令退出码声称全规格完成。
