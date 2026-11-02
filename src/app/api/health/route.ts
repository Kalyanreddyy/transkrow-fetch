import { execFile } from "node:child_process";
import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Probe = { at: number; ytDlp: string | null; ffmpeg: string | null };

function probe(bin: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout: 8000, shell: false, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        resolve(null);
        return;
      }
      const line = `${stdout ?? ""}\n${stderr ?? ""}`
        .split(/\r?\n/)
        .map((entry) => entry.trim())
        .find(Boolean);
      resolve(line ?? null);
    });
  });
}

export async function GET() {
  const holder = globalThis as typeof globalThis & { __transkrowHealth?: Probe };
  const now = Date.now();
  if (!holder.__transkrowHealth || now - holder.__transkrowHealth.at > 5 * 60_000) {
    const config = getConfig();
    const [ytDlp, ffmpeg] = await Promise.all([
      probe(config.ytDlpPath, ["--version"]),
      probe(config.ffmpegPath, ["-version"]),
    ]);
    holder.__transkrowHealth = { at: now, ytDlp, ffmpeg };
  }
  const status = holder.__transkrowHealth;
  const ready = Boolean(status.ytDlp && status.ffmpeg);
  return NextResponse.json({
    ok: true,
    ready,
    ytDlp: status.ytDlp,
    ffmpeg: status.ffmpeg,
  });
}
