# Supabase 数据库

生产项目：`vzadfbhrjpwcqpdixuwk`。

## 迁移

数据库结构和初始数据只通过 `supabase/migrations/` 管理：

- `create_core_tables`：创建 `games`、`game_versions`、`events`、约束、索引、RLS 和最小权限角色。
- `seed_slash_v1`：登记「乱刃」及当前版本 `v1`。
- `verify_core_database`：部署时断言匿名权限、服务端角色权限和 RLS。
- `repair_slash_current_version`：向前修复旧种子 statement 未完成的「乱刃」v1 上架与当前版本切换。

远程部署前先预演：

```bash
pnpm supabase db push --linked --dry-run
pnpm supabase db push --linked
pnpm supabase db lint --linked --level warning
```

不要对生产项目执行 `supabase db reset --linked`。

## 服务端角色

迁移创建两个默认不可登录的角色：

- `moyufun_web`：读取已上架游戏及当前版本，写入事件；不给事件读取权限。
- `moyufun_publisher`：读取、新建和更新游戏目录，读取和新建不可变版本；不给事件权限和删除权限。

为远程角色设置不同的随机密码后：

- Vercel 服务端使用 `MOYUFUN_WEB_DATABASE_URL` 和 Transaction Pooler。
- 发布环境使用 `MOYUFUN_PUBLISH_DATABASE_URL` 和 Session Pooler。
- 两个变量都属于服务端机密，不得使用 `NEXT_PUBLIC_` 前缀或提交真实值。

共享 Pooler 的自定义用户名格式为 `<role>.<project-ref>`。主机名必须从 Supabase Dashboard 的 Connect 面板复制，不要根据区域手写。

主站使用 Postgres.js 连接 Transaction Pooler，并设置 `prepare: false`、`max: 1`，避免使用 Transaction 模式不支持的 prepared statements，同时限制每个 serverless 实例的连接数。

## 目录缓存失效

主站对公开游戏目录缓存 5 分钟，并使用 `game-catalog` 标签支持按需失效。Vercel 与发布环境需配置相同的长随机 `MOYUFUN_REVALIDATE_SECRET`。发布事务成功提交后调用：

```text
POST /api/revalidate/games
Authorization: Bearer <MOYUFUN_REVALIDATE_SECRET>
```

接口不接受公开刷新：错误或缺少凭据返回 401，主站未配置 secret 返回 503。数据库提交失败时不要调用；新增游戏、修改目录、上架/下架、切换当前版本或回滚成功后均应调用。

## 权限验收

在 SQL Editor 中运行：

```sql
select
  has_table_privilege('anon', 'public.games', 'select')
    as anon_can_read_games,
  has_table_privilege('anon', 'public.events', 'insert')
    as anon_can_insert_events,
  has_table_privilege('moyufun_web', 'public.games', 'select')
    as web_can_read_games,
  has_table_privilege('moyufun_web', 'public.events', 'insert')
    as web_can_insert_events,
  has_table_privilege('moyufun_publisher', 'public.games', 'update')
    as publisher_can_update_games,
  has_table_privilege('moyufun_publisher', 'public.events', 'select')
    as publisher_can_read_events;
```

预期依次为 `false`、`false`、`true`、`true`、`true`、`false`。
