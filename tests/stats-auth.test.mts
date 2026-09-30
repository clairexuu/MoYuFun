import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server.js";

import { config, proxy } from "../src/proxy.ts";

const PASSWORD = "correct-horse-battery-staple-123456";

function authorization(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

function request(header?: string): NextRequest {
  return new NextRequest("https://www.moyufuns.com/stats/trends", {
    headers: header ? { authorization: header } : undefined,
  });
}

function withPassword<T>(password: string | undefined, run: () => T): T {
  const previous = process.env.MOYUFUN_STATS_PASSWORD;

  if (password === undefined) {
    delete process.env.MOYUFUN_STATS_PASSWORD;
  } else {
    process.env.MOYUFUN_STATS_PASSWORD = password;
  }

  try {
    return run();
  } finally {
    if (previous === undefined) {
      delete process.env.MOYUFUN_STATS_PASSWORD;
    } else {
      process.env.MOYUFUN_STATS_PASSWORD = previous;
    }
  }
}

test("stats auth fails closed when the password is not configured", async () => {
  const responses = await Promise.all([
    withPassword(undefined, () => proxy(request())),
    withPassword("too-short", () => proxy(request())),
  ]);

  for (const response of responses) {
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("www-authenticate"), null);
  }
});

test("stats auth challenges missing and incorrect credentials", async () => {
  const responses = await withPassword(PASSWORD, () =>
    Promise.all([
      proxy(request()),
      proxy(request(authorization("someone-else", PASSWORD))),
      proxy(request(authorization("moyufun", "wrong-password"))),
      proxy(request("Basic not-base64!")),
    ]),
  );

  for (const response of responses) {
    assert.equal(response.status, 401);
    assert.equal(
      response.headers.get("www-authenticate"),
      'Basic realm="MoYuFun Stats", charset="UTF-8"',
    );
  }
});

test("stats auth permits the fixed username with the configured password", async () => {
  const response = await withPassword(PASSWORD, () =>
    proxy(request(authorization("moyufun", PASSWORD))),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-middleware-next"), "1");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

test("proxy matcher covers stats and the session-refresh routes only", () => {
  assert.deepEqual(config.matcher, [
    "/stats/:path*",
    "/me",
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
    "/auth/:path*",
  ]);
});

test("auth routes pass through with no-store and never see Basic Auth", async () => {
  process.env.SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
  const response = await withPassword(undefined, () =>
    proxy(new NextRequest("https://www.moyufuns.com/login?next=/me")),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-middleware-next"), "1");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("www-authenticate"), null);
});
