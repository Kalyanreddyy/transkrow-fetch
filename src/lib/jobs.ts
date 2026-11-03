import { lookup } from "node:dns/promises";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { writeNetscapeCookiesFile } from "./cookies";
import type { AppConfig } from "./config";
import { getConfig } from "./config";
import { childEnv, runProcess } from "./process-runner";
import { assertPublicHttpUrl, UrlPolicyError } from "./url-policy";
import {
  buildYtDlpArgs,
  contentDisposition,
  contentTypeFor,
  friendlyYtDlpError,
  isDownloadableFileName,
  type DownloadMode,
} from "./ytdlp";

export type JobStatus = "queued" | "running" | "completed" | "failed";

export type JobFile = { name: string; bytes: number };

export type Job = {
  id: string;
  url: string;
  pageHost: string;
  mode: DownloadMode;
  playlist: boolean;
  status: JobStatus;
  progress: number | null;
  label: string | null;
  error: string | null;
  files: JobFile[];
  createdAt: string;
  finishedAt: string | null;
  expiresAt: string;
};

type Runtime = {
  jobs: Job[];
  running: number;
  pumping: boolean;
  loaded: boolean;
  timer: ReturnType<typeof setInterval> | null;
  chain: Promise<void>;
  starting: Promise<void> | null;
};

export class JobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JobError";
  }
}

function runtime(): Runtime {
  const holder = globalThis as typeof globalThis & { __transkrowJobs?: Runtime };
  if (!holder.__transkrowJobs) {
    holder.__transkrowJobs = {
      jobs: [],
      running: 0,
      pumping: false,
      loaded: false,
      timer: null,
      chain: Promise.resolve(),
      starting: null,
    };
  }
  return holder.__transkrowJobs;
}

function isJobId(id: unknown): boolean {
  return (
    typeof id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
  );
}

function storePath(config: AppConfig): string {
  return path.join(config.dataDir, "jobs.json");
}

function jobDir(config: AppConfig, id: string): string {
  return path.join(config.downloadsDir, id);
}

async function persist(config: AppConfig): Promise<void> {
  const file = storePath(config);
  const tmp = `${file}.${process.pid}.tmp`;
  await mkdir(config.dataDir, { recursive: true });
  await writeFile(tmp, JSON.stringify({ jobs: runtime().jobs }, null, 2), { mode: 0o600 });
  await rename(tmp, file);
}

export async function directorySize(dir: string): Promise<number> {
  let total = 0;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await directorySize(full);
    } else if (entry.isFile()) {
      const info = await stat(full);
      total += info.size;
    }
  }
  return total;
}

export async function removeExpiredJobs(
  jobs: Job[],
  now: number,
  removeDir: (jobId: string) => Promise<void>,
): Promise<Job[]> {
  const kept: Job[] = [];
  for (const job of jobs) {
    const expired = Date.parse(job.expiresAt) <= now && job.status !== "running" && job.status !== "queued";
    if (expired) {
      await removeDir(job.id);
      continue;
    }
    kept.push(job);
  }
  return kept;
}

async function load(config: AppConfig): Promise<void> {
  const rt = runtime();
  if (rt.loaded) {
    return;
  }
  await mkdir(config.downloadsDir, { recursive: true });
  try {
    const raw = await readFile(storePath(config), "utf8");
    const parsed = JSON.parse(raw) as { jobs?: Job[] };
    rt.jobs = (Array.isArray(parsed.jobs) ? parsed.jobs : []).filter((job) => isJobId(job?.id));
  } catch {
    rt.jobs = [];
  }
  let changed = false;
  for (const job of rt.jobs) {
    if (job.status === "running") {
      job.status = "failed";
      job.error = "The server restarted before this download finished. Submit the link again.";
      job.finishedAt = new Date().toISOString();
      job.progress = null;
      changed = true;
    }
  }
  rt.loaded = true;
  if (changed) {
    await persist(config);
  }
}

