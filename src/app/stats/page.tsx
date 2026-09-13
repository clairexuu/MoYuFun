import type { Metadata } from "next";

import {
  getDailyGameMetrics,
  type DailyGameMetric,
} from "@/lib/daily-metrics";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "内部指标",
  robots: { follow: false, index: false },
};

type SearchParams = Record<string, string | string[] | undefined>;

type MetricDefinition = {
  key: string;
  label: string;
  value: (rows: DailyGameMetric[]) => number | null;
  detail: (rows: DailyGameMetric[]) => string;
  format: (value: number) => string;
  sample: (rows: DailyGameMetric[]) => number;
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function validDate(value: string | undefined): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 10) === value
    ? value
    : undefined;
}

function validUuid(value: string | undefined): string | undefined {
  return value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
    ? value
    : undefined;
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function sum(
  rows: DailyGameMetric[],
  field: keyof DailyGameMetric,
): number {
  return rows.reduce((total, row) => total + Number(row[field]), 0);
}

function rate(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function percent(value: number): string {
  return new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: 1,
    style: "percent",
  }).format(value);
}

function duration(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)} 秒` : `${value} ms`;
}

const METRICS: MetricDefinition[] = [
  {
    key: "detail",
    label: "详情访问率",
    value: (rows) =>
      rate(sum(rows, "detailSessions"), Math.max(0, ...rows.map((row) => row.homeSessions))),
    detail: (rows) =>
      `${sum(rows, "detailSessions")} 个详情会话 / ${Math.max(0, ...rows.map((row) => row.homeSessions))} 个首页会话`,
    format: percent,
    sample: (rows) => Math.max(0, ...rows.map((row) => row.homeSessions)),
  },
  {
    key: "start",
    label: "开始游玩率",
    value: (rows) => rate(sum(rows, "startedSessions"), sum(rows, "detailSessions")),
    detail: (rows) =>
      `${sum(rows, "startedSessions")} 个开始会话 / ${sum(rows, "detailSessions")} 个详情会话`,
    format: percent,
    sample: (rows) => sum(rows, "detailSessions"),
  },
  {
    key: "ready",
    label: "加载成功率",
    value: (rows) => rate(sum(rows, "readyLoads"), sum(rows, "loadAttempts")),
    detail: (rows) =>
      `${sum(rows, "readyLoads")} 次就绪 / ${sum(rows, "loadAttempts")} 次加载`,
    format: percent,
    sample: (rows) => sum(rows, "loadAttempts"),
  },
  {
    key: "duration",
    label: "加载耗时 P75",
    value: (rows) =>
      rows.length === 1 ? rows[0].loadDurationP75Ms : null,
    detail: (rows) =>
      rows.length === 1
        ? `${rows[0].readyLoads} 个就绪耗时样本`
        : "请选择单个游戏版本查看精确 P75",
    format: duration,
    sample: (rows) => sum(rows, "readyLoads"),
  },
  {
    key: "effective",
    label: "有效游玩率",
    value: (rows) => rate(sum(rows, "effectivePlays"), sum(rows, "startedPlays")),
    detail: (rows) =>
      `${sum(rows, "effectivePlays")} 局达到 300 秒 / ${sum(rows, "startedPlays")} 局开始`,
    format: percent,
    sample: (rows) => sum(rows, "startedPlays"),
  },
];

function Sparkline({
  definition,
  rows,
}: {
  definition: MetricDefinition;
  rows: DailyGameMetric[];
}) {
  const days = [...new Set(rows.map((row) => row.summaryDate))].sort();
  const values = days.map((day) =>
    definition.value(rows.filter((row) => row.summaryDate === day)),
  );
  const numeric = values.filter((value): value is number => value !== null);

  if (numeric.length < 2) {
    return <p className="text-xs text-[#69758f]">至少两个有数据日期后显示趋势</p>;
  }

  const minimum = Math.min(...numeric);
  const maximum = Math.max(...numeric);
  const spread = maximum - minimum || 1;
  const points = values
    .map((value, index) => {
      if (value === null) return null;
      const x = (index / Math.max(values.length - 1, 1)) * 100;
      const y = 36 - ((value - minimum) / spread) * 30;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .filter(Boolean)
    .join(" ");

  return (
    <svg
      aria-label={`${definition.label}趋势`}
      className="h-10 w-full overflow-visible"
      preserveAspectRatio="none"
      role="img"
      viewBox="0 0 100 40"
    >
      <polyline
        fill="none"
        points={points}
        stroke="#7f95ff"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const query = await searchParams;
  const requestedFrom = validDate(first(query.from));
  const requestedTo = validDate(first(query.to));
  const gameId = validUuid(first(query.game));
  const versionId = validUuid(first(query.version));
  const latestRows = await getDailyGameMetrics();
  const latestDate = latestRows[0]?.summaryDate;

  if (!latestDate) {
    return (
      <main className="mx-auto min-h-dvh w-full max-w-6xl px-5 py-12 sm:px-8">
        <p className="text-xs font-bold tracking-[0.22em] text-[#7f95ff] uppercase">
          Internal · Asia/Shanghai
        </p>
        <h1 className="mt-4 text-3xl font-bold text-white">指标看板</h1>
        <div className="mt-10 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 text-[#98a2b8]">
          尚无已完成的日汇总。Cron 首次成功汇总 D-2 后，这里会显示数据。
        </div>
      </main>
    );
  }

  let from = requestedFrom ?? latestDate;
  let to = requestedTo ?? latestDate;
  if (from > to) [from, to] = [to, from];

  const defaultView = !requestedFrom && !requestedTo;
  const trendFrom = defaultView ? addDays(latestDate, -13) : from;
  const optionFrom = defaultView ? addDays(latestDate, -27) : from;
  const optionTo = defaultView ? latestDate : to;
  const [optionRows, selectedRows, trendRows] = await Promise.all([
    getDailyGameMetrics({ from: optionFrom, to: optionTo }),
    getDailyGameMetrics({ from, to, gameId, versionId }),
    getDailyGameMetrics({ from: trendFrom, to, gameId, versionId }),
  ]);
  const latestSelectedDate = selectedRows.at(-1)?.summaryDate;
  const cardRows = latestSelectedDate
    ? selectedRows.filter((row) => row.summaryDate === latestSelectedDate)
    : [];
  const games = [...new Map(optionRows.map((row) => [row.gameId, row])).values()];
  const versions = [
    ...new Map(
      optionRows
        .filter((row) => !gameId || row.gameId === gameId)
        .map((row) => [row.gameVersionId, row]),
    ).values(),
  ];
  const lastComputedAt = cardRows
    .map((row) => row.computedAt)
    .sort()
    .at(-1);

  return (
    <main className="mx-auto min-h-dvh w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-xs font-bold tracking-[0.22em] text-[#7f95ff] uppercase">
            Internal · Asia/Shanghai
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            指标看板
          </h1>
          <p className="mt-3 text-sm text-[#8792a8]">
            仅统计 production 事件，按服务端 received_at 归档。
          </p>
        </div>
        <div className="text-right text-xs leading-5 text-[#69758f]">
          <p>最近完成日：{latestDate}</p>
          <p>
            最后汇总：
            {lastComputedAt
              ? new Intl.DateTimeFormat("zh-CN", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "Asia/Shanghai",
                }).format(new Date(lastComputedAt))
              : "—"}
          </p>
        </div>
      </div>

      <form className="mt-8 grid gap-4 rounded-2xl border border-white/[0.08] bg-[#0e131e] p-5 sm:grid-cols-2 lg:grid-cols-5">
        <label className="grid gap-2 text-xs font-medium text-[#98a2b8]">
          开始日期
          <input className="rounded-lg border border-white/10 bg-[#080b12] px-3 py-2.5 text-sm text-white" defaultValue={from} name="from" type="date" />
        </label>
        <label className="grid gap-2 text-xs font-medium text-[#98a2b8]">
          结束日期
          <input className="rounded-lg border border-white/10 bg-[#080b12] px-3 py-2.5 text-sm text-white" defaultValue={to} name="to" type="date" />
        </label>
        <label className="grid gap-2 text-xs font-medium text-[#98a2b8]">
          游戏
          <select className="rounded-lg border border-white/10 bg-[#080b12] px-3 py-2.5 text-sm text-white" defaultValue={gameId ?? ""} name="game">
            <option value="">全部游戏</option>
            {games.map((game) => <option key={game.gameId} value={game.gameId}>{game.gameName}</option>)}
          </select>
        </label>
        <label className="grid gap-2 text-xs font-medium text-[#98a2b8]">
          版本
          <select className="rounded-lg border border-white/10 bg-[#080b12] px-3 py-2.5 text-sm text-white" defaultValue={versionId ?? ""} name="version">
            <option value="">全部版本</option>
            {versions.map((version) => <option key={version.gameVersionId} value={version.gameVersionId}>{version.gameName} · {version.versionKey}</option>)}
          </select>
        </label>
        <button className="self-end rounded-lg bg-[#7189ff] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#8297ff]" type="submit">
          查询
        </button>
      </form>

      <div className="mt-4 flex flex-wrap gap-3 text-xs">
        <a className="text-[#8fa4ff] hover:text-white" href={`?from=${addDays(latestDate, -13)}&to=${latestDate}${gameId ? `&game=${gameId}` : ""}${versionId ? `&version=${versionId}` : ""}`}>最近 14 天</a>
        <a className="text-[#8fa4ff] hover:text-white" href={`?from=${addDays(latestDate, -27)}&to=${latestDate}${gameId ? `&game=${gameId}` : ""}${versionId ? `&version=${versionId}` : ""}`}>最近 28 天</a>
      </div>

      {cardRows.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 text-[#98a2b8]">
          当前筛选没有汇总数据。
        </div>
      ) : (
        <>
          <p className="mt-10 text-sm font-medium text-[#98a2b8]">
            指标快照 · 筛选范围内最近有数据日 {latestSelectedDate}
          </p>
          <section aria-label="五项核心指标" className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {METRICS.map((definition) => {
              const value = definition.value(cardRows);
              const sample = definition.sample(cardRows);
              return (
                <article className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.055] to-white/[0.025] p-5" key={definition.key}>
                  <p className="text-sm font-medium text-[#98a2b8]">{definition.label}</p>
                  <p className="mt-3 text-3xl font-bold tracking-tight text-white">{value === null ? "—" : definition.format(value)}</p>
                  <p className="mt-3 min-h-10 text-xs leading-5 text-[#778299]">{definition.detail(cardRows)}</p>
                  {sample < 30 && <p className="mt-3 rounded-md bg-amber-400/10 px-2 py-1 text-xs text-amber-200">样本不足 30，仅供观察</p>}
                </article>
              );
            })}
          </section>

          <section className="mt-10 rounded-2xl border border-white/[0.08] bg-[#0e131e] p-5 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-white">趋势</h2>
                <p className="mt-1 text-xs text-[#69758f]">{trendFrom} 至 {to} · 日粒度</p>
              </div>
              <p className="text-xs text-[#69758f]">多版本选择时 P75 不做不准确合并</p>
            </div>
            <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-5">
              {METRICS.map((definition) => (
                <div key={definition.key}>
                  <p className="mb-3 text-xs font-medium text-[#98a2b8]">{definition.label}</p>
                  <Sparkline definition={definition} rows={trendRows} />
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      <aside className="mt-8 rounded-xl border border-[#7189ff]/20 bg-[#7189ff]/[0.06] p-4 text-xs leading-6 text-[#9da9c2]">
        详情访问率的分母始终是当日全站首页去重会话；按游戏或版本筛选时，只筛选详情访问分子。同一会话可访问多个游戏，因此不同游戏的详情访问率之和可能超过 100%。
      </aside>
    </main>
  );
}
