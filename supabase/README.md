# Supabase 数据库

生产项目：`vzadfbhrjpwcqpdixuwk`。

## 迁移

数据库结构和初始数据只通过 `supabase/migrations/` 管理：

- `create_core_tables`：创建 `games`、`game_versions`、`events`、约束、索引、RLS 和最小权限角色。
- `seed_slash_v1`：登记「乱刃」及当前版本 `v1`。
- `verify_core_database`：部署时断言匿名权限、服务端角色权限和 RLS。

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
