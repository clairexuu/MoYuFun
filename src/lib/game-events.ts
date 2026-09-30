import type { BrowserEvent } from "./browser-events.ts";

export const ACHIEVEMENT_KEY_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

export type GameMessage =
  | { type: "ready" | "start" | "end" }
  | { type: "achievement"; key: string };

type MessageLike = {
  data: unknown;
  origin: string;
  source: unknown;
};

export function isAchievementKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 40 &&
    ACHIEVEMENT_KEY_PATTERN.test(value)
  );
}

function parseGameMessage(value: unknown): GameMessage | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const message = value as Record<string, unknown>;
  if (message.source !== "moyufun-game" || message.version !== 1) {
    return undefined;
  }

  const keys = Object.keys(message).length;
  if (
    keys === 3 &&
    (message.type === "ready" ||
      message.type === "start" ||
      message.type === "end")
  ) {
    return { type: message.type };
  }

  if (
    keys === 4 &&
    message.type === "achievement" &&
    isAchievementKey(message.key)
  ) {
    return { type: "achievement", key: message.key };
  }

  return undefined;
}

export function readGameMessage(
  event: MessageLike,
  expectedOrigin: string,
  expectedSource: unknown,
): GameMessage | undefined {
  if (event.origin !== expectedOrigin || event.source !== expectedSource) {
    return undefined;
  }

  return parseGameMessage(event.data);
}

export type GameEventContext = {
  game_id: string;
  game_version_id: string;
  path: string;
};

export type GameLifecycleOptions = {
  context: GameEventContext;
  track: (event: BrowserEvent) => unknown;
  unlock: (key: string) => unknown;
  now: () => number;
  randomUUID: () => string;
  isVisible: () => boolean;
  setInterval: (callback: () => void, milliseconds: number) => unknown;
  clearInterval: (timer: unknown) => void;
};

export function createGameLifecycle(options: GameLifecycleOptions) {
  let loadId: string | undefined;
  let loadStartedAt = 0;
  let ready = false;
  let playId: string | undefined;
  let heartbeatTimer: unknown;
  const unlocked = new Set<string>();

  function stopHeartbeat() {
    if (heartbeatTimer === undefined) return;
    options.clearInterval(heartbeatTimer);
    heartbeatTimer = undefined;
  }

  function startPlay() {
    if (!ready || playId) return;
    playId = options.randomUUID();
    options.track({
      ...options.context,
      event_type: "game_start",
      play_id: playId,
    });
    heartbeatTimer = options.setInterval(() => {
      if (!playId || !options.isVisible()) return;
      options.track({
        ...options.context,
        event_type: "heartbeat",
        play_id: playId,
        active_seconds: 30,
      });
    }, 30_000);
  }

  function endPlay() {
    if (!playId) return;
    options.track({
      ...options.context,
      event_type: "game_end",
      play_id: playId,
    });
    playId = undefined;
    stopHeartbeat();
  }

  return {
    load() {
      playId = undefined;
      stopHeartbeat();
      loadId = options.randomUUID();
      loadStartedAt = options.now();
      ready = false;
      options.track({
        ...options.context,
        event_type: "game_load",
        load_id: loadId,
      });
    },
    message(message: GameMessage) {
      if (message.type === "achievement") {
        // Only during a round, once per key for this lifecycle.
        if (!playId || unlocked.has(message.key)) return;
        unlocked.add(message.key);
        options.unlock(message.key);
        return;
      }
      if (message.type === "start") {
        startPlay();
        return;
      }
      if (message.type === "end") {
        endPlay();
        return;
      }
      if (loadId && !ready) {
        ready = true;
        options.track({
          ...options.context,
          event_type: "game_ready",
          load_id: loadId,
          duration_ms: Math.min(
            600_000,
            Math.max(0, Math.round(options.now() - loadStartedAt)),
          ),
        });
      }
    },
    dispose() {
      playId = undefined;
      stopHeartbeat();
    },
  };
}
