import assert from "node:assert/strict";
import test from "node:test";

import { hardenCookie, isConfirmType, safeNext } from "../src/lib/auth-request.ts";

test("next param accepts only same-site relative paths", () => {
  assert.equal(safeNext("/play/slash"), "/play/slash");
  assert.equal(safeNext("/me?tab=1"), "/me?tab=1");
  assert.equal(safeNext(undefined), "/me");
  assert.equal(safeNext(""), "/me");
  assert.equal(safeNext("me"), "/me");
  assert.equal(safeNext("//evil.example"), "/me");
  assert.equal(safeNext("/\\evil.example"), "/me");
  assert.equal(safeNext("https://evil.example/"), "/me");
  assert.equal(safeNext(["/a"]), "/me");
});

test("auth cookies are HttpOnly, Lax, host-only and Secure in production", () => {
  const hardened = hardenCookie({ domain: ".moyufuns.com", httpOnly: false, sameSite: "none", path: "/" }, true);
  assert.equal(hardened.domain, undefined);
  assert.equal(hardened.httpOnly, true);
  assert.equal(hardened.sameSite, "lax");
  assert.equal(hardened.secure, true);
  assert.equal(hardened.path, "/");
  assert.equal(hardenCookie({}, false).secure, false);
});

test("confirm accepts only email and recovery links", () => {
  assert.equal(isConfirmType("email"), true);
  assert.equal(isConfirmType("recovery"), true);
  assert.equal(isConfirmType("magiclink"), false);
  assert.equal(isConfirmType(null), false);
});
