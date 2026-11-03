import path from "node:path";

export type DownloadMode = "audio" | "video";

const MEDIA_EXTENSIONS = new Set([
  ".mp3",
  ".mp4",
  ".m4a",
  ".webm",
  ".mkv",
  ".opus",
  ".ogg",
  ".wav",
  ".flac",
]);

export type YtDlpArgInput = {
  url: string;
  mode: DownloadMode;
  outputDir: string;
  maxFileBytes: number;
  maxDurationSeconds: number;
  playlist: boolean;
  maxPlaylistItems: number;
  ffmpegPath: string;
  cookiesPath?: string | null;
  proxyUrl?: string | null;
  jsRuntime?: string;
  /** Writable cache for EJS / youtube-sigfuncs. Prefer DATA_DIR/yt-dlp-cache. */
  cacheDir?: string | null;
  /** When true, allow downloading EJS solver scripts from GitHub (pip installs). */
  remoteEjs?: boolean;
};

/**
 * Build a yt-dlp argument list. The URL is a single argv element after `--`
 * and is never interpolated into a shell command.
 */
export function buildYtDlpArgs(input: YtDlpArgInput): string[] {
  const template = input.playlist
    ? "%(playlist_index)03d-%(title).60B-%(id)s.%(ext)s"
    : "%(title).80B-%(id)s.%(ext)s";
  const duration = Math.max(1, Math.floor(input.maxDurationSeconds));
  // Keep warnings: yt-dlp reports rotated YouTube cookies as WARNING, and
  // --no-warnings hid that from friendlyYtDlpError. EJS is bundled in the
  // official linux binary; --remote-components is a fallback for other installs.
  const args = [
    "--ignore-config",
    "--newline",
    "--restrict-filenames",
    "--no-mtime",
    "--no-playlist-reverse",
    "--retries",
    "3",
    "--fragment-retries",
    "3",
    "--extractor-retries",
    "2",
    "--socket-timeout",
    "30",
    "--max-filesize",
    String(Math.floor(input.maxFileBytes)),
    "--match-filter",
    `!is_live & duration <=? ${duration}`,
    "--js-runtimes",
    input.jsRuntime ?? `node:${process.execPath}`,
    "--paths",
    input.outputDir,
    "-o",
    template,
  ];
  if (input.cacheDir) {
    args.push("--cache-dir", input.cacheDir);
  } else {
    args.push("--no-cache-dir");
  }
  if (input.remoteEjs !== false) {
    args.push("--remote-components", "ejs:github");
  }

  const ffmpegLocation = ffmpegLocationArg(input.ffmpegPath);
  if (ffmpegLocation) {
    args.push("--ffmpeg-location", ffmpegLocation);
  }
  if (input.playlist) {
    const limit = String(Math.max(1, Math.floor(input.maxPlaylistItems)));
    args.push("--yes-playlist", "--playlist-end", limit, "--max-downloads", limit);
  } else {
    args.push("--no-playlist");
  }
  if (input.cookiesPath) {
    args.push("--cookies", input.cookiesPath);
  }
  if (input.proxyUrl) {
    args.push("--proxy", input.proxyUrl);
  }
  if (input.mode === "audio") {
    args.push("-f", "ba/b", "-x", "--audio-format", "mp3", "--audio-quality", "5", "--embed-metadata");
  } else {
    args.push(
      "-f",
      "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b",
      "--merge-output-format",
      "mp4",
    );
  }
  args.push("--", input.url);
  return args;
}

export function ffmpegLocationArg(ffmpegPath: string): string | null {
  if (!ffmpegPath.includes("/") && !ffmpegPath.includes("\\")) {
    return null;
  }
  return path.dirname(ffmpegPath);
}

export function isDownloadableFileName(name: string): boolean {
  if (typeof name !== "string" || name.length < 3 || name.length > 200) {
    return false;
  }
  if (name !== path.basename(name) || name.startsWith(".") || name.includes("..")) {
    return false;
  }
  if (/[\u0000-\u001f\u007f]/.test(name)) {
    return false;
  }
  return MEDIA_EXTENSIONS.has(path.extname(name).toLowerCase());
}

export function contentTypeFor(name: string): string {
  switch (path.extname(name).toLowerCase()) {
    case ".mp3":
      return "audio/mpeg";
    case ".m4a":
      return "audio/mp4";
    case ".mp4":
      return "video/mp4";
    case ".webm":
      return "video/webm";
    case ".mkv":
      return "video/x-matroska";
    case ".opus":
      return "audio/opus";
    case ".ogg":
      return "audio/ogg";
    case ".wav":
      return "audio/wav";
    case ".flac":
      return "audio/flac";
    default:
      return "application/octet-stream";
  }
}

export function contentDisposition(name: string): string {
  const ascii = name.replace(/[^\w.\-]+/g, "_").replace(/^_+/, "") || "download";
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** Drop cookie rows and other secrets before showing yt-dlp text in the API. */
export function sanitizeYtDlpExcerpt(raw: string, maxChars = 700): string {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      if (line.includes("\t")) return false;
      if (line.includes("COOKIES_CONTENT")) return false;
      if (/^[A-Za-z0-9_-]{40,}$/.test(line)) return false;
      return true;
    })
    .map((line) => line.replace(/(?:\/|[A-Za-z]:\\)[\w./\\-]{3,}/g, "[path]"));
  const kept = lines.filter((line) => !line.startsWith("[debug]")).slice(-8);
  return kept.join("\n").slice(0, maxChars);
}

export function friendlyYtDlpError(raw: string): string {
  const lower = raw.toLowerCase();
  if (
    lower.includes("max-filesize") ||
    lower.includes("file is larger than max-filesize") ||
    lower.includes("larger than max")
  ) {
    return "The file is larger than the allowed size.";
  }
  if (
    lower.includes("does not pass filter") ||
    lower.includes("is_live") ||
    lower.includes("live event") ||
    lower.includes("this live event")
  ) {
    return "That video was skipped. Live streams, and anything longer than the duration cap, are not downloaded.";
  }
  if (
    lower.includes("no longer valid") ||
    lower.includes("rotated in the browser") ||
    lower.includes("exporting-youtube-cookies")
  ) {
    return "The YouTube cookies in COOKIES_CONTENT are no longer valid (YouTube rotated them). Re-export from a fresh incognito session on youtube.com/robots.txt, then close that window before pasting. See DEPLOY.md.";
  }
  if (lower.includes("no video formats found") || lower.includes("requested format is not available")) {
    return "YouTube returned no usable formats from this server. Fresh cookies or a residential proxy are usually required on a datacenter host. See DEPLOY.md.";
  }
  if (
    lower.includes("sign in to confirm") ||
    lower.includes("not a bot") ||
    lower.includes("http error 429") ||
    lower.includes("too many requests") ||
    lower.includes("unable to extract")
  ) {
    return "The site blocked this server. A cookies file or a residential proxy usually fixes YouTube on a hosting provider. See DEPLOY.md.";
  }
  if (
    lower.includes("private video") ||
    lower.includes("video unavailable") ||
    lower.includes("login required") ||
    lower.includes("members-only")
  ) {
    return "That video is private, removed, or needs a login.";
  }
  if (lower.includes("unsupported url") || lower.includes("unsupported url scheme")) {
    return "That site is not supported.";
  }
  const line =
    raw
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .filter((entry) => entry && !entry.startsWith("[debug]") && !entry.startsWith("WARNING:"))
      .at(-1) ?? "The download failed.";
  return line.replace(/(?:\/|[A-Za-z]:\\)[\w./\\-]{3,}/g, "[path]").slice(0, 400);
}
