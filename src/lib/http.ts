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

function secFetchSiteAllows(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site")?.split(",")[0]?.trim().toLowerCase();
  if (!site) {
    return true;
  }
  return site === "same-origin" || site === "none";
}

export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin")?.trim();
  // Referrer-Policy: no-referrer makes browsers send Origin: null on a form POST.
  if (!origin || origin.toLowerCase() === "null") {
    return secFetchSiteAllows(request);
  }
  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }
  const allowed = new Set<string>();
  const add = (h?: string | null) => {
    const v = h?.split(",")[0]?.trim().toLowerCase();
    if (v) allowed.add(v);
  };
  add(request.headers.get("x-forwarded-host"));
  add(request.headers.get("host"));
  add(process.env.RENDER_EXTERNAL_HOSTNAME);
  for (const u of [process.env.PUBLIC_URL, process.env.RENDER_EXTERNAL_URL]) {
    if (u) {
      try { add(new URL(u).host); } catch { /* ignore */ }
    }
  }
  try { add(new URL(publicOrigin(request)).host); } catch { /* ignore */ }
  return allowed.has(originHost);
}

export function wantsJson(request: Request): boolean {
  const type = request.headers.get("content-type") ?? "";
  const accept = request.headers.get("accept") ?? "";
  return type.includes("application/json") || accept.includes("application/json");
}
