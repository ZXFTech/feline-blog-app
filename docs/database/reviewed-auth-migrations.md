# 已审核认证迁移的 CI 分类

CI 仅把下面两份完整 SQL 识别为已审核的程序化迁移。路径、迁移名及 SHA256 必须同时匹配。摘要只把 CRLF 转为 LF，保留其他所有字节对应的 UTF-8 内容，包括空白和注释。

| Git 路径 | LF 内容 SHA256 |
| --- | --- |
| prisma/postgres/migrations/20261015000000_user_center/migration.sql | f2763bf80fe1d86da2faecdb9068be6a9902bf2d11af40dffe76add69b727600 |
| prisma/postgres/migrations/20261016000000_auth_ops/migration.sql | 0441c416a6375be21928c792b91808263326c477b5559a861fe4dfa69f3847b9 |

固定记录在 scripts/ci/staging-core.ts。CI 不根据候选文件自动生成或更新记录，也不按目录、日期、函数名前缀或 dollar quote 语法整体放行。已登记路径的内容只要变化就拒绝，包括追加普通新增 DDL 或注释。其他迁移继续经过原有保守 SQL 检查。

## 20261015000000_user_center

顶层 SQL 放宽 users.password 的可空性，并增加默认 legacy、authVersion 为零的兼容列、约束、认证表、索引和触发器。DROP NOT NULL 不删除列或已有密码。顶层没有删除业务行、截断或删除业务表。

十个函数维护认证模式、流程、身份绑定、浏览器退出、会话撤销和有界认证数据清理。身份转换及密码清除发生在显式调用的函数事务内，迁移不会调用这些业务操作。所有 SECURITY DEFINER 函数固定 search_path 为 pg_catalog，并显式限定对象所在 schema。内部完成函数和业务入口撤销 PUBLIC 执行权限。

唯一 DO 块只遍历五张固定认证表，开启 RLS 并撤销 PUBLIC 权限。对 anon、authenticated 的撤权先检查角色是否存在。动态 SQL 仅使用固定表和角色数组及 format 的标识符格式，不接收外部输入。

## 20261016000000_auth_ops

顶层 SQL 创建 auth_ops schema、状态表、运行记录表和索引，开启 RLS、撤销 PUBLIC 权限，并写入未绑定 Cron 的 disabled 初始状态。

七个函数定义清理状态、有限批次、固定 cutoff、任务身份及 Cron 历史核验。UPDATE、DELETE 和 Cron 引用均位于函数体内，迁移不调用清理、不创建或启用 Cron。所有 SECURITY DEFINER 函数固定 search_path 为 pg_catalog，并显式限定对象所在 schema。替换的 public.cleanup_auth_rows 只转到同一迁移建立的 cutoff helper。新增函数撤销 PUBLIC 执行权限。

## 保留的门禁及部署边界

历史迁移的修改、删除和重命名仍由 assertImmutableMigrationChanges 拒绝。数据库 checksum 对账和已应用历史的精确前缀规则保持原样。登记分类不允许重写已在任何共享环境应用的迁移。新增未知程序块、危险顶层 SQL、复制到其他路径的程序化 SQL 或登记内容篡改继续失败。

这份分类只解释静态 SQL 审核。它不代替空库重放，也不证明托管环境的所有者、直接角色授权或 readiness 已完成。迁移后的运行角色授权、既有 Supabase 角色的直接权限撤回、维护身份和 Cron 安装继续使用原有显式维护步骤，本次修复不执行这些操作。

回归测试覆盖完整迁移通过、CRLF checkout、函数体篡改、追加危险 SQL、已登记路径的替换、错误路径和身份、未知程序块及历史不可变。更新分类记录需要重新审核完整内容与这些边界。
