import assert from "node:assert/strict";
import test from "node:test";

import {
  createGameLifecycle,
  readGameMessage,
} from "../src/lib/game-events.ts";

const CONTEXT = {
  game_id: "44444444-4444-4444-8444-444444444444",
  game_version_id: "55555555-5555-4555-8555-555555555555",
  path: "/play/slash",
};

test("accepts only the exact v1 game message from the configured iframe", () => {
  const frame = {};
  const valid = {
    data: { source: "moyufun-game", version: 1, type: "ready" },
    origin: "https://games.moyufuns.com",
    source: frame,
  };

  assert.equal(
    readGameMessage(valid, "https://games.moyufuns.com", frame),
    "ready",
  );
  assert.equal(
    readGameMessage(
      { ...valid, origin: "https://evil.example" },
      "https://games.moyufuns.com",
      frame,
    ),
    undefined,
  );
  assert.equal(
    readGameMessage(valid, "https://games.moyufuns.com", {}),
    undefined,
  );
  assert.equal(
    readGameMessage(
      { ...valid, data: { ...valid.data, game_id: "untrusted" } },
      "https://games.moyufuns.com",
      frame,
    ),
    undefined,
  );
});

test("gives every iframe attempt its own load and records ready once", () => {
  const events: Record<string, unknown>[] = [];
  let now = 1_000;
  let nextId = 0;
  const ids = [
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
  ];
  const lifecycle = createGameLifecycle({
    context: CONTEXT,
    track: (event) => events.push(event),
    now: () => now,
    randomUUID: () => ids[nextId++],
    isVisible: () => true,
    setInterval: () => 1,
    clearInterval: () => {},
  });

  lifecycle.load();
  now = 2_251;
  lifecycle.message("ready");
  lifecycle.message("ready");
  lifecycle.load();

  assert.deepEqual(
    events.map(({ event_type, load_id, duration_ms }) => ({
      event_type,
      load_id,
      duration_ms,
    })),
    [
      { event_type: "game_load", load_id: ids[0], duration_ms: undefined },
      { event_type: "game_ready", load_id: ids[0], duration_ms: 1_251 },
      { event_type: "game_load", load_id: ids[1], duration_ms: undefined },
    ],
  );
});

test("keeps one play active and heartbeats only while visible", () => {
  const events: Record<string, unknown>[] = [];
  const ids = [
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
    "33333333-3333-4333-8333-333333333333",
  ];
  let nextId = 0;
  let visible = true;
  let tick = () => {};
  let cleared = 0;
  const lifecycle = createGameLifecycle({
    context: CONTEXT,
    track: (event) => events.push(event),
    now: () => 1_000,
    randomUUID: () => ids[nextId++],
    isVisible: () => visible,
    setInterval: (callback, milliseconds) => {
      assert.equal(milliseconds, 30_000);
      tick = callback;
      return 1;
    },
    clearInterval: () => {
      cleared += 1;
    },
  });

  lifecycle.message("start");
  lifecycle.load();
  lifecycle.message("ready");
  lifecycle.message("start");
  lifecycle.message("start");
  tick();
  visible = false;
  tick();
  lifecycle.message("end");
  tick();
  lifecycle.message("start");

  assert.deepEqual(
    events.map(({ event_type, play_id, active_seconds }) => ({
      event_type,
      play_id,
      active_seconds,
    })),
    [
      { event_type: "game_load", play_id: undefined, active_seconds: undefined },
      { event_type: "game_ready", play_id: undefined, active_seconds: undefined },
      { event_type: "game_start", play_id: ids[1], active_seconds: undefined },
      { event_type: "heartbeat", play_id: ids[1], active_seconds: 30 },
      { event_type: "game_end", play_id: ids[1], active_seconds: undefined },
      { event_type: "game_start", play_id: ids[2], active_seconds: undefined },
    ],
  );
  assert.equal(cleared, 1);
});
