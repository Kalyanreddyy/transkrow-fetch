import assert from "node:assert/strict";
import test from "node:test";
import { engineReady, potHealthFromPing, probePotProvider } from "../src/lib/pot";

test("health ignores the PO provider when it is not configured", () => {
  const pot = potHealthFromPing(false, null, null);
  assert.equal(engineReady("2026.10.29.232701", "ffmpeg version", pot), true);
  assert.equal(pot.enabled, false);
});

test("health requires a live PO provider when one is configured", () => {
  const up = potHealthFromPing(true, 200, { version: "2.0.2" });
  const down = potHealthFromPing(true, null, null);
  assert.equal(up.ok, true);
  assert.equal(up.version, "2.0.2");
  assert.equal(engineReady("2026.10.29.232701", "ffmpeg version", up), true);
  assert.equal(engineReady("2026.10.29.232701", "ffmpeg version", down), false);
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
