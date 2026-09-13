# MoYuFun 开发说明

面向接手开发者的代码与部署索引。当前已上线「乱刃」v2，游戏目录和七类事件采集均通过生产验收。后续顺序见 [TODO.md](TODO.md)，启动命令见 [README.md](README.md)。

## 1. 代码结构与功能入口

主站采用 Next.js 16.3 App Router、React 19.2、TypeScript 和 Tailwind CSS 4；`@/` 指向 `src/`。游戏采用原生 JavaScript + Canvas，单独作为静态文件运行。

| 位置（相对仓库根目录） | 职责 |
| --- | --- |
| `src/app/page.tsx` | `/` 首页，读取游戏目录并渲染卡片 |
| `src/app/games/[slug]/page.tsx` | 详情页：封面、简介、标签、操作说明、开始按钮及页面元信息 |
| `src/app/play/[slug]/page.tsx` | 游玩页：查找游戏、生成文件 URL，并向播放器传入可信游戏及版本标识；设置 `noindex/nofollow` |
| `src/app/layout.tsx`、`globals.css`、`not-found.tsx` | 全站标题模板、字体与样式，以及定制 404 |
| `src/lib/database.ts` | 服务端 PostgreSQL 连接，校验主站角色并适配 Transaction Pooler |
| `src/lib/games.ts` | `Game` 类型、数据库行映射、JSON 校验和缓存读取接口，是游戏目录的唯一数据入口 |
| `src/lib/event-request.ts`、`events.ts` | 统计请求大小与逐事件校验，以及 server-only 限流和幂等写入 |
| `src/lib/daily-metrics.ts` | `/stats` 唯一日汇总读取接口，校验筛选条件并映射最小只读结果 |
| `src/lib/browser-events.ts` | 浏览器匿名访客、30 分钟会话和 `/api/events` 上报 |
| `src/lib/game-events.ts` | iframe 消息校验及加载、游玩、心跳生命周期 |
| `src/app/api/events/route.ts` | 单事件统计入口，将合法事件交给服务端写入模块 |
| `src/app/api/revalidate/games/route.ts` | 受 Bearer secret 保护的游戏目录缓存失效入口 |
| `src/app/stats/page.tsx`、`src/proxy.ts` | 服务端渲染内部指标看板，以及仅覆盖 `/stats/:path*` 的 HTTP Basic Auth |
| `src/components/game-player.tsx` | 客户端播放器：可信 iframe 适配、加载与游玩事件、重试、全屏和移动端提示 |
| `src/components/page-event.tsx` | 首页与详情页的一次性访问事件 |
| `src/components/game-card.tsx`、`game-cover.tsx` | 卡片与封面；封面由符号和配色绘制 |
| `src/components/site-header.tsx`、`site-footer.tsx` | 共用页头、页脚 |
| `games/slash/v1/`、`games/slash/v2/` | 保留的原始版本与接入事件 SDK 的当前版本；各含游戏、玩法 README 和无头测试 |
| `supabase/migrations/` | Supabase 数据库结构和「乱刃」初始数据迁移 |
| `supabase/README.md` | 数据库部署、服务端角色和权限验收说明 |
| `next.config.ts` | 游玩页 CSP 响应头，允许指定游戏来源 |

游戏脚本按注释分为输入、状态、战斗、AI、碰撞、更新、渲染和菜单；`SLASHES` 定义招式，`startGame()` 开局，`update(dt)` 推进逻辑，`phase` 区分菜单、游玩与结算。

## 2. 数据与加载行为

`games.ts` 从 Supabase 读取已上架且存在当前版本的游戏，将数据库行转换并验证为 `Game`。页面只调用 `getGames()`、`getGameBySlug()` 和 `getGameUrl()`，不直接依赖 SQL。

目录查询通过 Next.js 数据缓存复用，缓存标签为 `game-catalog`，每 5 分钟兜底刷新。发布端写入目录或切换当前版本后，应以 `Authorization: Bearer <MOYUFUN_REVALIDATE_SECRET>` 调用 `POST /api/revalidate/games` 立即使标签过期；缺少或错误凭据返回 401，主站未配置 secret 返回 503。

