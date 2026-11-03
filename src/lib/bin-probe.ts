import { execFile, type ExecFileException } from "node:child_process";
import { childEnv } from "./process-runner";

type ProbeError = {
  code?: string | number | null;
  signal?: string | null;
  killed?: boolean;
};

const VERSION_STAMP = /\d{4}\.\d{2}\.\d{2}/;

export function sanitizeProbeText(raw: string): string {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.includes("\t") && !line.includes("COOKIES_CONTENT") && line.length <= 180);
  return lines.slice(0, 3).join(" | ").slice(0, 240);
}

export function probeFailureSummary(error: ProbeError, stdout: string, stderr: string): string {
  const status =
    typeof error.code === "number"
      ? `exit ${error.code}`
      : error.signal
        ? `signal ${error.signal}`
        : error.code
          ? String(error.code)
          : error.killed
            ? "killed"
            : "failed";
  const detail = sanitizeProbeText(`${stderr ?? ""}\n${stdout ?? ""}`);
  return detail ? `${status}: ${detail}` : status;
}

function firstTextLine(stdout: string, stderr: string): string | null {
  const line = `${stdout ?? ""}\n${stderr ?? ""}`
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find(Boolean);
  return line ?? null;
}

/**
 * Run a version probe without inheriting COOKIES_CONTENT. A pasted Netscape
 * file in the environment is large enough to make the PyInstaller yt-dlp
 * binary fail at startup while a small program such as ffmpeg still runs.
 * The failure used to be discarded, so /api/health reported ytDlp: null.
 */
export function probeBinary(bin: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    const finish = (error: ExecFileException | null, stdout = "", stderr = "") => {
      if (!error) {
        resolve(firstTextLine(stdout, stderr));
        return;
      }
      const version = `${stdout}\n${stderr}`
        .split(/\r?\n/)
        .map((entry) => entry.trim())
        .find((entry) => VERSION_STAMP.test(entry) && !entry.includes("\t"));
      const summary = probeFailureSummary(error, version ? "" : stdout, version ? "" : stderr);
      if (version) {
        console.error(`probe ${bin} reported ${version} after a non-zero exit: ${summary}`);
        resolve(version);
        return;
      }
      console.error(`probe ${bin} failed: ${summary}`);
      resolve(null);
    };
    try {
      execFile(
        bin,
        args,
        { timeout: 8000, shell: false, windowsHide: true, env: childEnv() },
        (error, stdout, stderr) => {
          finish(error, stdout ?? "", stderr ?? "");
        },
      );
    } catch (error) {
      finish(error as ExecFileException);
    }
  });
}
