import "server-only";

import { createHmac } from "node:crypto";

import { getDatabase } from "@/lib/database";
import type { SubmitEvent } from "@/lib/event-request";

type RateLimitRow = {
  allowed: boolean;
};

function getEnvironment(): "production" | "preview" | "development" {
  const vercelEnvironment = process.env.VERCEL_ENV;

  if (
    vercelEnvironment === "production" ||
    vercelEnvironment === "preview" ||
    vercelEnvironment === "development"
  ) {
    return vercelEnvironment;
  }

  return process.env.NODE_ENV === "production" ? "production" : "development";
}

function getRateLimitKey(clientIp: string): string {
  const secret = process.env.MOYUFUN_WEB_DATABASE_URL;

  if (!secret) {
    throw new Error("Database is not configured");
  }

  return createHmac("sha256", secret)
    .update(`event-rate-limit:${clientIp}`)
    .digest("hex");
}

function isInvalidDatabaseEvent(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }

  return ["22003", "23502", "23503", "23514"].includes(
    String(error.code),
  );
}

export const submitEvent: SubmitEvent = async (event, clientIp) => {
  const sql = getDatabase();
  const [{ allowed }] = await sql<RateLimitRow[]>`
    select public.consume_event_rate_limit(${getRateLimitKey(clientIp)}) as allowed
  `;

  if (!allowed) {
    return "rate-limited";
  }

  try {
    await sql`
      select public.record_event(
        ${event.event_id}::uuid,
        ${event.event_type}::text,
        ${event.visitor_id}::uuid,
        ${event.session_id}::uuid,
        ${event.game_id ?? null}::uuid,
        ${event.game_version_id ?? null}::uuid,
        ${event.load_id ?? null}::uuid,
        ${event.play_id ?? null}::uuid,
        ${event.path}::text,
        ${event.duration_ms ?? null}::integer,
        ${event.active_seconds ?? null}::smallint,
        ${event.occurred_at}::timestamptz,
        ${getEnvironment()}::text
      )
    `;
  } catch (error) {
    if (isInvalidDatabaseEvent(error)) {
      return "invalid";
    }

    throw error;
  }

  return "accepted";
};
