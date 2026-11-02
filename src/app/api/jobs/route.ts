import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { clientIp, isSameOrigin, wantsJson } from "@/lib/http";
import { createJob, JobError, listJobs, UrlPolicyError } from "@/lib/jobs";
import { RateLimiter } from "@/lib/rate-limit";
import { requireUser } from "@/lib/session";
import type { DownloadMode } from "@/lib/ytdlp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function jobLimiter(): RateLimiter {
  const holder = globalThis as typeof globalThis & { __transkrowJobLimit?: RateLimiter };
  if (!holder.__transkrowJobLimit) {
    const config = getConfig();
    holder.__transkrowJobLimit = new RateLimiter(config.rateLimitPerMinute, 60_000);
  }
  return holder.__transkrowJobLimit;
}

export async function GET() {
  const denied = await requireUser();
  if (denied) {
    return denied;
  }
  const config = getConfig();
  const jobs = await listJobs();
  return NextResponse.json({
    jobs,
    limits: {
      deleteAfterMinutes: config.deleteAfterMinutes,
      maxDurationMinutes: config.maxDurationSeconds / 60,
      maxFileBytes: config.maxFileBytes,
      maxPlaylistItems: config.maxPlaylistItems,
    },
  });
}

export async function POST(request: Request) {
  const denied = await requireUser();
  if (denied) {
    return denied;
  }
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-site requests are blocked." }, { status: 403 });
  }
  if (!jobLimiter().allow(`jobs:${clientIp(request.headers)}`)) {
    return NextResponse.json({ error: "Too many downloads were requested. Wait a minute." }, { status: 429 });
  }

  let body: { url?: unknown; mode?: unknown; playlist?: unknown };
  try {
    body = wantsJson(request) ? ((await request.json()) as typeof body) : await readForm(request);
  } catch {
    return NextResponse.json({ error: "The request could not be read." }, { status: 400 });
  }

  const mode = body.mode === "video" ? "video" : body.mode === "audio" ? "audio" : null;
  if (!mode || typeof body.url !== "string") {
    return NextResponse.json({ error: "Choose audio or video, and paste a link." }, { status: 400 });
  }

  try {
    const job = await createJob({
      url: body.url,
      mode: mode as DownloadMode,
      playlist: body.playlist === true,
    });
    return NextResponse.json({ job }, { status: 201 });
  } catch (error) {
    if (error instanceof UrlPolicyError || error instanceof JobError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

async function readForm(request: Request): Promise<{ url?: unknown; mode?: unknown; playlist?: unknown }> {
  const form = await request.formData();
  return {
    url: form.get("url"),
    mode: form.get("mode"),
    playlist: form.get("playlist") === "on" || form.get("playlist") === "true",
  };
}
