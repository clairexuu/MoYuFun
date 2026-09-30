import assert from "node:assert/strict";
import test from "node:test";

import {
  handleStatsRequest,
  type RecordResult,
  type StatsRequestDeps,
} from "../src/lib/stats-request.ts";

const SITE = "https://www.moyufuns.com";
const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BODY = {
  game_id: "44444444-4444-4444-8444-444444444444",
  game_version_id: "55555555-5555-4555-8555-555555555555",
  stats: { rounds: 1, wins: 1, kills: 7 },
};

function request(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${SITE}/api/stats`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: SITE, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function deps(
  result: RecordResult | Error = "ok",
  userId: string | undefined = USER,
): StatsRequestDeps & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    siteOrigin: SITE,
    getUserId: async () => userId,
    record: async (id, report) => {
      calls.push([id, report]);
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

test("records a round report with 204", async () => {
  const d = deps();
  const response = await handleStatsRequest(request(BODY), d);
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(d.calls, [[USER, BODY]]);
});

test("rejects other origins and non-JSON before touching auth", async () => {
  const d = deps();
  const bad = await handleStatsRequest(
    request(BODY, { origin: "https://games.moyufuns.com" }),
    d,
  );
  const text = await handleStatsRequest(request("x", { "content-type": "text/plain" }), d);

  assert.equal(bad.status, 403);
  assert.equal(text.status, 400);
  assert.equal(d.calls.length, 0);
});

test("requires a logged-in user", async () => {
  const response = await handleStatsRequest(request(BODY), deps("ok", ""));
  assert.equal(response.status, 401);
});

test("rejects bad bodies and server-side invalid reports with 400", async () => {
  const bodies: unknown[] = [
    "{",
    [],
    { ...BODY, extra: 1 },
    { game_id: BODY.game_id, stats: BODY.stats },
    { ...BODY, stats: {} },
    { ...BODY, stats: { Rounds: 1 } },
    { ...BODY, stats: { rounds: 1.5 } },
    { ...BODY, game_id: "not-a-uuid" },
    { ...BODY, stats: { [`k${"x".repeat(2_100)}`]: 1 } },
  ];

  for (const body of bodies) {
    const response = await handleStatsRequest(request(body), deps());
    assert.equal(response.status, 400, JSON.stringify(body).slice(0, 40));
  }

  const invalid = await handleStatsRequest(request(BODY), deps("invalid"));
  assert.equal(invalid.status, 400);
});

test("maps rate limiting to 429 and hides database failures behind 500", async () => {
  const limited = await handleStatsRequest(request(BODY), deps("rate-limited"));
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "60");

  const secret = "postgresql://user:password@example.invalid/database";
  const originalError = console.error;
  let logged = "";
  console.error = (...values: unknown[]) => {
    logged += values.join(" ");
  };
  try {
    const failed = await handleStatsRequest(request(BODY), deps(new Error(secret)));
    assert.equal(failed.status, 500);
    assert.equal((await failed.text()).includes(secret), false);
    assert.equal(logged.includes(secret), false);
  } finally {
    console.error = originalError;
  }
});
