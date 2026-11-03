import assert from "node:assert/strict";
import test from "node:test";
import { probeBinary, probeFailureSummary } from "../src/lib/bin-probe";
import { binaryIsExecutable, probeVersion } from "../src/lib/engine-probe";

test("an executable file counts as present and a missing path does not", async () => {
  assert.equal(await binaryIsExecutable(process.execPath), true);
  assert.equal(await binaryIsExecutable("/tmp/transkrow-missing-yt-dlp"), false);
  assert.equal(await binaryIsExecutable("   "), false);
});

test("a missing binary is not retried", async () => {
  const started = Date.now();
  const version = await probeVersion("/tmp/transkrow-missing-yt-dlp", ["--version"], {
    timeoutMs: 5_000,
    attempts: 3,
  });
  assert.equal(version, null);
  assert.ok(Date.now() - started < 2_000);
});

test("a short timeout is reported as a timeout", async () => {
  const lines: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  try {
    const version = await probeBinary(process.execPath, ["-e", "setTimeout(() => {}, 10_000)"], 300);
    assert.equal(version, null);
  } finally {
    console.error = original;
  }
  assert.match(lines.join("\n"), /timeout/);
  assert.equal(probeFailureSummary({ killed: true, signal: "SIGTERM" }, "", ""), "timeout");
});
