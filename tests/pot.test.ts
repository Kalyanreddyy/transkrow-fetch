import assert from "node:assert/strict";
import test from "node:test";
import { engineReady, potHealthFromPing, probePotProvider } from "../src/lib/pot";

test("health ignores the PO provider when it is not configured", () => {
  const pot = potHealthFromPing(false, null, null);
  assert.equal(engineReady({ ytDlp: true, ffmpeg: true }, pot), true);
  assert.equal(pot.enabled, false);
});

test("health requires a live PO provider when one is configured", () => {
  const up = potHealthFromPing(true, 200, { version: "2.0.2" });
  const down = potHealthFromPing(true, null, null);
  assert.equal(up.ok, true);
  assert.equal(up.version, "2.0.2");
  assert.equal(engineReady({ ytDlp: true, ffmpeg: true }, up), true);
  assert.equal(engineReady({ ytDlp: true, ffmpeg: true }, down), false);
  assert.equal(engineReady({ ytDlp: false, ffmpeg: true }, up), false);
  assert.equal(potHealthFromPing(true, 200, {}).ok, false);
});

test("ping of the local provider reports its version", async () => {
  const pot = await probePotProvider("http://127.0.0.1:4416");
  if (!pot.ok) {
    assert.equal(pot.enabled, true);
    return;
  }
  assert.equal(pot.version, "2.0.2");
});
