import { NextResponse } from "next/server";
import { COOKIE_NAME, passwordsMatch, sessionCookieOptions, signSession } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { clientIp, isSameOrigin, publicOrigin, wantsJson } from "@/lib/http";
import { RateLimiter } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function loginLimiter(): RateLimiter {
  const holder = globalThis as typeof globalThis & { __transkrowLoginLimit?: RateLimiter };
  if (!holder.__transkrowLoginLimit) {
    const config = getConfig();
    holder.__transkrowLoginLimit = new RateLimiter(config.loginRateLimit, config.loginWindowSeconds * 1000);
  }
  return holder.__transkrowLoginLimit;
}

async function readPassword(request: Request): Promise<string> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const body = (await request.json()) as { password?: unknown };
    return typeof body.password === "string" ? body.password : "";
  }
  const form = await request.formData();
  const value = form.get("password");
  return typeof value === "string" ? value : "";
}

export async function POST(request: Request) {
  const origin = publicOrigin(request);
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-site sign-in was blocked." }, { status: 403 });
  }
  const config = getConfig();
  if (!loginLimiter().allow(`login:${clientIp(request.headers)}`)) {
    if (wantsJson(request)) {
      return NextResponse.json({ error: "Too many sign-in attempts. Wait a few minutes." }, { status: 429 });
    }
    return NextResponse.redirect(new URL("/login?error=rate", origin), 303);
  }

  let password = "";
  try {
    password = await readPassword(request);
  } catch {
    password = "";
  }

  if (!passwordsMatch(password, config.authPassword)) {
    if (wantsJson(request)) {
      return NextResponse.json({ error: "That password is not right." }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login?error=credentials", origin), 303);
  }

  const secure = config.cookieSecure || origin.startsWith("https://");
  const token = signSession(config.authSecret, Date.now() + config.sessionTtlSeconds * 1000);
  if (wantsJson(request)) {
    const response = NextResponse.json({ ok: true });
    response.cookies.set(COOKIE_NAME, token, sessionCookieOptions(secure, config.sessionTtlSeconds));
    return response;
  }
  const response = NextResponse.redirect(new URL("/", origin), 303);
  response.cookies.set(COOKIE_NAME, token, sessionCookieOptions(secure, config.sessionTtlSeconds));
  return response;
}
