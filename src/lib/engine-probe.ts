import { constants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { probeBinary } from "./bin-probe";

export const ENGINE_PROBE_TIMEOUT_MS = 30_000;
export const ENGINE_PROBE_ATTEMPTS = 3;

export type EngineBinaries = { ytDlp: boolean; ffmpeg: boolean };

type Cache = {
  started: boolean;
  ytDlp: string | null;
  ffmpeg: string | null;
};

const cache: Cache = { started: false, ytDlp: null, ffmpeg: null };

export function resetEngineProbeForTests(): void {
  cache.started = false;
  cache.ytDlp = null;
  cache.ffmpeg = null;
}

export async function binaryIsExecutable(bin: string): Promise<boolean> {
  if (!bin.trim()) {
    return false;
  }
  if (bin.includes("/") || bin.includes("\\")) {
    return canExecute(bin);
  }
  const dirs = (process.env.PATH ?? "").split(path.delimiter);
  for (const dir of dirs) {
    if (!dir) {
      continue;
    }
    if (await canExecute(path.join(dir, bin))) {
      return true;
    }
  }
  return false;
}

async function canExecute(file: string): Promise<boolean> {
  try {
    await access(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** One startup probe. A missing file is not retried; a timeout or crash is. */
export async function probeVersion(
  bin: string,
  args: string[],
  options: { timeoutMs?: number; attempts?: number } = {},
): Promise<string | null> {
  const timeoutMs = options.timeoutMs ?? ENGINE_PROBE_TIMEOUT_MS;
  const attempts = options.attempts ?? ENGINE_PROBE_ATTEMPTS;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const version = await probeBinary(bin, args, timeoutMs);
    if (version) {
      return version;
    }
    if (!(await binaryIsExecutable(bin))) {
      console.error(`probe ${bin} stopped after attempt ${attempt}; the file is not executable`);
      return null;
    }
    if (attempt < attempts) {
      console.error(`probe ${bin} attempt ${attempt} of ${attempts} failed; retrying`);
      await delay(1_000);
    }
  }
  console.error(`probe ${bin} failed after ${attempts} attempts; an executable file is still treated as installed`);
  return null;
}

/**
 * Start the version probe once per process. Health checks must not call yt-dlp
 * again: each call unpacks the PyInstaller binary and can time out on a 512 MB host.
 */
export function ensureEngineProbe(ytDlpPath: string, ffmpegPath: string): void {
  if (cache.started) {
    return;
  }
  cache.started = true;
  void runEngineProbe(ytDlpPath, ffmpegPath);
}

async function runEngineProbe(ytDlpPath: string, ffmpegPath: string): Promise<void> {
  const [ytDlp, ffmpeg] = await Promise.all([
    probeVersion(ytDlpPath, ["--ignore-config", "--version"]),
    probeVersion(ffmpegPath, ["-version"]),
  ]);
  if (ytDlp) {
    cache.ytDlp = ytDlp;
  }
  if (ffmpeg) {
    cache.ffmpeg = ffmpeg;
  }
}

export async function readEngineStatus(ytDlpPath: string, ffmpegPath: string): Promise<{
  ytDlp: string | null;
  ffmpeg: string | null;
  binaries: EngineBinaries;
}> {
  ensureEngineProbe(ytDlpPath, ffmpegPath);
  const [ytDlpPresent, ffmpegPresent] = await Promise.all([
    binaryIsExecutable(ytDlpPath),
    binaryIsExecutable(ffmpegPath),
  ]);
  return {
    ytDlp: cache.ytDlp,
    ffmpeg: cache.ffmpeg,
    binaries: {
      ytDlp: Boolean(cache.ytDlp) || ytDlpPresent,
      ffmpeg: Boolean(cache.ffmpeg) || ffmpegPresent,
    },
  };
}
