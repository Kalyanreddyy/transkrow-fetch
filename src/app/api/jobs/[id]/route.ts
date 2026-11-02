import { NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/http";
import { deleteJob, getJob, JobError } from "@/lib/jobs";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const denied = await requireUser();
  if (denied) {
    return denied;
  }
  const { id } = await context.params;
  const job = await getJob(id);
  if (!job) {
    return NextResponse.json({ error: "That download was not found." }, { status: 404 });
  }
  return NextResponse.json({ job });
}

export async function DELETE(request: Request, context: Context) {
  const denied = await requireUser();
  if (denied) {
    return denied;
  }
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-site requests are blocked." }, { status: 403 });
  }
  const { id } = await context.params;
  try {
    const removed = await deleteJob(id);
    if (!removed) {
      return NextResponse.json({ error: "That download was not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof JobError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
