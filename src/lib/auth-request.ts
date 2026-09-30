import type { CookieOptions } from "@supabase/ssr";

// Same-site relative path only: one leading slash, no protocol-relative "//" or backslash tricks.
export function safeNext(value: unknown, fallback = "/me"): string {
  return typeof value === "string" && /^\/(?![/\\])/.test(value) ? value : fallback;
}

// Auth cookies never reach scripts or games.moyufuns.com (D3).
export function hardenCookie(
  options: CookieOptions,
  production = process.env.NODE_ENV === "production",
): CookieOptions {
  return {
    ...options,
    domain: undefined,
    httpOnly: true,
    sameSite: "lax",
    secure: production,
  };
}

export function isConfirmType(value: unknown): value is "email" | "recovery" {
  return value === "email" || value === "recovery";
}
