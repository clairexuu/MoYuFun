const MAX_BODY_BYTES = 4_096;
const MAX_PAST_AGE_MS = 24 * 60 * 60 * 1_000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1_000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OCCURRED_AT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const GAME_PATH_PATTERN = /^\/games\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PLAY_PATH_PATTERN = /^\/play\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

const COMMON_FIELDS = [
  "event_id",
  "event_type",
  "visitor_id",
  "session_id",
  "occurred_at",
  "path",
] as const;
const GAME_FIELDS = ["game_id", "game_version_id"] as const;

export type EventType =
  | "page_view"
  | "game_detail_view"
  | "game_load"
  | "game_ready"
  | "game_start"
  | "game_end"
  | "heartbeat";

export type ValidatedEvent = {
  event_id: string;
  event_type: EventType;
  visitor_id: string;
  session_id: string;
  game_id?: string;
  game_version_id?: string;
  load_id?: string;
  play_id?: string;
  path: string;
  duration_ms?: number;
  active_seconds?: number;
  occurred_at: string;
};

export type SubmitEvent = (
  event: ValidatedEvent,
  clientIp: string,
) => Promise<"accepted" | "invalid" | "rate-limited">;

class InvalidRequest extends Error {}
class BodyTooLarge extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactlyFields(
  value: Record<string, unknown>,
  fields: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();

  return (
    actual.length === expected.length &&
    actual.every((field, index) => field === expected[index])
  );
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function parseEvent(value: unknown, now: number): ValidatedEvent {
  if (!isRecord(value) || typeof value.event_type !== "string") {
    throw new InvalidRequest();
  }

  const eventType = value.event_type;
  let extraFields: readonly string[];
  let pathPattern: RegExp;

  switch (eventType) {
    case "page_view":
      extraFields = [];
      pathPattern = /^\/$/;
      break;
    case "game_detail_view":
      extraFields = GAME_FIELDS;
      pathPattern = GAME_PATH_PATTERN;
      break;
    case "game_load":
      extraFields = [...GAME_FIELDS, "load_id"];
      pathPattern = PLAY_PATH_PATTERN;
      break;
    case "game_ready":
      extraFields = [...GAME_FIELDS, "load_id", "duration_ms"];
      pathPattern = PLAY_PATH_PATTERN;
      break;
    case "game_start":
    case "game_end":
      extraFields = [...GAME_FIELDS, "play_id"];
      pathPattern = PLAY_PATH_PATTERN;
      break;
    case "heartbeat":
      extraFields = [...GAME_FIELDS, "play_id", "active_seconds"];
      pathPattern = PLAY_PATH_PATTERN;
      break;
    default:
      throw new InvalidRequest();
  }

  if (
    !hasExactlyFields(value, [...COMMON_FIELDS, ...extraFields]) ||
    !isUuid(value.event_id) ||
    !isUuid(value.visitor_id) ||
    !isUuid(value.session_id) ||
    typeof value.path !== "string" ||
    value.path.length > 128 ||
    !pathPattern.test(value.path) ||
    typeof value.occurred_at !== "string" ||
    !OCCURRED_AT_PATTERN.test(value.occurred_at)
  ) {
    throw new InvalidRequest();
  }

  const occurredAt = Date.parse(value.occurred_at);

  if (
    !Number.isFinite(occurredAt) ||
    new Date(occurredAt).toISOString() !== value.occurred_at ||
    occurredAt < now - MAX_PAST_AGE_MS ||
    occurredAt > now + MAX_FUTURE_SKEW_MS
  ) {
    throw new InvalidRequest();
  }

  if (
    eventType !== "page_view" &&
    (!isUuid(value.game_id) || !isUuid(value.game_version_id))
  ) {
    throw new InvalidRequest();
  }

  if (
    (eventType === "game_load" || eventType === "game_ready") &&
    !isUuid(value.load_id)
  ) {
    throw new InvalidRequest();
  }

  if (
    (eventType === "game_start" ||
      eventType === "game_end" ||
      eventType === "heartbeat") &&
    !isUuid(value.play_id)
  ) {
    throw new InvalidRequest();
  }

  if (
    eventType === "game_ready" &&
    (!Number.isInteger(value.duration_ms) ||
      (value.duration_ms as number) < 0 ||
      (value.duration_ms as number) > 600_000)
  ) {
    throw new InvalidRequest();
  }

  if (eventType === "heartbeat" && value.active_seconds !== 30) {
    throw new InvalidRequest();
  }

  return value as ValidatedEvent;
}

async function readBody(request: Request): Promise<string> {
  const contentLength = request.headers.get("content-length");

  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) {
      throw new InvalidRequest();
    }

    if (Number(contentLength) > MAX_BODY_BYTES) {
      throw new BodyTooLarge();
    }
  }

  if (!request.body) {
    throw new InvalidRequest();
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    size += value.byteLength;

    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new BodyTooLarge();
    }

    chunks.push(value);
  }

  const bytes = new Uint8Array(size);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new InvalidRequest();
  }
}

function getClientIp(request: Request): string {
  const forwarded =
    request.headers.get("x-vercel-forwarded-for") ??
    request.headers.get("x-forwarded-for") ??
    "unknown";

  return forwarded.split(",", 1)[0].trim().slice(0, 64) || "unknown";
}

export async function handleEventRequest(
  request: Request,
  submitEvent: SubmitEvent,
  now = Date.now(),
): Promise<Response> {
  const contentType = request.headers.get("content-type");

  if (contentType?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return Response.json(
      { error: "Expected application/json" },
      { status: 415 },
    );
  }

  const contentEncoding = request.headers.get("content-encoding");

  if (contentEncoding && contentEncoding.toLowerCase() !== "identity") {
    return Response.json(
      { error: "Unsupported content encoding" },
      { status: 415 },
    );
  }

  try {
    const body = await readBody(request);
    const event = parseEvent(JSON.parse(body), now);
    const result = await submitEvent(event, getClientIp(request));

    if (result === "rate-limited") {
      return Response.json(
        { error: "Rate limit exceeded" },
        { status: 429, headers: { "Retry-After": "60" } },
      );
    }

    if (result === "invalid") {
      return Response.json({ error: "Invalid event" }, { status: 400 });
    }

    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof BodyTooLarge) {
      return Response.json({ error: "Request body too large" }, { status: 413 });
    }

    if (error instanceof InvalidRequest || error instanceof SyntaxError) {
      return Response.json({ error: "Invalid event" }, { status: 400 });
    }

    console.error("Event submission failed");
    return Response.json({ error: "Unable to accept event" }, { status: 500 });
  }
}
