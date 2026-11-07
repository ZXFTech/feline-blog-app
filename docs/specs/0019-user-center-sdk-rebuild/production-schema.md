# 同一数据库内的隔离生产目标

2026-11-05，操作者明确选择复用原博客 Supabase 数据库、新增隔离 schema，并跳过本次恢复演练、先上线。沿用新认证账号、显式 ROOT 初始化、单账号业务恢复的设计，保留旧 public 及其他账号数据。

## 存储与身份

目标项目固定为 `zjnjjzgxiltulkuhrjng`。来源仍为 public；新目标命名为 `feline_sdk_prod`。新角色 `blog_sdk_prod_runtime` 和 `blog_sdk_prod_migrator` 分开使用，密码自动生成到忽略配置，不修改已有角色密码或权限。现有 User ID 保留在 public，新认证用户获得新 ID，恢复计划显式改写指定业务归属，不凭邮箱合并。

生产配置为 production → production，origin 为 https://blog.zhaosie.com，issuer 为 https://auth.zhaosie.com/api/auth。生产命名空间由宿主服务端变量 PLATFORM_PRODUCTION_POSTGRES_SCHEMA 提供，并严格要求为 feline_sdk_prod。它是宿主适配器约定，不向 SDK 的 profiles schema 添加私有字段。development/staging 默认仍使用 public，不改变已验证的本地模式。

PrismaPg 显式设置 schema；应用涉及业务表的原生 SQL 也必须使用同一可信命名空间，不允许通过 URL options 或任意客户端输入改变 search_path。新运行角色对旧 public 的认证和业务表必须没有读写权限；迁移前后核对，避免遗漏限定的 SQL 退回来源。可复用数据库的 citext/pgcrypto 类型与函数，不改变其安装或权限。

原 SDK 空库迁移保持不改，不在有数据的 public 上执行。生产使用独立的新 schema 初始化脚本和记录，只创建新目标对象，目标非空或未知历史时停止。DDL、外键和序列必须属于新命名空间；提交前拒绝指向 public 业务表或序列的引用。来源表、User ID、行数、内容和现有角色权限不因初始化而改变。

## 来源备份保护

单事务 REPEATABLE READ READ ONLY，并实际验证 transaction_read_only=on。来源仍采用明确配置、TLS、来源指纹和列白名单。备份完成与验证先于新目标写入。关系闭包、共享表范围、文件摘要、完整清单和原子发布规则不变。

2026-11-06，本次最终来源截止由独立的既有来源 owner 连接保持事务完成。实际核对表 owner 为 app_migrator，postgres 观察身份只有读取权、无足够锁权限，因此持锁使用单独受限文件中的既有 app_migrator，不新增授权或改变旧 ACL。它只对 `scripts/auth-rebuild/contracts.ts` 精确来源白名单的全部表（包括 users）按固定排序取得 `LOCK TABLE ... IN SHARE MODE`，不执行 DML、DDL、ACL 或清理。全部锁取得后，独立来源连接使用现有只读 REPEATABLE READ 备份流程；快照时刻为此后该备份事务第一次读取建立快照的时刻。来源锁覆盖最终备份、新目标恢复、只读核验及 activate；正式路由已确认指向新 schema 后释放。锁临时阻塞白名单表的写入，不改变旧 public 对象、行和权限。

Supabase pg_cron 默认给 PUBLIC 在 cron.job_run_details 上 DELETE，只允许 username=CURRENT_USER 的历史。为保留现有 ACL，备份检查可精准识别这一个受控元数据例外，不把凭据称为全库零写权限。必须证明对象属于 pg_cron 扩展、RLS 开启、唯一 permissive ALL PUBLIC 策略等价于 username=CURRENT_USER、没有不明 WITH CHECK、当前身份非 owner/无 BYPASSRLS，且仅 DELETE 来自既有 PUBLIC ACL；任何其他写权、列写权、其他表或可切换 writer 身份仍拒绝。不能排除整个 schema。记录该例外并保留真实只读事务，绝不执行 Cron 删除。

## 上线与开放

先准备隔离 schema/角色和严格配置，再发布维护状态的新版本并完成真实生产认证；旧 public 保留。ROOT、恢复和开放依旧只能由受限维护流程完成，未完成时业务保持维护。跳过恢复演练来自操作者明确指令，应在验收记录中标为未运行，不宣称已通过。普通构建、目标归属、权限、真实认证及恢复结果检查仍保留。

2026-11-06，操作者进一步明确授权补齐维护命令、初始化本次新认证账号为 ROOT、恢复指定账号业务并在核验后开放，同时仍跳过恢复演练。activate 的本地证据可将 rehearsal 标为 not-run 并记录此项明确授权，不得标为 passed；真实生产认证、ROOT 及正式恢复只读校验仍为必需。开放后的真实业务冒烟另行记录。释放来源锁前确认正式路由和运行身份均指向新 schema，不能把仍向旧 public 写入的正式流量视为完成切换。

Vercel 目标按已核实的正式域名绑定使用现有 feline-blog-staging 项目的 Production deployment，不创建新项目或购买资源。部署前记录旧 deployment/alias，以独立受限目录打包可信 SDK tgz、公开 production JSON 和应用代码，不上传实际 env、来源连接、维护密码、备份或 CA 私钥。Node/Next 固定版本与 runtime/target 严格校验不变。

若发布或实际恢复失败，保留旧 public 和新目标证据，不自动删除 schema、不重放备份、不修改源业务行。已经有新写入后的回切需要审阅差异，不能把旧库当作可无损覆盖的新库。
