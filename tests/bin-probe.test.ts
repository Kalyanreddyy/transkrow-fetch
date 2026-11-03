import assert from "node:assert/strict";
import test from "node:test";
import { probeBinary, probeFailureSummary, sanitizeProbeText } from "../src/lib/bin-probe";

test("probe text drops cookie rows and the env var name", () => {
  const summary = sanitizeProbeText(
    [
      "ERROR: cookies file does not look like a Netscape format cookies file",
      ".youtube.com\tTRUE\t/\tTRUE\t1\tSID\tSECRETCOOKIEVALUE",
      "COOKIES_CONTENT=SECRETCOOKIEVALUE",
    ].join("\n"),
  );
  assert.match(summary, /Netscape format/);
  assert.equal(summary.includes("SECRETCOOKIEVALUE"), false);
  assert.equal(summary.includes("COOKIES_CONTENT"), false);
  const failure = probeFailureSummary(
    Object.assign(new Error("spawn E2BIG"), { code: "E2BIG" }),
    "",
    ".youtube.com\tTRUE\t/\tTRUE\t1\tSID\tSECRETCOOKIEVALUE",
  );
  assert.equal(failure, "E2BIG");
});

test("a large COOKIES_CONTENT does not stop a version probe", async () => {
  const previous = process.env.COOKIES_CONTENT;
  process.env.COOKIES_CONTENT = `SECRETCOOKIEVALUE\n${"x".repeat(180_000)}`;
  try {
    const version = await probeBinary(process.execPath, ["-e", "process.stdout.write('2026.10.26')"]);
    assert.equal(version, "2026.10.26");
  } finally {
    if (previous === undefined) {
      delete process.env.COOKIES_CONTENT;
    } else {
      process.env.COOKIES_CONTENT = previous;
    }
  }
});

test("logs why a probe failed without the cookie body", async () => {
  const lines: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  try {
    const version = await probeBinary(process.execPath, [
      "-e",
      "console.error('.youtube.com\\tTRUE\\t/\\tTRUE\\t1\\tSID\\tSECRETCOOKIEVALUE'); console.error('ENOENT missing binary'); process.exit(1)",
    ]);
    assert.equal(version, null);
  } finally {
    console.error = original;
  }
  assert.equal(lines.length, 1);
  assert.match(lines[0] ?? "", /exit 1/);
  assert.match(lines[0] ?? "", /ENOENT missing binary/);
  assert.equal((lines[0] ?? "").includes("SECRETCOOKIEVALUE"), false);
});

test("keeps a printed yt-dlp version when the process also exits non-zero", async () => {
  const version = await probeBinary(process.execPath, ["-e", "process.stdout.write('2026.10.26\\n'); process.exit(1)"]);
  assert.equal(version, "2026.10.26");
});