详情页与游玩页预生成已有路径，并允许新 slug 首次访问时生成；未知、未上架或没有当前版本的 slug 返回 404。

播放器创建或重试 iframe 时生成新的加载标识并记录 `game_load`。只有来源、发送窗口和协议形状均匹配的 `ready` 消息才能解除遮罩；主站使用自身时钟记录 `game_ready` 耗时。跨域探测会校验 HTTP 状态，请求失败或等待 10 秒显示提示。全屏通过 Fullscreen API 控制播放器容器，移动端仍提示键鼠操作。

游戏 SDK 仅发送版本化的 `ready`、`start`、`end` 消息，并使用明确的主站目标来源；游戏和版本 UUID、页面路径、加载耗时及游玩标识都由主站补充。每次有效开局生成新的游玩标识，仅在页面可见且游玩尚未结束时每 30 秒记录一次心跳，结算后停止。

首页仅记录 `page_view`，详情页仅记录 `game_detail_view`。匿名访客标识保存在 `localStorage`；会话保存标识及最后活动时间，连续 30 分钟无活动后轮换。存储不可用时退化为当前页面内存状态，不阻塞游玩。

`POST /api/events` 只接受 4 KiB 以内的单个 JSON 事件。协议和逐事件字段矩阵见 [METRICS.md](METRICS.md)；未知或错配字段、客户端 `metadata`、非 JSON、非法 UUID／时间／路径和不存在的游戏版本组合均被拒绝。事件按 `event_id` 幂等写入，成功和重复均返回 204，不向客户端暴露是否重复。

接口以 Vercel 提供的客户端 IP 计算服务端 HMAC，每个桶每分钟最多 120 个合法请求；Postgres 函数原子计数，因此限制跨 Vercel 实例共享，数据库不保存原始 IP。`metadata.environment` 只由服务端按生产、预览或开发环境写入。数据库错误返回通用 500，响应和日志不包含连接信息。

`event_rate_limits` 每行是一个匿名 IP 哈希的一分钟固定窗口桶：`window_started_at` 是当前窗口开始时间，`request_count` 是该窗口已获准进入写事件流程的请求数。协议校验通过后先消耗限流，再调用 `record_event()`；后续事件写入失败仍计数。Supabase Cron 任务每日 19:30 UTC 汇总上海日 D-2，并补齐已有原始事件中漏跑且已最终化的日期，再按顺序登记完成状态、删除超过 30×24 小时且对应日已完成的 `events`，最后清理窗口开始已超过 1 天的限流桶。汇总与完成状态在同一事务，任一日期失败会让整次维护回滚，失败或未最终化的日期不会取得删除资格。任务和运行历史从 Dashboard 的 Cron 页面或 `cron.job`、`cron.job_run_details` 查看。

`daily_game_metrics` 以日期、游戏和版本为主键，长期保存五项指标的分子、分母、样本和 P75。只统计 production 事件，并按 `received_at` 的 `Asia/Shanghai` 日期归档；有效游玩将 D 日开始的 play 在 D 与 D+1 收到的心跳累计。应用角色不能直接读写汇总表，`moyufun_web` 只能执行严格只读函数；主站再通过 `getDailyGameMetrics()` 这一接口读取。`/stats` 不提供原始事件浏览或独立 API，多版本选择时不伪造合并 P75。

## 3. 部署链路与配置

```text
浏览器 → www.moyufuns.com → Vercel 返回主站页面
       → iframe 请求 games.moyufuns.com/games/slash/v2/index.html
         → Cloudflare CDN（命中直接返回，未命中从 R2 读取）
         → 浏览器执行游戏 HTML / CSS / JavaScript
```

