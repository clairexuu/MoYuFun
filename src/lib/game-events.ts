import type { BrowserEvent } from "./browser-events.ts";

export type GameMessageType = "ready" | "start" | "end";

type MessageLike = {
  data: unknown;
  origin: string;
  source: unknown;
};

function isGameMessage(value: unknown): value is {
  source: "moyufun-game";
  version: 1;
  type: GameMessageType;
} {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const message = value as Record<string, unknown>;
  return (
    Object.keys(message).length === 3 &&
    message.source === "moyufun-game" &&
    message.version === 1 &&
    (message.type === "ready" ||
      message.type === "start" ||
      message.type === "end")
  );
}

export function readGameMessage(
  event: MessageLike,
  expectedOrigin: string,
  expectedSource: unknown,
): GameMessageType | undefined {
  if (
    event.origin !== expectedOrigin ||
    event.source !== expectedSource ||
    !isGameMessage(event.data)
  ) {
    return undefined;
  }

  return event.data.type;
}

export type GameEventContext = {
  game_id: string;
  game_version_id: string;
  path: string;
};

export type GameLifecycleOptions = {
  context: GameEventContext;
  track: (event: BrowserEvent) => unknown;
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
    message(type: GameMessageType) {
      if (type === "start") {
        startPlay();
        return;
      }
      if (type === "end") {
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
