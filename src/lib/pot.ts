export type PotHealth = {
  enabled: boolean;
  ok: boolean;
  version: string | null;
};

export function potHealthFromPing(
  enabled: boolean,
  status: number | null,
  body: { version?: unknown } | null,
): PotHealth {
  if (!enabled) {
    return { enabled: false, ok: false, version: null };
  }
  const version = typeof body?.version === "string" && body.version ? body.version : null;
  return { enabled: true, ok: status === 200 && version !== null, version };
}

export function engineReady(ytDlp: string | null, ffmpeg: string | null, pot: PotHealth): boolean {
  return Boolean(ytDlp && ffmpeg && (!pot.enabled || pot.ok));
}

export async function probePotProvider(baseUrl: string | null): Promise<PotHealth> {
  if (!baseUrl) {
    return potHealthFromPing(false, null, null);
  }
  try {
    const response = await fetch(new URL("/ping", baseUrl), { signal: AbortSignal.timeout(1500) });
    const body = response.ok ? ((await response.json()) as { version?: unknown }) : null;
    return potHealthFromPing(true, response.status, body);
  } catch {
    return potHealthFromPing(true, null, null);
  }
}
