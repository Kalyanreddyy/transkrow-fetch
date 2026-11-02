import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const COOKIE_NAME = "transkrow_session";

export function passwordsMatch(input: string, expected: string): boolean {
  const left = createHash("sha256").update(input, "utf8").digest();
  const right = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(left, right);
}

export function signSession(secret: string, expiresAtMs: number): string {
  const payload = `v1.${expiresAtMs}`;
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifySession(secret: string, token: string, now = Date.now()): boolean {
  if (!token || token.length > 512) {
    return false;
  }
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") {
    return false;
  }
  const expiresAt = Number(parts[1]);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) {
    return false;
  }
  const payload = `v1.${parts[1]}`;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const actual = Buffer.from(parts[2]);
  const wanted = Buffer.from(expected);
  if (actual.length !== wanted.length) {
    return false;
  }
  return timingSafeEqual(actual, wanted);
}

export function sessionCookieOptions(secure: boolean, maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
