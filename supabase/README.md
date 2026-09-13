# Supabase 数据库

生产项目：`vzadfbhrjpwcqpdixuwk`。

## 迁移

数据库结构和初始数据只通过 `supabase/migrations/` 管理：

- `create_core_tables`：创建 `games`、`game_versions`、`events`、约束、索引、RLS 和最小权限角色。
- `seed_slash_v1`：登记「乱刃」及当前版本 `v1`。
- `verify_core_database`：部署时断言匿名权限、服务端角色权限和 RLS。
- `repair_slash_current_version`：向前修复旧种子 statement 未完成的「乱刃」v1 上架与当前版本切换。
- `add_event_rate_limits`：创建仅存 HMAC 桶键的数据库共享限流表和原子计数函数。
- `add_event_insert_function`：通过安全定义函数完成事件幂等写入，并撤销主站角色对原始事件表的直接写权限。
- `schedule_event_retention_maintenance`：启用 `pg_cron`，创建日汇总完成状态、受状态保护的原始事件删除与过期限流桶清理函数，并注册每日任务。
- `add_daily_game_metrics`：创建五项长期日汇总、D-2 最终化与只读查询函数，并将现有每日任务改为先汇总再安全清理。

远程部署前先预演：

```bash
pnpm supabase db push --linked --dry-run
pnpm supabase db push --linked
pnpm supabase db lint --linked --level warning
```

不要对生产项目执行 `supabase db reset --linked`。

## 服务端角色

迁移创建两个默认不可登录的角色：

- `moyufun_web`：读取已上架游戏及当前版本，只执行事件记录、限流和日汇总只读函数；不给原始事件或汇总表直接读写权限。
- `moyufun_publisher`：读取、新建和更新游戏目录，读取和新建不可变版本；不给事件权限和删除权限。

为远程角色设置不同的随机密码后：

- Vercel 服务端使用 `MOYUFUN_WEB_DATABASE_URL` 和 Transaction Pooler。
- 发布环境使用 `MOYUFUN_PUBLISH_DATABASE_URL` 和 Session Pooler。
- 两个变量都属于服务端机密，不得使用 `NEXT_PUBLIC_` 前缀或提交真实值。

共享 Pooler 的自定义用户名格式为 `<role>.<project-ref>`。主机名必须从 Supabase Dashboard 的 Connect 面板复制，不要根据区域手写。

主站使用 Postgres.js 连接 Transaction Pooler，并设置 `prepare: false`、`max: 1`，避免使用 Transaction 模式不支持的 prepared statements，同时限制每个 serverless 实例的连接数。

## 统计保留与定时清理

`event_rate_limits` 不是事件或逐请求日志。每行按匿名 IP 哈希复用一个固定一分钟窗口：`bucket_key` 是服务端以数据库连接密钥为 HMAC secret 生成的 SHA-256 十六进制摘要，数据库不保存原始 IP；`window_started_at` 是当前窗口开始时间；`request_count` 是窗口内已获准进入写事件流程的请求数（1～120）。协议校验通过后先调用限流函数，再记录事件，所以后续数据库写入失败仍消耗计数，API 层拒绝的请求则不消耗。

`moyufun-daily-event-maintenance` 每日 19:30 UTC（上海次日 03:30）运行。它先汇总上海日 D-2，并补齐已有原始事件中漏跑且已最终化的日期，再登记完成状态、删除超过滚动 30×24 小时且对应上海日已完成的原始事件，最后删除 `window_started_at < statement_timestamp() - interval '1 day'` 的限流桶。任一补汇日期失败会让整次维护事务回滚。1 天是限流桶的运维缓冲，不是分析保留期；删除与原子 upsert 并发安全。当前限流表规模很小，未增加时间索引，原始事件清理复用现有 `events.received_at` 索引。

`daily_game_metrics` 以 `summary_date + game_id + game_version_id` 为主键，只保存 production 数据的五项指标分子、分母、P75 和样本数。`home_sessions` 在同日各游戏/版本行重复是有意的小规模冗余；应用层按日只取一次全站分母。有效游玩以 D 日开始的 play 为 cohort，累计 D 与 D+1 收到的心跳，因此 `refresh_daily_game_metrics(date)` 只接受当前上海日期 D-2 及更早日期。P75 按 `load_id` 去重，使用连续百分位并四舍五入到整数毫秒。

`event_daily_rollup_status` 只记录哪个上海日已完成长期日汇总，不保存汇总结果。汇总函数在同一事务写完全部结果后，最后 upsert `summary_date`；事务失败或日期未最终化时不留下状态行。`moyufun_web` 不能直接读取 `daily_game_metrics` 或状态表，只能执行 `get_daily_game_metrics(date,date,uuid,uuid)`；`anon`、`authenticated`、发布角色和其他主站权限均无汇总表访问或维护函数执行权。

已完成日期进入 30 天原始事件删除窗口后，`refresh_daily_game_metrics` 会保留现有长期汇总并直接返回，避免用已部分或全部清理的原始事件覆盖历史。保留窗口内的已完成日期仍可幂等重算。

部署后用以下查询确认扩展、UTC 时区、唯一任务和最近运行结果；也可在 Dashboard 的 Integrations → Cron 查看任务与 History。`status = 'failed'` 时先查看同一行的 `return_message`，再查 Postgres 日志。`cron.job_run_details` 不会自动清理，当前每日一条，后续增加高频任务时需另定历史保留策略。

```sql
select extversion from pg_extension where extname = 'pg_cron';
show cron.timezone;

select jobid, jobname, schedule, command, username, active
from cron.job
where jobname = 'moyufun-daily-event-maintenance';

select status, return_message, start_time, end_time
from cron.job_run_details
where jobid = (
  select jobid
  from cron.job
  where jobname = 'moyufun-daily-event-maintenance'
)
order by start_time desc
limit 10;
```

`show cron.timezone` 必须返回 `GMT` 或 `UTC`，任务查询必须只有一行且为启用状态。`supabase/tests/event_retention.sql` 提供带 `rollback` 的 30 天事件边界、未汇总保护、限流桶边界和权限验收；`supabase/tests/daily_game_metrics.sql` 覆盖五项口径、上海日边界、production 过滤、版本筛选、连续 P75、300 秒与跨午夜心跳、幂等、失败/未最终化状态及权限。两者可在迁移后的测试数据库或 SQL Editor 中运行。

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
    as web_can_insert_events_directly,
  has_function_privilege(
    'moyufun_web',
    'public.consume_event_rate_limit(text)',
    'execute'
  ) as web_can_rate_limit,
  has_function_privilege(
    'moyufun_web',
    'public.run_event_retention_maintenance()',
    'execute'
  ) as web_can_run_event_maintenance,
  has_table_privilege(
    'moyufun_web',
    'public.daily_game_metrics',
    'select'
  ) as web_can_read_daily_metrics_directly,
  has_function_privilege(
    'moyufun_web',
    'public.get_daily_game_metrics(date,date,uuid,uuid)',
    'execute'
  ) as web_can_read_daily_metrics,
  has_table_privilege('moyufun_publisher', 'public.games', 'update')
    as publisher_can_update_games,
  has_table_privilege('moyufun_publisher', 'public.events', 'select')
    as publisher_can_read_events;
```

预期依次为 `false`、`false`、`true`、`false`、`true`、`false`、`false`、`true`、`true`、`false`。`record_event` 的执行权限由对应向前迁移在部署时断言；汇总和清理函数也不得授权给 `anon`、`authenticated`、`moyufun_web` 或 `moyufun_publisher`。