| 服务 | 当前用途与入口 |
| --- | --- |
| Vercel | Next.js 主站：[www.moyufuns.com](https://www.moyufuns.com) · [控制台](https://vercel.com/dashboard) |
| Cloudflare R2 + CDN | 游戏存储与分发：[乱刃 v2](https://games.moyufuns.com/games/slash/v2/index.html) · [控制台](https://dash.cloudflare.com/) |
| Supabase | 托管 PostgreSQL，保存游戏、版本和统计事件；迁移与权限说明见 `supabase/README.md` |

主站生产环境设置 `GAMES_ORIGIN=https://games.moyufuns.com`、Transaction Pooler 的 `MOYUFUN_WEB_DATABASE_URL`、与发布环境约定一致的 `MOYUFUN_REVALIDATE_SECRET`，以及至少 32 个随机字符的 `MOYUFUN_STATS_PASSWORD`。这些变量均为服务端配置，不得使用 `NEXT_PUBLIC_` 前缀。`/stats` 用户名固定为 `moyufun`；缺少或过短密码时返回 503，错误凭据返回带 challenge 的 401，正确凭据才放行。密码不进入 URL、日志或仓库。`GAMES_ORIGIN` 同时决定游戏 URL 和 CSP，变更后重新构建部署。游戏文件独立上传到 R2，部署主站不会自动发布游戏。

主站 `/play/*` 的 CSP 为 `frame-src 'self' <游戏来源>`。iframe 使用 `sandbox="allow-scripts allow-same-origin allow-pointer-lock"`、`allow="fullscreen; autoplay"` 和 `strict-origin-when-cross-origin` referrer policy。

现有部署记录已验收 CDN 长期缓存、CORS、`frame-ancestors` 与 `nosniff`。生产配置约定：CORS 允许主站 GET/HEAD，游戏响应以 `frame-ancestors https://www.moyufuns.com` 限制嵌入，文件使用正确 MIME 类型。Cloudflare 配置在平台侧维护，仓库没有部署脚本或配置快照。

## 4. 本地开发、发布与验证

使用 Node.js 24、pnpm 9.15.9；主站和游戏服务分别运行在 3000、4000 端口。`GAMES_ORIGIN` 默认 `http://localhost:4000`，环境示例见 `.env.example`。本地静态服务以外层 `games/` 为根目录并开启 CORS：

| 本地文件 | URL 路径 / R2 对象键 |
| --- | --- |
| `games/slash/v1/index.html` | `/games/slash/v1/index.html` / `games/slash/v1/index.html` |
| `games/slash/v2/index.html` | `/games/slash/v2/index.html` / `games/slash/v2/index.html` |

新增游戏时，在 `games/<slug>/<version>/` 放入文件，并通过发布角色登记游戏及版本。本地静态服务器用 `games/serve.json` 将数据库 URL 路径映射到该目录。先验证本地链路，再将运行文件按同一路径上传 R2；确认可访问后，在事务中上架或切换当前版本，随后调用受保护的目录缓存失效接口。新版本使用新目录，回滚时切回已保留的旧版本并再次失效缓存。单包上限 30 MB，凭据保存在服务端或发布环境；自动包检查与发布脚本见 TODO。

检查命令统一见 README。目录与事件采集已通过 Node 24 测试、lint、生产构建、游戏无头测试和线上验收；线上覆盖首页、详情、Slash v2 游玩与七类事件的 204 响应及幂等重放。

## 5. 下一阶段与维护

Supabase 表、RLS、最小权限角色和「乱刃」v2 已部署。主站目录使用 5 分钟兜底刷新和受保护的按需失效；角色权限见 `supabase/README.md`。

测试周期和指标口径见 [METRICS.md](METRICS.md)。`/api/events`、浏览器身份与会话、页面事件和游戏 SDK 已完成；受汇总状态保护的原始事件删除、限流桶清理、五项指标查询、长期日汇总和 D-2 最终化均已部署到 Supabase，并通过远程 lint、迁移版本、回滚事务及首次维护验收。内部 `/stats` 代码已完成，Vercel 部署和 `MOYUFUN_STATS_PASSWORD` 配置仍待执行。7 日回访推迟到后续增强，不在看板保留占位。

后续完成发布自动化、隐私政策与条款、SEO 和多游戏验收，按 TODO 推进。MVP 固定采用 Vercel、Supabase、R2 与 CDN，由内部发布游戏；搜索、社区互动、云存档和第三方上传不在本轮范围。完成任务后更新本文现状并勾选 TODO。
