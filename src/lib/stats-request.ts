import { isStatsReport, type StatsReport } from "./game-events.ts";

const MAX_BODY_BYTES = 2_048;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type RoundReport = {
  game_id: string;
  game_version_id: string;
  stats: StatsReport;
};

export type RecordResult = "ok" | "invalid" | "rate-limited";

export type StatsRequestDeps = {
  siteOrigin: string;
  getUserId: () => Promise<string | undefined>;
  record: (userId: string, report: RoundReport) => Promise<RecordResult>;
};

function parseReport(text: string): RoundReport | undefined {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const body = value as Record<string, unknown>;
  const valid =
    Object.keys(body).length === 3 &&
    typeof body.game_id === "string" &&
    UUID_PATTERN.test(body.game_id) &&
    typeof body.game_version_id === "string" &&
    UUID_PATTERN.test(body.game_version_id) &&
    isStatsReport(body.stats);

  return valid ? (body as RoundReport) : undefined;
}

export async function handleStatsRequest(
  request: Request,
  deps: StatsRequestDeps,
): Promise<Response> {
  const headers = { "Cache-Control": "private, no-store" };
  const json = (body: unknown, status: number) =>
    Response.json(body, { status, headers });

  if (request.headers.get("origin") !== deps.siteOrigin) {
    return json({ error: "Forbidden" }, 403);
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return json({ error: "Invalid request" }, 400);
  }

  try {
    const userId = await deps.getUserId();
    if (!userId) {
      return json({ error: "Unauthorized" }, 401);
    }

    const text = await request.text();
    const report =
      new TextEncoder().encode(text).byteLength <= MAX_BODY_BYTES
        ? parseReport(text)
        : undefined;
    if (!report) {
      return json({ error: "Invalid request" }, 400);
    }

    const result = await deps.record(userId, report);
    if (result === "rate-limited") {
      return Response.json(
        { error: "Rate limit exceeded" },
        { status: 429, headers: { ...headers, "Retry-After": "60" } },
      );
    }
    if (result === "invalid") {
      return json({ error: "Invalid stats" }, 400);
    }

    return new Response(null, { status: 204, headers });
  } catch {
    console.error("Stats report failed");
    return json({ error: "Unable to record stats" }, 500);
  }
}
