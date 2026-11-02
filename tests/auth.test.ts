import assert from "node:assert/strict";
import test from "node:test";
import { passwordsMatch, signSession, verifySession } from "../src/lib/auth";
import { RateLimiter } from "../src/lib/rate-limit";

test("compares passwords without matching a different value", () => {
  assert.equal(passwordsMatch("correct-horse-battery", "correct-horse-battery"), true);
  assert.equal(passwordsMatch("correct-horse-battery", "correct-horse-batterz"), false);
  assert.equal(passwordsMatch("short", "much-longer-password"), false);
});

test("accepts a signed session and rejects expiry or tampering", () => {
  const token = signSession("secret-value-123456", 2_000);
  assert.equal(verifySession("secret-value-123456", token, 1_000), true);
  assert.equal(verifySession("secret-value-123456", token, 2_000), false);
  assert.equal(verifySession("other-secret-1234567", token, 1_000), false);
  const [version, expiry, signature] = token.split(".");
  assert.equal(verifySession("secret-value-123456", `${version}.${expiry}.${signature}x`, 1_000), false);
});

test("rate limit blocks the next call inside the window", () => {
  const limiter = new RateLimiter(2, 1_000);
  assert.equal(limiter.allow("a", 0), true);
  assert.equal(limiter.allow("a", 10), true);
  assert.equal(limiter.allow("a", 20), false);
  assert.equal(limiter.allow("b", 20), true);
  assert.equal(limiter.allow("a", 1_001), true);
});