function lock<T>(task: () => Promise<T>): Promise<T> {
  const rt = runtime();
  const run = rt.chain.then(task, task);
  rt.chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function listJobs(): Promise<Job[]> {
  await startBackgroundWork();
  const config = getConfig();
  return lock(async () => {
    await load(config);
    return runtime()
      .jobs.slice()
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  });
}

export async function getJob(id: string): Promise<Job | null> {
  const jobs = await listJobs();
  return jobs.find((job) => job.id === id) ?? null;
}

async function cleanup(config: AppConfig): Promise<void> {
  await lock(async () => {
    await load(config);
    const rt = runtime();
    rt.jobs = await removeExpiredJobs(rt.jobs, Date.now(), async (id) => {
      await rm(jobDir(config, id), { recursive: true, force: true });
    });
    await persist(config);
  });
}

export async function startBackgroundWork(): Promise<void> {
  const rt = runtime();
  if (rt.starting) {
    return rt.starting;
  }
  rt.starting = boot().catch((error) => {
    rt.starting = null;
    throw error;
  });
  return rt.starting;
}

async function boot(): Promise<void> {
  const config = getConfig();
  await mkdir(config.dataDir, { recursive: true });
  await mkdir(config.downloadsDir, { recursive: true });
  await writeCookiesFile(config);
  await load(config);
  const rt = runtime();
  if (!rt.timer) {
    rt.timer = setInterval(() => {
      void cleanup(config).then(() => pump());
    }, 60_000);
    rt.timer.unref?.();
  }
  await cleanup(config);
  await pump();
}

async function writeCookiesFile(config: AppConfig): Promise<void> {
  if (!config.cookiesContent) {
    return;
  }
  const destination = await writeNetscapeCookiesFile(config.dataDir, config.cookiesContent);
  if (!config.cookiesPath) {
    config.cookiesPath = destination;
  }
  // Drop the pasted file from the process environment so later yt-dlp spawns
  // do not inherit a secret that is large enough to fail process startup.
  config.cookiesContent = null;
  delete process.env.COOKIES_CONTENT;
}

function resolvedCookiesPath(config: AppConfig): string | null {
  if (config.cookiesPath) {
    return config.cookiesPath;
  }
  if (config.cookiesContent) {
    return path.join(config.dataDir, "cookies.txt");
  }
  return null;
}

export async function createJob(input: {
  url: string;
  mode: DownloadMode;
  playlist: boolean;
}): Promise<Job> {
  await startBackgroundWork();
  const config = getConfig();
  const url = await assertPublicHttpUrl(input.url, async (hostname) => {
    const records = await lookup(hostname, { all: true, verbatim: true });
    return records.map((record) => ({ address: record.address, family: record.family }));
  });
  return lock(async () => {
    await load(config);
    const rt = runtime();
    const active = rt.jobs.filter((job) => job.status === "queued" || job.status === "running").length;
    if (active >= config.maxQueued) {
      throw new JobError("Too many downloads are already waiting. Let one finish, then try again.");
    }
    const used = await directorySize(config.downloadsDir);
    if (used >= config.maxDiskBytes) {
      throw new JobError("Storage is full. Delete a finished download or wait for automatic cleanup.");
    }
    const now = new Date();
    const job: Job = {
      id: randomUUID(),
      url: url.href,
      pageHost: url.hostname,
      mode: input.mode,
      playlist: input.playlist,
      status: "queued",
      progress: null,
      label: null,
      error: null,
      files: [],
      createdAt: now.toISOString(),
      finishedAt: null,
      expiresAt: new Date(now.getTime() + config.deleteAfterMinutes * 60_000).toISOString(),
    };
    rt.jobs.push(job);
    await persist(config);
    void pump();
    return job;
  });
}

export async function deleteJob(id: string): Promise<boolean> {
  await startBackgroundWork();
  const config = getConfig();
  return lock(async () => {
    await load(config);
    const rt = runtime();
    const job = rt.jobs.find((entry) => entry.id === id);
    if (!job) {
      return false;
    }
    if (job.status === "running") {
      throw new JobError("That download is still running.");
    }
    rt.jobs = rt.jobs.filter((entry) => entry.id !== id);
    await rm(jobDir(config, id), { recursive: true, force: true });
    await persist(config);
    return true;
  });
}

async function pump(): Promise<void> {
  const config = getConfig();
  const rt = runtime();
  if (rt.pumping) {
    return;
  }
  rt.pumping = true;
  try {
    await lock(async () => {
      await load(config);
      while (rt.running < config.maxConcurrent) {
        const next = rt.jobs.find((job) => job.status === "queued");
        if (!next) {
          return;
        }
        next.status = "running";
        next.progress = 0;
        rt.running += 1;
        await persist(config);
        const jobId = next.id;
        void finishJob(jobId);
      }
    });
  } finally {
    rt.pumping = false;
  }
}

async function finishJob(jobId: string): Promise<void> {
  const config = getConfig();
  const snapshot = runtime().jobs.find((job) => job.id === jobId);
  if (!snapshot) {
    return;
  }
  const dir = jobDir(config, snapshot.id);
  let error: string | null = null;
  let files: JobFile[] = [];
  let label: string | null = snapshot.label;
  try {
    await mkdir(dir, { recursive: true });
    let lastWrite = 0;
    const args = buildYtDlpArgs({
      url: snapshot.url,
      mode: snapshot.mode,
      outputDir: dir,
      maxFileBytes: config.maxFileBytes,
      maxDurationSeconds: config.maxDurationSeconds,
      playlist: snapshot.playlist,
      maxPlaylistItems: config.maxPlaylistItems,
      ffmpegPath: config.ffmpegPath,
      cookiesPath: resolvedCookiesPath(config),
      proxyUrl: config.proxyUrl,
    });
    const result = await runProcess(
      config.ytDlpPath,
      args,
      config.jobTimeoutSeconds * 1000,
      (line) => {
        const progress = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
        const destination = line.match(/Destination:\s+(.+)$/);
        if (destination) {
          label = path.basename(destination[1].replaceAll('"', ""));
        }
        if (!progress && !destination) {
          return;
        }
        const percent = progress ? Math.max(0, Math.min(100, Number(progress[1]))) : null;
        const now = Date.now();
        if (now - lastWrite < 1500 && percent !== 100) {
          const current = runtime().jobs.find((job) => job.id === jobId);
          if (current && percent !== null) {
            current.progress = percent;
          }
          if (current && label) {
            current.label = label;
          }
          return;
        }
        lastWrite = now;
        void lock(async () => {
          const current = runtime().jobs.find((job) => job.id === jobId);
          if (!current || current.status !== "running") {
            return;
          }
          if (percent !== null) {
            current.progress = percent;
          }
          if (label) {
            current.label = label;
          }
          await persist(config);
        });
      },
      childEnv(),
    );
    if (result.code !== 0) {
      error = friendlyYtDlpError(result.output);
    } else {
      files = await collectMedia(dir);
      if (files.length === 0) {
        error = "No media file was saved. The link may be unsupported, blocked, or over the duration cap.";
      }
      for (const file of files) {
        if (file.bytes > config.maxFileBytes) {
          error = "The file is larger than the allowed size.";
          break;
        }
        const duration = await probeDuration(config.ffprobePath, path.join(dir, file.name));
        if (duration !== null && duration > config.maxDurationSeconds + 2) {
          error = "The media is longer than the allowed duration.";
          break;
        }
      }
      if (!error) {
        const used = await directorySize(config.downloadsDir);
        if (used > config.maxDiskBytes) {
          error = "Storage filled up during the download. The file was removed.";
        }
      }
    }
  } catch (caught) {
    error = caught instanceof Error ? friendlyYtDlpError(caught.message) : "The download failed.";
  }

  if (error) {
    await rm(dir, { recursive: true, force: true });
    files = [];
  }

  await lock(async () => {
    const rt = runtime();
    const current = rt.jobs.find((job) => job.id === jobId);
    rt.running = Math.max(0, rt.running - 1);
    if (current) {
      const finished = new Date();
      current.status = error ? "failed" : "completed";
      current.error = error;
      current.files = files;
      current.label = label;
      current.progress = error ? null : 100;
      current.finishedAt = finished.toISOString();
      current.expiresAt = new Date(finished.getTime() + config.deleteAfterMinutes * 60_000).toISOString();
    }
    await persist(config);
  });
  await pump();
}

async function collectMedia(dir: string): Promise<JobFile[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: JobFile[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !isDownloadableFileName(entry.name)) {
      continue;
    }
    const info = await stat(path.join(dir, entry.name));
    if (info.size > 0) {
      files.push({ name: entry.name, bytes: info.size });
    }
  }
  return files.sort((a, b) => a.name.localeCompare(b.name));
}

