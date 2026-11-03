import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { readEngineStatus } from "@/lib/engine-probe";
import { engineReady, probePotProvider } from "@/lib/pot";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const config = getConfig();
  const status = await readEngineStatus(config.ytDlpPath, config.ffmpegPath);
  const pot = await probePotProvider(config.potProviderUrl);
  return NextResponse.json({
    ok: true,
    ready: engineReady(status.binaries, pot),
    ytDlp: status.ytDlp,
    ffmpeg: status.ffmpeg,
    binaries: status.binaries,
    pot,
  });
}
