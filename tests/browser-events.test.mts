import assert from "node:assert/strict";
import test from "node:test";

import {
  createEventClient,
  createPageVisit,
} from "../src/lib/browser-events.ts";

const IDS = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
  "55555555-5555-4555-8555-555555555555",
  "66666666-6666-4666-8666-666666666666",
];

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

test("persists a visitor and reuses an active session", async () => {
  const storage = memoryStorage();
  const sent: Record<string, unknown>[] = [];
  let now = Date.parse("2026-09-12T12:00:00.000Z");
  let nextId = 0;
  const client = createEventClient({
    storage,
    now: () => now,
    randomUUID: () => IDS[nextId++],
    send: async (event) => sent.push(event),
  });

  await client.track({ event_type: "page_view", path: "/" });
  now += 60_000;
  await client.track({ event_type: "page_view", path: "/" });

  assert.equal(sent[0].visitor_id, IDS[0]);
  assert.equal(sent[1].visitor_id, IDS[0]);
  assert.equal(sent[0].session_id, IDS[1]);
  assert.equal(sent[1].session_id, IDS[1]);
  assert.notEqual(sent[0].event_id, sent[1].event_id);
});

test("rotates the session after thirty minutes without activity", async () => {
  const storage = memoryStorage();
  const sent: Record<string, unknown>[] = [];
  let now = Date.parse("2026-09-12T12:00:00.000Z");
  let nextId = 0;
  const options = {
    storage,
    now: () => now,
    randomUUID: () => IDS[nextId++],
    send: async (event: Record<string, unknown>) => sent.push(event),
  };

  await createEventClient(options).track({ event_type: "page_view", path: "/" });
  now += 30 * 60_000;
  await createEventClient(options).track({ event_type: "page_view", path: "/" });

  assert.equal(sent[1].visitor_id, sent[0].visitor_id);
  assert.notEqual(sent[1].session_id, sent[0].session_id);
});

test("records each page visit once even when its effect runs twice", async () => {
  let count = 0;
  const firstVisit = createPageVisit(async () => {
    count += 1;
  });

  await firstVisit();
  await firstVisit();
  await createPageVisit(async () => {
    count += 1;
  })();

  assert.equal(count, 2);
});

test("falls back to page memory when localStorage is unavailable", async () => {
  const sent: Record<string, unknown>[] = [];
  let nextId = 0;
  const client = createEventClient({
    storage: {
      getItem() {
        throw new Error("denied");
      },
      setItem() {
        throw new Error("denied");
      },
    },
    now: () => Date.parse("2026-09-12T12:00:00.000Z"),
    randomUUID: () => IDS[nextId++],
    send: async (event) => sent.push(event),
  });

  await client.track({ event_type: "page_view", path: "/" });
  await client.track({ event_type: "page_view", path: "/" });

  assert.equal(sent[1].visitor_id, sent[0].visitor_id);
  assert.equal(sent[1].session_id, sent[0].session_id);
});
