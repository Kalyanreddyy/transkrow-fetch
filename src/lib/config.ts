import path from "node:path";

export type AppConfig = {
  dataDir: string;
  downloadsDir: string;
  authPassword: string;
  authSecret: string;
  sessionTtlSeconds: number;
  deleteAfterMinutes: number;
  maxFileBytes: number;
  maxDurationSeconds: number;
  maxConcurrent: number;
  maxPlaylistItems: number;
  maxQueued: number;
  maxDiskBytes: number;
  jobTimeoutSeconds: number;
  rateLimitPerMinute: number;
  loginRateLimit: number;
  loginWindowSeconds: number;
  ytDlpPath: string;
  ffmpegPath: string;
  ffprobePath: string;
  proxyUrl: string | null;
  cookiesPath: string | null;
  cookiesContent: string | null;
  cookieSecure: boolean;
  nodeEnv: string;
};

const PROXY_PROTOCOLS = new Set(["http:", "https:", "socks5:", "socks5h:"]);

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

function readInt(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  if (!/^\d+$/.test(raw)) {
    throw new ConfigError(`${name} must be a whole number`);
  }
  const value = Number(raw);
  if (value < min || value > max) {
    throw new ConfigError(`${name} must be between ${min} and ${max}`);
  }
  return value;
}

/** Accepts a byte count (`524288000`) or a suffix (`500M`, `1G`). */
export function parseByteSize(raw: string, name: string): number {
  const match = raw.trim().match(/^(\d+)([KMG])?B?$/i);
  if (!match) {
    throw new ConfigError(`${name} must be a size such as 524288000 or 500M`);
  }
  const quantity = Number(match[1]);
  const unit = match[2]?.toUpperCase();
  const multiplier = unit === "K" ? 1024 : unit === "M" ? 1024 ** 2 : unit === "G" ? 1024 ** 3 : 1;
  const value = quantity * multiplier;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ConfigError(`${name} is out of range`);
  }
  return value;
}

function readBytes(env: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name]?.trim();
  const value = raw ? parseByteSize(raw, name) : fallback;
  if (value < min || value > max) {
    throw new ConfigError(`${name} must be between ${min} and ${max} bytes`);
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = env.NODE_ENV?.trim() || "development";
  const production = nodeEnv === "production";
  const authPassword = env.AUTH_PASSWORD ?? "";
  const authSecret = env.AUTH_SECRET ?? "";

  if (production || env.ALLOW_INSECURE_DEV_AUTH !== "1") {
    if (authPassword.trim().length < 12) {
      throw new ConfigError("AUTH_PASSWORD must be at least 12 characters");
    }
    if (authSecret.trim().length < 16) {
      throw new ConfigError("AUTH_SECRET must be at least 16 characters");
    }
  }

  const password = authPassword.trim() || "dev-only-password";
  const secret = authSecret.trim() || "dev-only-secret-change-me";

  let proxyUrl: string | null = null;
  const proxyRaw = env.YTDLP_PROXY?.trim();
  if (proxyRaw) {
    let parsed: URL;
    try {
      parsed = new URL(proxyRaw);
    } catch {
      throw new ConfigError("YTDLP_PROXY is not a valid URL");
    }
    if (!PROXY_PROTOCOLS.has(parsed.protocol)) {
      throw new ConfigError("YTDLP_PROXY must use http, https, or socks5");
    }
    proxyUrl = parsed.href;
  }

  const cookiesPath = env.COOKIES_FILE?.trim() || null;
  if (cookiesPath && !path.isAbsolute(cookiesPath)) {
    throw new ConfigError("COOKIES_FILE must be an absolute path");
  }
  const cookiesContent = env.COOKIES_CONTENT ?? null;
  if (cookiesContent && cookiesContent.length > 200_000) {
    throw new ConfigError("COOKIES_CONTENT is too large");
  }
  if (cookiesContent && cookiesContent.includes("\0")) {
    throw new ConfigError("COOKIES_CONTENT contains invalid characters");
  }

  const dataDir = path.resolve(
    env.DATA_DIR?.trim() || (production ? "/tmp/transkrow" : path.join(process.cwd(), ".data")),
  );

  return {
    dataDir,
    downloadsDir: path.join(dataDir, "downloads"),
    authPassword: password,
    authSecret: secret,
    sessionTtlSeconds: readInt(env, "SESSION_TTL_HOURS", 24 * 7, 1, 24 * 30) * 3600,
    deleteAfterMinutes: readInt(env, "DELETE_AFTER_MINUTES", 15, 5, 60),
    maxFileBytes: readBytes(env, "MAX_FILE_BYTES", 150 * 1024 * 1024, 1_000_000, 5 * 1024 ** 3),
    maxDurationSeconds: readInt(env, "MAX_DURATION_MINUTES", 90, 1, 12 * 60) * 60,
    maxConcurrent: readInt(env, "MAX_CONCURRENT", 1, 1, 2),
    maxPlaylistItems: readInt(env, "MAX_PLAYLIST_ITEMS", 3, 1, 20),
    maxQueued: readInt(env, "MAX_QUEUED", 4, 1, 20),
    maxDiskBytes: readBytes(env, "MAX_DISK_BYTES", 400 * 1024 * 1024, 50 * 1024 ** 2, 50 * 1024 ** 3),
    jobTimeoutSeconds: readInt(env, "JOB_TIMEOUT_MINUTES", 20, 1, 60) * 60,
    rateLimitPerMinute: readInt(env, "RATE_LIMIT_PER_MINUTE", 20, 1, 300),
    loginRateLimit: readInt(env, "LOGIN_RATE_LIMIT", 8, 1, 50),
    loginWindowSeconds: readInt(env, "LOGIN_WINDOW_MINUTES", 15, 1, 120) * 60,
    ytDlpPath: env.YTDLP_PATH?.trim() || "yt-dlp",
    ffmpegPath: env.FFMPEG_PATH?.trim() || "ffmpeg",
    ffprobePath: env.FFPROBE_PATH?.trim() || "ffprobe",
    proxyUrl,
    cookiesPath,
    cookiesContent: cookiesContent && cookiesContent.trim() ? cookiesContent : null,
    cookieSecure: env.COOKIE_SECURE === "1" || Boolean(env.RENDER) || Boolean(env.SPACE_ID),
    nodeEnv,
  };
}

let cached: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (!cached) {
    cached = loadConfig();
  }
  return cached;
}

export function resetConfigForTests(): void {
  cached = null;
}
