import assert from "node:assert/strict";
import test from "node:test";
import { ConfigError, loadConfig, parseByteSize } from "../src/lib/config";

const base: NodeJS.ProcessEnv = {
  AUTH_PASSWORD: "correct-horse-battery",
  AUTH_SECRET: "this-is-a-long-secret",
  NODE_ENV: "test",
};

test("rejects a short password outside the explicit dev bypass", () => {
  assert.throws(() => loadConfig({ NODE_ENV: "production" }), /AUTH_PASSWORD/);
  assert.throws(() => loadConfig({ ...base, AUTH_PASSWORD: "short" }), ConfigError);
});

test("allows the dev bypass only when it is explicitly enabled", () => {
  const config = loadConfig({ NODE_ENV: "development", ALLOW_INSECURE_DEV_AUTH: "1" });
  assert.equal(config.authPassword, "dev-only-password");
});

test("parses size suffixes and proxy URLs", () => {
  assert.equal(parseByteSize("500M", "MAX_FILE_BYTES"), 500 * 1024 * 1024);
  const config = loadConfig({
    ...base,
    MAX_FILE_BYTES: "20M",
    DELETE_AFTER_MINUTES: "20",
    YTDLP_PROXY: "socks5://proxy.example:1080",
    DATA_DIR: "/tmp/transkrow-test-data",
  });
  assert.equal(config.maxFileBytes, 20 * 1024 * 1024);
  assert.equal(config.deleteAfterMinutes, 20);
  assert.equal(config.proxyUrl, "socks5://proxy.example:1080");
});

test("production defaults stay inside a 512 MB free host", () => {
  const config = loadConfig({ ...base, NODE_ENV: "production" });
  assert.equal(config.dataDir, "/tmp/transkrow");
  assert.equal(config.deleteAfterMinutes, 15);
  assert.equal(config.maxFileBytes, 150 * 1024 * 1024);
  assert.equal(config.maxDurationSeconds, 90 * 60);
  assert.equal(config.maxDiskBytes, 400 * 1024 * 1024);
  assert.equal(config.maxConcurrent, 1);
});
test("rejects a proxy that is not http or socks", () => {
  assert.throws(() => loadConfig({ ...base, YTDLP_PROXY: "file:///tmp/x" }), /YTDLP_PROXY/);
});
