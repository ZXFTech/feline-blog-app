# 生产 ROOT 初始化与单账号业务恢复

2026-11-06，北京时间。操作者明确授权初始化本次新认证账号为 ROOT，恢复 `zxf_tech@outlook.com` 的业务，核验后开放博客，保留旧 public 和其他账号，明确不做恢复演练。

## 数据库结果

生产平台与中心均为 production，来源为原博客 Supabase 项目 `zjnjjzgxiltulkuhrjng` 的 public，目标为同库隔离 schema `feline_sdk_prod`。没有连接用户中心数据库，没有在本轮执行 DDL、迁移、reset 或 db push。

维护命令现已提供 `inspect`、`bootstrap`、`restore`、`verify`、`activate`。写操作必须显式 plan/apply，计划绑定数据库、schema、目标代次、中心、Client、身份和 revision，使用数据库时钟及 15 分钟期限。相同已完成计划可以返回完成收据，不能重新导入或反复提升权限。

新账号在仍有有效平台会话、邮箱和资料确认一致时初始化为 ROOT。操作者已在正式 `/profile` 亲自确认 ROOT 和维护提示。来源旧 User ID、角色和认证数据没有导入到新身份。

恢复与收据在单个目标事务提交。只改写白名单业务归属到这个新 User ID，保留业务主键及历史时间；User 仅恢复 username、avatar、phone、work 和两个业务时间字段。密码、会话、中心身份、邮箱验证、资料确认和 ROOT 不被旧数据覆盖。全文摘要、关系闭包、唯一性、计数和八个序列检查通过，序列只允许前进。

| 表 | 恢复行数 |
| --- | ---: |
| users 业务资料 | 1 |
| Blog | 13 |
| Tag | 44 |
| Todo | 117 |
| PomodoroRecord | 307 |
| TagsOnBlogs | 6 |
| TagsOnTodos | 151 |
| BlogLike / BlogFavorite | 2 / 1 |
| DailyStat / Exercise | 4 / 2 |
| Prompt | 3257 |
| Checklist / ChecklistItem / WorkoutItem / WorkoutSet | 均为 0 |

最终备份 ID 为 `1253f5d0-3969-42d1-ac21-04fc462c1182`，manifest SHA256 为 `9fbe219c499316534c5611f995bb3a6abe860adf2d7367c6c1b895191e833b9a`，转换后内容摘要为 `f1f01c0b07719ff272e1120073bc5680066cd292703249b2773e231818ba0476`。恢复收据为 `77efa445-70ba-4ec1-9628-220704949e47`。

| 操作 | 计划 SHA256 | 预期 revision |
| --- | --- | ---: |
| bootstrap | `0e0f6ec11730227021e592833c0700e285b9e2df4cfcca6717485f0240adeb4b` | 0 |
| restore | `c1775f0b0d63f737bacddc3ca947c2d8656de048d5f19a0b0b10e5ab1c41d719` | 1 |
| activate | `ee9cdc2763219cddadebb51e421ff78b54a3d6144eae151386309f246ac71680` | 2 |

15:52:46，目标已提交 ready、revision 3，ROOT 与恢复收据绑定完整。这个数据库状态不等于正式 HTTP 冒烟已经通过。

## 来源截止与保留证据

最初用 postgres 观察身份获取来源 SHARE 锁被 PostgreSQL 以 42501 拒绝，未执行恢复。只读核对确认原表 owner 为既有 app_migrator，改用其原有维护凭据持锁，没有新增来源授权或更改 ACL。

来源保护进程在一个事务内对全部 16 个白名单 public 表按顺序持 SHARE 锁。独立只读身份取得 REPEATABLE READ READ ONLY 最终备份，保护进程再次读取并核对完整内容。目标独立核验锁的数据库 OID、表集合、PID、时限及备份摘要，持锁直到恢复核验及 activate 完成，随后释放。全程没有来源 DML、DDL、Cron 或清理操作。

旧 public 全部白名单表的行数和 ctid/xmin 行版本摘要在本轮前后相同，用户数仍为 3，ID/角色和表列 ACL 摘要相同。其他旧账号的数据保留在 public，没有导入到本次新账号。维护秘密、来源 owner 连接、备份和完整计划仅保存在忽略的受限目录，不发送到 Vercel。

## 开放后的故障与修复记录

首次开放后自动 HTTP 检查发现 `/blog`、`/api/blog`、`/api/checklists` 仍返回维护 503；操作者也确认 ROOT 已显示但 `/blog` 维护。没有据此重做恢复或清空目标。

实际运行身份在本地通过应用 Prisma 查询得到 ready、revision 3。Next 16.3.3 的 Proxy 有独立部署追踪，原 middleware NFT 缺 profiles，普通 App 路由 NFT 则包含它。配置加载器改为静态导入非敏感生产 profiles，仅在配置变量精确选择该路径时使用，其他文件仍明确读取，失败不回退。Client Secret、session secret、运行连接和 CA 仍由独立服务端变量提供。

Album 既有安全规格要求不查询认证、不展示真实用户资料。原导航把未查询显示成“登录”，现改成固定“账号与安全”入口，保留展示页隔离，不把真实用户资料透传给样例。

