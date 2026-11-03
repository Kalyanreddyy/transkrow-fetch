import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { inspectNetscapeCookies, normalizeNetscapeCookies, writeNetscapeCookiesFile } from "../src/lib/cookies";

const pasted = [
  ".youtube.com\tTRUE\t/\tTRUE\t1893456000\tSID\tAAAA",
  "BBBB",
  "#HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t1893456000\tHSID\ttoken",
].join("\r\n");

test("normalizes CRLF, unwraps a continued value, and adds the Netscape header", () => {
  const text = normalizeNetscapeCookies(`\r\n${pasted}\r\n`);
  assert.equal(text.startsWith("# Netscape HTTP Cookie File\n"), true);
  assert.equal(text.includes("\r"), false);
  assert.equal(text.includes("SID\tAAAABBBB"), true);
  assert.equal(text.includes("#HttpOnly_.youtube.com\t"), true);
  assert.equal(normalizeNetscapeCookies(text).startsWith("# Netscape HTTP Cookie File\n# Netscape"), false);
});

test("keeps an existing HTTP Cookie File header as the first line", () => {
  const text = normalizeNetscapeCookies("# HTTP Cookie File\r\n.youtube.com\tTRUE\t/\tTRUE\t1\tA\tb\r\n");
  assert.equal(text.split("\n")[0], "# HTTP Cookie File");
  assert.equal(text.includes("# Netscape HTTP Cookie File"), false);
});

test("writes the cookies file with mode 0600 and does not echo the contents in the path", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "transkrow-cookies-"));
  try {
    const destination = await writeNetscapeCookiesFile(root, pasted);
    assert.equal(destination, path.join(root, "cookies.txt"));
    const info = await stat(destination);
    assert.equal(info.mode & 0o777, 0o600);
    const body = await readFile(destination, "utf8");
    assert.equal(body.includes("SID\tAAAABBBB"), true);
    assert.equal(body.startsWith("# Netscape HTTP Cookie File\n"), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("detects spaced-out cookie rows that yt-dlp will skip", () => {
  const bad = normalizeNetscapeCookies(".youtube.com    TRUE    /    TRUE    1    SID    x\n");
  const report = inspectNetscapeCookies(bad);
  assert.equal(report.hasTabs, false);
  assert.equal(report.looksSpaced, true);
  const good = normalizeNetscapeCookies(".youtube.com\tTRUE\t/\tTRUE\t1\tSID\tx\n");
  const ok = inspectNetscapeCookies(good);
  assert.equal(ok.hasTabs, true);
  assert.equal(ok.hasSessionCookie, true);
});
