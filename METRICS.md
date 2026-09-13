# MoYuFun 指标与测试口径

本文定义数据与统计里程碑采用的最小口径。数据库结构以 `supabase/migrations/` 为准。

## 1. 测试范围

- 连续观察 14 天，从生产统计链路启用后的次日 00:00 开始。
- 使用 `Asia/Shanghai` 时区和服务端 `received_at` 归档。
- 首轮只评估「乱刃」，不同版本分别统计。
- 只统计生产事件；环境由服务端写入 `metadata.environment`。
- 指标分母不足 30 时只展示数据，不作判断；不足则延长 7 天，最多观察 28 天。

前 7 天形成访客 cohort，后 7 天用于观察 7 日回访。

## 2. 标识与事件

- `event_id`：每次上报唯一，用于幂等去重。
- `visitor_id`：持久化到 `localStorage`，直到用户清理。
- `session_id`：连续 30 分钟无活动后重新生成。
- `load_id`：每次创建或重试 iframe 时重新生成。
- `play_id`：每局游戏开始时重新生成。

| 事件 | 最小含义 |
| --- | --- |
| `page_view` | 访问首页 `/` |
| `game_detail_view` | 进入游戏详情页 |
| `game_load` | 开始一次 iframe 加载 |
| `game_ready` | 游戏可操作；携带加载 `duration_ms` |
| `game_start` | 真正开始一局游戏 |
| `heartbeat` | 游玩中且页面可见时每 30 秒上报，`active_seconds=30` |
| `game_end` | 一局正常结束；首版指标暂不依赖 |

`POST /api/events` 首版每次只接受一个 JSON 事件，请求体最大 4 KiB。所有事件都必须携带 `event_id`、`event_type`、`visitor_id`、`session_id`、`occurred_at` 和 `path`，时间使用 UTC RFC3339 毫秒格式，只接受过去 24 小时至未来 5 分钟的事件。

| 事件 | 额外必填字段 | 合法路径 |
| --- | --- | --- |
| `page_view` | 无 | `/` |
| `game_detail_view` | `game_id`、`game_version_id` | `/games/<slug>` |
| `game_load` | `game_id`、`game_version_id`、`load_id` | `/play/<slug>` |
| `game_ready` | `game_id`、`game_version_id`、`load_id`、`duration_ms` | `/play/<slug>` |
| `game_start`、`game_end` | `game_id`、`game_version_id`、`play_id` | `/play/<slug>` |
| `heartbeat` | `game_id`、`game_version_id`、`play_id`、`active_seconds=30` | `/play/<slug>` |

UUID 必须使用规范格式，`game_ready.duration_ms` 范围为 0～600000 毫秒。首版拒绝额外字段和客户端 `metadata`；服务端只写入 `metadata.environment`。游戏与版本的复合外键负责校验版本归属，迟到事件继续使用事件发生时的版本 UUID。

## 3. 六项核心指标

| 指标 | 口径 |
| --- | --- |
| 详情访问率 | 访问过详情的去重 `session_id` ÷ 访问过首页的去重 `session_id` |
| 开始游玩率 | 产生 `game_start` 的去重 `session_id` ÷ 产生 `game_detail_view` 的去重 `session_id` |
| 加载成功率 | 产生 `game_ready` 的去重 `load_id` ÷ 产生 `game_load` 的去重 `load_id` |
| 加载耗时 P75 | `game_ready.duration_ms` 的第 75 百分位 |
| 有效游玩率 | 心跳累计 `active_seconds ≥ 300` 的 `play_id` ÷ 产生 `game_start` 的 `play_id` |
| 7 日回访率 | 首次访问后的 D+1～D+7 内再次产生生产事件的访客 ÷ 当日新增访客 |

指标支持按日期、游戏和版本筛选。

## 4. 首轮判断

- 加载成功率目标 `≥95%`，低于 `90%` 必须修复。
- 加载耗时 P75 目标 `≤5 秒`，超过 `10 秒` 必须修复。
- 其余四项首轮只建立基线，不设置通过线。
- 不生成综合分数；样本不足时明确标记。

## 5. 首版边界

暂不实现置信区间、A/B 测试、复杂分群、精确机器人识别、收入指标或任意 `metadata` 报表。原始事件按服务端 `received_at` 滚动保留 30×24 小时，且只能在对应上海日的汇总成功状态写入后删除；日汇总长期保存。删除任务与安全闸门的迁移已实现、尚未部署，日汇总尚未实现，因此当前没有日期具备删除资格。