第一修复候选构建通过，但业务 503 仍存在，未切换正式域名。后续只读诊断确认新 runtime 角色有 15 个 idle 后端，角色自身连接限制为 -1；同一 runtime 配置三次独立连接均以 SQLSTATE XX000 被拒绝，驱动原文仅在进程内归类为 MaxClients/pool_size，不属于 TLS 或超时。

主要故障为 Vercel 函数挂起后连接池的空闲连接未及时释放，耗尽 Supabase session pooler 的客户端容量。修复在唯一 Pool 创建后调用官方 `attachDatabasePool(pool)`，宿主显式固定 `@vercel/functions@3.11.0` 并更新锁文件。每个 Proxy/路由 bundle 都从同一 runtime 实现创建并挂载自己的池，保持原 session pooler 5432、CA、schema 和身份；不通过升级套餐、提高权限或切换数据库来绕过。原理见 [Vercel 连接池说明](https://vercel.com/kb/guide/connection-pooling-with-functions) 和 [Supabase 会话连接限制](https://supabase.com/docs/guides/database/prisma/prisma-troubleshooting#max-client-connections-reached)。

最终候选构建通过后，精确释放了新 `blog_sdk_prod_runtime` 角色的 11 个 idle 且没有事务的连接，逐个重查 PID 与完整精度状态时间。未终止其他角色或活动事务，未删除平台 Session 记录。候选首次及超过 idle 期限后的业务请求均为 200，随后三次新 runtime 连接成功。最终部署 `dpl_AdfHeDB9Xx71LyMMPfVsTuBrTXLo` 已绑定 `https://blog.zhaosie.com`，旧部署保留；隔离发布清单摘要为 `d2b9a1b6a794e649b1a1967c7c4836603a134d6bb76c102ff0ce4ae3aba6e9ac`。没有再次更新生产秘密，没有启用 Cron。

16:49:29，正式域名匿名只读冒烟通过：

| 检查 | 实际结果 |
| --- | --- |
| `/api/health`、`/blog`、恢复文章详情 | 200 |
| `/api/blog` | 200，total 13，与目标实际数量匹配 |
| 公开作者投影 | 仅 id、username、avatar，归属本次新 ROOT |
| 匿名 `/api/me`、`/api/checklists` | 401 |
| 旧固定 `/api/auth/callback/user-center` | 404 |
| 安装状态及当前身份 | ready、revision 3，同一 ROOT、同一已绑定 subject、SDK 模式、无密码 |

恢复与 activate 事务时认证保护指纹一致。开放后的认证更新时间已经晚于 activate，当前指纹因此不再等于恢复时指纹；后续只读冒烟记录这一变化，并重新核对稳定身份及角色，不把静态指纹当作禁止后续正常认证活动的条件。16:50 的限定日志检查没有观测到连接池缺少 request scope 的固定警告，未保存原始日志。

操作者随后在正式登录浏览器按 `/profile`、`/blog`、`/todo`、`/tomato` 和 Album 账号入口的检查清单确认“页面正常，能看到恢复内容”。本次请求的 ROOT、单账号业务恢复和开放完成。没有为此新增或修改业务样例，不把这一账号的查看结果扩大为所有普通账号、写操作或并发已验收。

## 验证与未运行项

维护实现的全量 Vitest 为 1040 通过、35 跳过，145 个测试文件通过、2 个跳过。数据库依赖边界初次因两项新维护文件不在允许名单失败，加入精确路径后通过 525 个源文件检查。维护实现的类型、lint 和隔离生产 build 通过。

随后配置、导航及连接池修复最终定向批次为 44 项通过，前序 37 项和 Proxy 诊断 12 项均有重叠，不相加。新增连接池回归覆盖 import 无连接副作用、重复使用同一池、生命周期 hook 只挂载一次。相关 ESLint 通过。Windows 上本轮最终构建遇到 Turbopack/PostCSS 子进程启动失败，未记作通过；Vercel 候选的实际生产构建与类型检查通过。连接池测试的 pg mock 同样受数据库驱动边界检查约束，补入单个精确测试路径后通过 526 个源文件检查，没有扩大到目录。

最终全量 Vitest 批次实际为 1042 通过、35 跳过，另 2 项失败来自沙箱拒绝连接测试临时 HTTP 服务的 127.0.0.1 端口，测试命令因此退出 1。仅在沙箱外重跑该 `transport.test.ts`，2 项均通过，没有改测试或连接真实中心/数据库。全量批次为 145 个文件通过、1 个失败、2 个跳过，定向重跑的 1 个文件通过；没有把前序重叠批次数相加，也没有将全量命令伪写为退出 0。

恢复演练按操作者明确指令未运行，证据写作 not-run 并绑定本次授权，不写作 passed。真实第二个普通账号的隔离及并发场景未运行，没有创建其他真实账号或写测试业务数据。doctor 依赖组合仍为 BLOCKED / COMBINATION_UNVERIFIED，不能称该精确运行组合已获 SDK 正式兼容认证。

根及 src 的 AGENTS.md 仍有旧 JWT、中心在线核验叙述，与规格 0019 和当前 SDK 实现冲突。本轮保留操作者提供的规则，明确登记待协调，没有通过改写规则把冲突隐藏。

操作细节见 [维护命令](../auth/user-center-maintenance.md)，此前真实生产认证结果见 [Client 更新验证](2026-11-06-sdk-production-client-refresh.md)。
