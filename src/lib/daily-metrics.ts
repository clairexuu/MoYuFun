import "server-only";

import { getDatabase } from "@/lib/database";

export type DailyGameMetric = {
  summaryDate: string;
  gameId: string;
  gameVersionId: string;
  gameSlug: string;
  gameName: string;
  versionKey: string;
  homeSessions: number;
  detailSessions: number;
  startedSessions: number;
  loadAttempts: number;
  readyLoads: number;
  loadDurationP75Ms: number | null;
  startedPlays: number;
  effectivePlays: number;
  computedAt: string;
};

export type DailyGameMetricsFilters = {
  from?: string;
  to?: string;
  gameId?: string;
  versionId?: string;
};

type DailyGameMetricRow = {
  summary_date: unknown;
  game_id: unknown;
  game_version_id: unknown;
  game_slug: unknown;
  game_name: unknown;
  version_key: unknown;
  home_sessions: unknown;
  detail_sessions: unknown;
  started_sessions: unknown;
  load_attempts: unknown;
  ready_loads: unknown;
  load_duration_p75_ms: unknown;
  started_plays: unknown;
  effective_plays: unknown;
  computed_at: unknown;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function validateFilters(filters: DailyGameMetricsFilters): void {
  if (filters.from && !isDate(filters.from)) {
    throw new Error("Invalid metrics start date");
  }

  if (filters.to && !isDate(filters.to)) {
    throw new Error("Invalid metrics end date");
  }

  if (filters.from && filters.to && filters.from > filters.to) {
    throw new Error("Invalid metrics date range");
  }

  if (filters.gameId && !UUID_PATTERN.test(filters.gameId)) {
    throw new Error("Invalid metrics game ID");
  }

  if (filters.versionId && !UUID_PATTERN.test(filters.versionId)) {
    throw new Error("Invalid metrics version ID");
  }
}

function readString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid daily metric field: ${field}`);
  }

  return value;
}

function readCount(value: unknown, field: string): number {
  const parsed = typeof value === "string" ? Number(value) : value;

  if (
    typeof parsed !== "number" ||
    !Number.isSafeInteger(parsed) ||
    parsed < 0
  ) {
    throw new Error(`Invalid daily metric field: ${field}`);
  }

  return parsed;
}

function mapMetric(row: DailyGameMetricRow): DailyGameMetric {
  return {
    summaryDate: readString(row.summary_date, "summary_date"),
    gameId: readString(row.game_id, "game_id"),
    gameVersionId: readString(row.game_version_id, "game_version_id"),
    gameSlug: readString(row.game_slug, "game_slug"),
    gameName: readString(row.game_name, "game_name"),
    versionKey: readString(row.version_key, "version_key"),
    homeSessions: readCount(row.home_sessions, "home_sessions"),
    detailSessions: readCount(row.detail_sessions, "detail_sessions"),
    startedSessions: readCount(row.started_sessions, "started_sessions"),
    loadAttempts: readCount(row.load_attempts, "load_attempts"),
    readyLoads: readCount(row.ready_loads, "ready_loads"),
    loadDurationP75Ms:
      row.load_duration_p75_ms === null
        ? null
        : readCount(row.load_duration_p75_ms, "load_duration_p75_ms"),
    startedPlays: readCount(row.started_plays, "started_plays"),
    effectivePlays: readCount(row.effective_plays, "effective_plays"),
    computedAt: readString(row.computed_at, "computed_at"),
  };
}

export async function getDailyGameMetrics(
  filters: DailyGameMetricsFilters = {},
): Promise<DailyGameMetric[]> {
  validateFilters(filters);

  const sql = getDatabase();
  const rows = await sql<DailyGameMetricRow[]>`
    select
      summary_date::text,
      game_id::text,
      game_version_id::text,
      game_slug,
      game_name,
      version_key,
      home_sessions,
      detail_sessions,
      started_sessions,
      load_attempts,
      ready_loads,
      load_duration_p75_ms,
      started_plays,
      effective_plays,
      computed_at::text
    from public.get_daily_game_metrics(
      ${filters.from ?? null}::date,
      ${filters.to ?? null}::date,
      ${filters.gameId ?? null}::uuid,
      ${filters.versionId ?? null}::uuid
    )
  `;

  return rows.map(mapMetric);
}
