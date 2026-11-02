import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE_NAME, verifySession } from "./auth";
import { getConfig } from "./config";

export async function requireUser(): Promise<NextResponse | null> {
  const config = getConfig();
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value ?? "";
  if (!verifySession(config.authSecret, token)) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  return null;
}

export async function hasSession(): Promise<boolean> {
  const config = getConfig();
  const jar = await cookies();
  return verifySession(config.authSecret, jar.get(COOKIE_NAME)?.value ?? "");
}
