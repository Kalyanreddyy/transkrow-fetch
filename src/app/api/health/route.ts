import { NextResponse } from "next/server";
import { probeBinary } from "@/lib/bin-probe";
import { getConfig } from "@/lib/config";
import { engineReady, probePotProvider } from "@/lib/pot";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Probe = { at: number; ytDlp: string | null; ffmpeg: string | null };

export async function GET() {
  const config = getConfig();
  const holder = globalThis as typeof globalThis & { __transkrowHealth?: Probe };
  const now = Date.now();
  if (!holder.__transkrowHealth || now - holder.__transkrowHealth.at > 5 * 60_000) {
    const [ytDlp, ffmpeg] = await Promise.all([
      probeBinary(config.ytDlpPath, ["--ignore-config", "--version"]),
      probeBinary(config.ffmpegPath, ["-version"]),
    ]);
    holder.__transkrowHealth = { at: now, ytDlp, ffmpeg };
  }
  const status = holder.__transkrowHealth;
  const pot = await probePotProvider(config.potProviderUrl);
  return NextResponse.json({
    ok: true,
    ready: engineReady(status.ytDlp, status.ffmpeg, pot),
    ytDlp: status.ytDlp,
    ffmpeg: status.ffmpeg,
    pot,
  });
}
