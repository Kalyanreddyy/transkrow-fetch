export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first.slice(0, 80);
    }
  }
  return headers.get("x-real-ip")?.trim().slice(0, 80) || "local";
}

export function publicOrigin(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host");
  if (!host || /[\r\n\s/]/.test(host)) {
    return new URL(request.url).origin;
  }
  const requestProto = new URL(request.url).protocol.replace(":", "");
  const scheme = forwarded === "http" || forwarded === "https" ? forwarded : requestProto || "http";
  return `${scheme}://${host}`;
}

export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) {
    return true;
  }
  try {
    return new URL(origin).host === new URL(publicOrigin(request)).host;
  } catch {
    return false;
  }
}

export function wantsJson(request: Request): boolean {
  const type = request.headers.get("content-type") ?? "";
  const accept = request.headers.get("accept") ?? "";
  return type.includes("application/json") || accept.includes("application/json");
}
