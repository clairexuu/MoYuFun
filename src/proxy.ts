import { createHash, timingSafeEqual } from "node:crypto";

import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server.js";

import { hardenCookie } from "./lib/auth-request.ts";

const USERNAME = "moyufun";
const CHALLENGE = 'Basic realm="MoYuFun Stats", charset="UTF-8"';

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function matches(value: string, expected: string): boolean {
  return timingSafeEqual(digest(value), digest(expected));
}

function readCredentials(header: string | null): {
  username: string;
  password: string;
} | undefined {
  const match = /^Basic ([A-Za-z0-9+/]+={0,2})$/.exec(header ?? "");

  if (!match) {
    return undefined;
  }

  const decoded = Buffer.from(match[1], "base64").toString("utf8");
  const separator = decoded.indexOf(":");

  if (separator < 0) {
    return undefined;
  }

  return {
    username: decoded.slice(0, separator),
    password: decoded.slice(separator + 1),
  };
}

function statsAuth(request: NextRequest): NextResponse {
  const password = process.env.MOYUFUN_STATS_PASSWORD;

  if (!password || password.length < 32) {
    return new NextResponse("Stats access is not configured.", {
      status: 503,
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  const credentials = readCredentials(request.headers.get("authorization"));
  const usernameMatches = matches(credentials?.username ?? "", USERNAME);
  const passwordMatches = matches(credentials?.password ?? "", password);

  if (!usernameMatches || !passwordMatches) {
    return new NextResponse("Authentication required.", {
      status: 401,
      headers: {
        "Cache-Control": "private, no-store",
        "WWW-Authenticate": CHALLENGE,
      },
    });
  }

  const response = NextResponse.next();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

// Refreshes the Supabase session cookie so server pages read a valid JWT.
async function refreshSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();

  if (url && key) {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, hardenCookie(options));
          }
          for (const [name, value] of Object.entries(headers)) {
            response.headers.set(name, value);
          }
        },
      },
    });
    await supabase.auth.getClaims();
  }

  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (request.nextUrl.pathname.startsWith("/stats")) {
    return statsAuth(request);
  }

  return refreshSession(request);
}

export const config = {
  matcher: [
    "/stats/:path*",
    "/me",
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
    "/auth/:path*",
  ],
};
