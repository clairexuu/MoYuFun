const VISITOR_KEY = "moyufun.visitor_id";
const SESSION_KEY = "moyufun.session";
const SESSION_TIMEOUT_MS = 30 * 60 * 1_000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type StorageAdapter = Pick<Storage, "getItem" | "setItem">;

type CommonEvent = {
  path: string;
};

export type BrowserEvent =
  | (CommonEvent & { event_type: "page_view" })
  | (CommonEvent & {
      event_type: "game_detail_view";
      game_id: string;
      game_version_id: string;
    })
  | (CommonEvent & {
      event_type: "game_load";
      game_id: string;
      game_version_id: string;
      load_id: string;
    })
  | (CommonEvent & {
      event_type: "game_ready";
      game_id: string;
      game_version_id: string;
      load_id: string;
      duration_ms: number;
    })
  | (CommonEvent & {
      event_type: "game_start" | "game_end";
      game_id: string;
      game_version_id: string;
      play_id: string;
    })
  | (CommonEvent & {
      event_type: "heartbeat";
      game_id: string;
      game_version_id: string;
      play_id: string;
      active_seconds: 30;
    });

export type EventPayload = BrowserEvent & {
  event_id: string;
  visitor_id: string;
  session_id: string;
  occurred_at: string;
};

type EventClientOptions = {
  storage: StorageAdapter;
  now: () => number;
  randomUUID: () => string;
  send: (event: EventPayload) => Promise<unknown>;
};

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function createPageVisit(track: () => Promise<unknown>) {
  let sent = false;
  return async () => {
    if (sent) return;
    sent = true;
    await track();
  };
}

export function createEventClient(options: EventClientOptions) {
  let memoryVisitor: string | undefined;
  let memorySession: { session_id: string; lastActivity: number } | undefined;

  function read(key: string): string | null {
    try {
      return options.storage.getItem(key);
    } catch {
      return null;
    }
  }

  function write(key: string, value: string): void {
    try {
      options.storage.setItem(key, value);
    } catch {
      // Storage denial must not block gameplay or event delivery.
    }
  }

  function getVisitor(): string {
    const stored = read(VISITOR_KEY);
    if (isUuid(stored)) return stored;

    memoryVisitor ??= options.randomUUID();
    write(VISITOR_KEY, memoryVisitor);
    return memoryVisitor;
  }

  function getSession(now: number) {
    const stored = read(SESSION_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Record<string, unknown>;
        if (
          isUuid(parsed.session_id) &&
          typeof parsed.lastActivity === "number" &&
          now - parsed.lastActivity < SESSION_TIMEOUT_MS
        ) {
          memorySession = {
            session_id: parsed.session_id,
            lastActivity: now,
          };
        }
      } catch {
        // Replace malformed state below.
      }
    }

    if (
      !memorySession ||
      now - memorySession.lastActivity >= SESSION_TIMEOUT_MS
    ) {
      memorySession = { session_id: options.randomUUID(), lastActivity: now };
    } else {
      memorySession.lastActivity = now;
    }

    write(SESSION_KEY, JSON.stringify(memorySession));
    return memorySession.session_id;
  }

  return {
    async track(event: BrowserEvent) {
      const now = options.now();
      const visitorId = getVisitor();
      const sessionId = getSession(now);
      const payload: EventPayload = {
        ...event,
        event_id: options.randomUUID(),
        visitor_id: visitorId,
        session_id: sessionId,
        occurred_at: new Date(now).toISOString(),
      };
      await options.send(payload);
      return payload;
    },
  };
}

let browserClient: ReturnType<typeof createEventClient> | undefined;

export function trackBrowserEvent(event: BrowserEvent): Promise<unknown> {
  browserClient ??= createEventClient({
    storage: {
      getItem: (key) => window.localStorage.getItem(key),
      setItem: (key, value) => window.localStorage.setItem(key, value),
    },
    now: Date.now,
    randomUUID: () => window.crypto.randomUUID(),
    send: (payload) =>
      fetch("/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "same-origin",
        keepalive: true,
      }),
  });

  return browserClient.track(event).catch(() => undefined);
}
