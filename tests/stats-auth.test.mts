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

test("stats auth fails closed when the password is not configured", () => {
  const responses = [
    withPassword(undefined, () => proxy(request())),
    withPassword("too-short", () => proxy(request())),
  ];

  for (const response of responses) {
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("www-authenticate"), null);
  }
});

test("stats auth challenges missing and incorrect credentials", () => {
  const responses = withPassword(PASSWORD, () => [
    proxy(request()),
    proxy(request(authorization("someone-else", PASSWORD))),
    proxy(request(authorization("moyufun", "wrong-password"))),
    proxy(request("Basic not-base64!")),
  ]);

  for (const response of responses) {
    assert.equal(response.status, 401);
    assert.equal(
      response.headers.get("www-authenticate"),
      'Basic realm="MoYuFun Stats", charset="UTF-8"',
    );
  }
});

test("stats auth permits the fixed username with the configured password", () => {
  const response = withPassword(PASSWORD, () =>
    proxy(request(authorization("moyufun", PASSWORD))),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-middleware-next"), "1");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

test("proxy matcher covers only stats and its subpaths", () => {
  assert.equal(config.matcher, "/stats/:path*");
});
