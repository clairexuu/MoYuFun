import { isAchievementKey } from "./game-events.ts";

const MAX_BODY_BYTES = 1_024;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AchievementUnlock = {
  game_id: string;
  game_version_id: string;
  key: string;
};

export type UnlockResult =
  | "unlocked"
  | "already_unlocked"
  | "unknown"
  | "rate-limited";

export type AchievementRequestDeps = {
  siteOrigin: string;
  getUserId: () => Promise<string | undefined>;
  unlock: (userId: string, unlock: AchievementUnlock) => Promise<UnlockResult>;
};

function parseUnlock(text: string): AchievementUnlock | undefined {
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
    isAchievementKey(body.key);

  return valid ? (body as AchievementUnlock) : undefined;
}

export async function handleAchievementRequest(
  request: Request,
  deps: AchievementRequestDeps,
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
    const unlock =
      new TextEncoder().encode(text).byteLength <= MAX_BODY_BYTES
        ? parseUnlock(text)
        : undefined;
    if (!unlock) {
      return json({ error: "Invalid request" }, 400);
    }

    const result = await deps.unlock(userId, unlock);
    if (result === "rate-limited") {
      return Response.json(
        { error: "Rate limit exceeded" },
        { status: 429, headers: { ...headers, "Retry-After": "60" } },
      );
    }
    if (result === "unknown") {
      return json({ error: "Unknown achievement" }, 400);
    }

    return json({ status: result }, 200);
  } catch {
    console.error("Achievement unlock failed");
    return json({ error: "Unable to record achievement" }, 500);
  }
}