async function probeDuration(ffprobe: string, file: string): Promise<number | null> {
  const result = await runProcess(
    ffprobe,
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file],
    20_000,
    () => undefined,
    childEnv(),
  );
  if (result.code !== 0) {
    return null;
  }
  const match = result.output.match(/(\d+(?:\.\d+)?)/g);
  if (!match) {
    return null;
  }
  const value = Number(match.at(-1));
  return Number.isFinite(value) ? value : null;
}

export async function openJobFile(
  id: string,
  name: string,
): Promise<{ filePath: string; contentType: string; disposition: string; size: number } | null> {
  if (!isDownloadableFileName(name)) {
    return null;
  }
  const config = getConfig();
  const job = await getJob(id);
  if (!job || job.status !== "completed" || !job.files.some((file) => file.name === name)) {
    return null;
  }
  const root = path.resolve(jobDir(config, id));
  const filePath = path.resolve(root, name);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    return null;
  }
  try {
    const info = await stat(filePath);
    if (!info.isFile()) {
      return null;
    }
    return {
      filePath,
      contentType: contentTypeFor(name),
      disposition: contentDisposition(name),
      size: info.size,
    };
  } catch {
    return null;
  }
}

/** Delete a media file after the browser has received it. Leftovers are not kept. */
export async function releaseDownloadedFile(id: string, name: string): Promise<void> {
  if (!isJobId(id) || !isDownloadableFileName(name)) {
    return;
  }
  const config = getConfig();
  await lock(async () => {
    await load(config);
    const rt = runtime();
    const root = path.resolve(jobDir(config, id));
    const filePath = path.resolve(root, name);
    if (!filePath.startsWith(`${root}${path.sep}`)) {
      return;
    }
    await rm(filePath, { force: true });
    const job = rt.jobs.find((entry) => entry.id === id);
    if (!job) {
      await persist(config);
      return;
    }
    job.files = job.files.filter((file) => file.name !== name);
    if (job.files.length === 0) {
      rt.jobs = rt.jobs.filter((entry) => entry.id !== id);
      await rm(root, { recursive: true, force: true });
    }
    await persist(config);
  });
}

export { UrlPolicyError };
