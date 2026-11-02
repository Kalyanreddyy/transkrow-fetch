import assert from "node:assert/strict";
import test from "node:test";
import { assertPublicHttpUrl, isBlockedIp, UrlPolicyError } from "../src/lib/url-policy";

const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];

test("blocks loopback, private, link-local, and metadata addresses", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.1.9", "172.16.0.4", "169.254.169.254", "::1", "fd00::1"]) {
    assert.equal(isBlockedIp(ip), true, ip);
  }
  assert.equal(isBlockedIp("::ffff:127.0.0.1"), true);
  assert.equal(isBlockedIp("93.184.216.34"), false);
});

test("rejects non-http URLs, localhost, and embedded credentials", async () => {
  await assert.rejects(() => assertPublicHttpUrl("file:///etc/passwd", publicLookup), UrlPolicyError);
  await assert.rejects(() => assertPublicHttpUrl("http://127.0.0.1/latest/meta-data", publicLookup), UrlPolicyError);
  await assert.rejects(() => assertPublicHttpUrl("http://localhost/admin", publicLookup), UrlPolicyError);
  await assert.rejects(
    () => assertPublicHttpUrl("https://user:pass@example.com/video", publicLookup),
    UrlPolicyError,
  );
  await assert.rejects(
    () => assertPublicHttpUrl("https://metadata.google.internal/", publicLookup),
    UrlPolicyError,
  );
});

test("rejects a public name that resolves to a private address", async () => {
  await assert.rejects(
    () => assertPublicHttpUrl("https://rebind.example/watch", async () => [{ address: "10.0.0.8", family: 4 }]),
    /not allowed/,
  );
});

test("accepts a public https video link", async () => {
  const url = await assertPublicHttpUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ", publicLookup);
  assert.equal(url.hostname, "www.youtube.com");
  assert.equal(url.protocol, "https:");
});

test("rejects a shell-looking URL that is not http", async () => {
  await assert.rejects(
    () => assertPublicHttpUrl("https://example.com/a;rm -rf /", publicLookup),
    UrlPolicyError,
  );
});
