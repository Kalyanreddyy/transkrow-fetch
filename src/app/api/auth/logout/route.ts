import { NextResponse } from "next/server";
import { COOKIE_NAME, sessionCookieOptions } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { isSameOrigin, publicOrigin } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-site sign-out was blocked." }, { status: 403 });
  }
  const config = getConfig();
  const origin = publicOrigin(request);
  const secure = config.cookieSecure || origin.startsWith("https://");
  const response = NextResponse.redirect(new URL("/login", origin), 303);
  response.cookies.set(COOKIE_NAME, "", sessionCookieOptions(secure, 0));
  return response;
}
