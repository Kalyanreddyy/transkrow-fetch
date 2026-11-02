import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { openJobFile, releaseDownloadedFile } from "@/lib/jobs";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await requireUser();
  if (denied) {
    return denied;
  }
  const { id } = await context.params;
  const name = new URL(request.url).searchParams.get("name") ?? "";
  const opened = await openJobFile(id, name);
  if (!opened) {
    return NextResponse.json({ error: "That file is not available." }, { status: 404 });
  }
  const stream = createReadStream(opened.filePath);
  let received = false;
  stream.on("end", () => {
    received = true;
  });
  stream.on("close", () => {
    if (received) {
      void releaseDownloadedFile(id, name);
    }
  });
  return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Content-Type": opened.contentType,
      "Content-Length": String(opened.size),
      "Content-Disposition": opened.disposition,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
