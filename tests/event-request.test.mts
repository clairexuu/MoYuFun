import assert from "node:assert/strict";
import test from "node:test";

import {
  handleEventRequest,
  type SubmitEvent,
  type ValidatedEvent,
} from "../src/lib/event-request.ts";

const NOW = Date.parse("2026-09-12T12:00:00.000Z");
const IDS = {
  event: "11111111-1111-4111-8111-111111111111",
  visitor: "22222222-2222-4222-8222-222222222222",
  session: "33333333-3333-4333-8333-333333333333",
  game: "44444444-4444-4444-8444-444444444444",
  version: "55555555-5555-4555-8555-555555555555",
  load: "66666666-6666-4666-8666-666666666666",
  play: "77777777-7777-4777-8777-777777777777",
};

function request(body: unknown, headers?: HeadersInit): Request {
  return new Request("https://www.moyufuns.com/api/events", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function event(overrides: Record<string, unknown> = {}) {
  return {
    event_id: IDS.event,
    event_type: "game_ready",
    visitor_id: IDS.visitor,
    session_id: IDS.session,
    game_id: IDS.game,
    game_version_id: IDS.version,
    load_id: IDS.load,
    path: "/play/slash",
    duration_ms: 1250,
    occurred_at: "2026-09-12T11:59:00.000Z",
    ...overrides,
  };
}

test("accepts a valid event and gives the submitter the client IP", async () => {
  let submitted: ValidatedEvent | undefined;
  let ip: string | undefined;
  const submit: SubmitEvent = async (value, clientIp) => {
    submitted = value;
    ip = clientIp;
    return "accepted";
  };
  const response = await handleEventRequest(
    request(event(), { "x-vercel-forwarded-for": "203.0.113.7" }),
    submit,
    NOW,
  );

  assert.equal(response.status, 204);
  assert.equal(submitted?.event_type, "game_ready");
  assert.equal(ip, "203.0.113.7");
});

test("accepts every v0.1 event shape", async () => {
  const submit: SubmitEvent = async () => "accepted";
  const common = {
    event_id: IDS.event,
    visitor_id: IDS.visitor,
    session_id: IDS.session,
    occurred_at: "2026-09-12T11:59:00.000Z",
  };
  const game = { game_id: IDS.game, game_version_id: IDS.version };
  const events = [
    { ...common, event_type: "page_view", path: "/" },
    {
      ...common,
      ...game,
      event_type: "game_detail_view",
      path: "/games/slash",
    },
    {
      ...common,
      ...game,
      event_type: "game_load",
      load_id: IDS.load,
      path: "/play/slash",
    },
    event(),
    {
      ...common,
      ...game,
      event_type: "game_start",
      play_id: IDS.play,
      path: "/play/slash",
    },
    {
      ...common,
      ...game,
      event_type: "heartbeat",
      play_id: IDS.play,
      active_seconds: 30,
      path: "/play/slash",
    },
    {
      ...common,
      ...game,
      event_type: "game_end",
      play_id: IDS.play,
      path: "/play/slash",
    },
  ];

  for (const validEvent of events) {
    const response = await handleEventRequest(
      request(validEvent),
      submit,
      NOW,
    );
    assert.equal(response.status, 204);
  }
});

test("returns the same success for a duplicate event", async () => {
  const duplicate: SubmitEvent = async () => "accepted";
  const response = await handleEventRequest(request(event()), duplicate, NOW);

  assert.equal(response.status, 204);
  assert.equal(await response.text(), "");
});

test("rejects unknown events, invalid UUIDs, times, and paths", async () => {
  const submit: SubmitEvent = async () => "accepted";
  const invalidEvents = [
    event({ event_type: "unknown" }),
    event({ event_id: "not-a-uuid" }),
    event({ occurred_at: "2026-02-30T12:00:00.000Z" }),
    event({ occurred_at: "2026-09-10T12:00:00.000Z" }),
    event({ path: "https://example.com/play/slash" }),
  ];

  for (const invalidEvent of invalidEvents) {
    const response = await handleEventRequest(
      request(invalidEvent),
      submit,
      NOW,
    );
    assert.equal(response.status, 400);
  }
});

test("rejects extra and event-mismatched fields", async () => {
  const submit: SubmitEvent = async () => "accepted";
  const invalidEvents = [
    event({ metadata: { environment: "production" } }),
    event({ event_type: "game_load", duration_ms: 1250 }),
    event({
      event_type: "heartbeat",
      load_id: undefined,
      duration_ms: undefined,
      play_id: IDS.play,
      active_seconds: 29,
    }),
  ];

  for (const invalidEvent of invalidEvents) {
    const response = await handleEventRequest(
      request(invalidEvent),
      submit,
      NOW,
    );
    assert.equal(response.status, 400);
  }
});

test("rejects non-JSON, malformed JSON, and oversized bodies", async () => {
  const submit: SubmitEvent = async () => "accepted";
  const nonJson = await handleEventRequest(
    request("hello", { "content-type": "text/plain" }),
    submit,
    NOW,
  );
  const malformed = await handleEventRequest(request("{"), submit, NOW);
  const oversized = await handleEventRequest(
    request(JSON.stringify({ padding: "x".repeat(4_096) })),
    submit,
    NOW,
  );

  assert.equal(nonJson.status, 415);
  assert.equal(malformed.status, 400);
  assert.equal(oversized.status, 413);
});

test("returns 429 when the shared limiter rejects", async () => {
  const limited: SubmitEvent = async () => "rate-limited";
  const response = await handleEventRequest(request(event()), limited, NOW);

  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "60");
});

test("maps database constraint failures to an invalid event", async () => {
  const invalid: SubmitEvent = async () => "invalid";
  const response = await handleEventRequest(request(event()), invalid, NOW);

  assert.equal(response.status, 400);
});

test("does not expose database errors in the response or logs", async () => {
  const secret = "postgresql://user:password@example.invalid/database";
  const failure: SubmitEvent = async () => {
    throw new Error(secret);
  };
  const originalError = console.error;
  let logged = "";
  console.error = (...values: unknown[]) => {
    logged += values.join(" ");
  };

  try {
    const response = await handleEventRequest(request(event()), failure, NOW);
    const body = await response.text();

    assert.equal(response.status, 500);
    assert.equal(body.includes(secret), false);
    assert.equal(logged.includes(secret), false);
  } finally {
    console.error = originalError;
  }
});
