import assert from "node:assert/strict";
import test from "node:test";

import {
  handleAchievementRequest,
  type AchievementRequestDeps,
  type UnlockResult,
} from "../src/lib/achievement-request.ts";

const SITE = "https://www.moyufuns.com";
const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BODY = {
  game_id: "44444444-4444-4444-8444-444444444444",
  game_version_id: "55555555-5555-4555-8555-555555555555",
  key: "first_win",
};

function request(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${SITE}/api/achievements`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: SITE, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function deps(
  result: UnlockResult | Error = "unlocked",
  userId: string | undefined = USER,
): AchievementRequestDeps & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    siteOrigin: SITE,
    getUserId: async () => userId,
    unlock: async (id, unlock) => {
      calls.push([id, unlock]);
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

test("records an unlock and reports already unlocked", async () => {
  const first = deps("unlocked");
  const response = await handleAchievementRequest(request(BODY), first);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "unlocked" });
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(first.calls, [[USER, BODY]]);

  const again = await handleAchievementRequest(request(BODY), deps("already_unlocked"));
  assert.deepEqual(await again.json(), { status: "already_unlocked" });
});

test("rejects other origins and non-JSON before touching auth", async () => {
  const d = deps();
  const bad = await handleAchievementRequest(
    request(BODY, { origin: "https://games.moyufuns.com" }),
    d,
  );
  const missing = await handleAchievementRequest(
    new Request(`${SITE}/api/achievements`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(BODY),
    }),
    d,
  );
  const text = await handleAchievementRequest(
    request("x", { "content-type": "text/plain" }),
    d,
  );

  assert.equal(bad.status, 403);
  assert.equal(missing.status, 403);
  assert.equal(text.status, 400);
  assert.equal(d.calls.length, 0);
});

test("requires a logged-in user", async () => {
  const response = await handleAchievementRequest(request(BODY), deps("unlocked", ""));
  assert.equal(response.status, 401);
});

test("rejects bad bodies and unknown keys with 400", async () => {
  const bodies: unknown[] = [
    "{",
    [],
    { ...BODY, extra: 1 },
    { game_id: BODY.game_id, key: BODY.key },
    { ...BODY, key: "First" },
    { ...BODY, game_id: "not-a-uuid" },
    { ...BODY, key: "x".repeat(1_100) },
  ];

  for (const body of bodies) {
    const response = await handleAchievementRequest(request(body), deps());
    assert.equal(response.status, 400, JSON.stringify(body).slice(0, 40));
  }

  const unknown = await handleAchievementRequest(request(BODY), deps("unknown"));
  assert.equal(unknown.status, 400);
});

test("maps rate limiting to 429 and hides database failures behind 500", async () => {
  const limited = await handleAchievementRequest(request(BODY), deps("rate-limited"));
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "60");

  const secret = "postgresql://user:password@example.invalid/database";
  const originalError = console.error;
  let logged = "";
  console.error = (...values: unknown[]) => {
    logged += values.join(" ");
  };
  try {
    const failed = await handleAchievementRequest(request(BODY), deps(new Error(secret)));
    assert.equal(failed.status, 500);
    assert.equal((await failed.text()).includes(secret), false);
    assert.equal(logged.includes(secret), false);
  } finally {
    console.error = originalError;
  }
});
