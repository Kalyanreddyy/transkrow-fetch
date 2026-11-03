import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { rm } from "node:fs/promises";
import { removeExpiredJobs, type Job } from "../src/lib/jobs";
import { runProcess } from "../src/lib/process-runner";

function job(id: string, overrides: Partial<Job> = {}): Job {
  return {
    id,
    url: "https://example.com/watch",
    pageHost: "example.com",
    mode: "audio",
    playlist: false,
    status: "completed",
    progress: 100,
    label: null,
    error: null,
    detail: null,
    files: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    finishedAt: "2026-01-01T00:10:00.000Z",
    expiresAt: "2026-01-01T06:00:00.000Z",
    ...overrides,
  };
}

test("cleanup removes expired directories and keeps running jobs", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "transkrow-cleanup-"));
  const expiredId = "11111111-1111-4111-8111-111111111111";
  const runningId = "22222222-2222-4222-8222-222222222222";
  await writeFile(path.join(root, expiredId), "old");
  await writeFile(path.join(root, runningId), "active");
  const removed: string[] = [];
  const kept = await removeExpiredJobs(
    [
      job(expiredId),
      job(runningId, { status: "running", expiresAt: "2020-01-01T00:00:00.000Z" }),
    ],
    Date.parse("2026-11-02T00:00:00.000Z"),
    async (id) => {
      removed.push(id);
      await rm(path.join(root, id), { force: true });
    },
  );
  assert.deepEqual(removed, [expiredId]);
  assert.equal(kept.length, 1);
  assert.equal(kept[0]?.id, runningId);
  await rm(root, { recursive: true, force: true });
});

test("process arguments are not executed by a shell", async () => {
  const marker = path.join(tmpdir(), `transkrow-pwn-${Date.now()}`);
  const payload = `; require('fs').writeFileSync(${JSON.stringify(marker)}, 'pwned')`;
  const result = await runProcess(
    process.execPath,
    ["-e", "process.stdout.write(process.argv[1] || '')", payload],
    10_000,
    () => undefined,
  );
  assert.equal(result.code, 0);
  assert.equal(result.output.includes(payload), true);
  await assert.rejects(() => import("node:fs/promises").then((fs) => fs.stat(marker)));
});
