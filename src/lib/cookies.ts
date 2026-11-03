import { chmod, mkdir, open } from "node:fs/promises";
import path from "node:path";

const NETSCAPE_HEADER = "# Netscape HTTP Cookie File";
const HEADER_LINE = /^#(?: Netscape)? HTTP Cookie File\b/;

/**
 * Turn a pasted Netscape cookies export into a file yt-dlp will load on Linux.
 * CRLF and wrapped value lines are common when the text is copied from Windows
 * or a dashboard field. The header must be the first line or the loader rejects
 * the whole file.
 */
export function normalizeNetscapeCookies(raw: string): string {
  const text = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const merged: string[] = [];
  for (const line of text.split("\n")) {
    const previous = merged.at(-1);
    if (
      previous !== undefined &&
      previous.trim() !== "" &&
      !previous.startsWith("#") &&
      line.trim() !== "" &&
      !line.startsWith("#") &&
      !line.includes("\t")
    ) {
      merged[merged.length - 1] = previous + line.trim();
      continue;
    }
    merged.push(line);
  }
  while (merged[0] === "") {
    merged.shift();
  }
  const first = merged[0] ?? "";
  if (!HEADER_LINE.test(first)) {
    merged.unshift(NETSCAPE_HEADER);
  }
  const body = merged.join("\n").replace(/\n+$/, "");
  return `${body}\n`;
}

export type CookieFileReport = {
  rowCount: number;
  hasTabs: boolean;
  looksSpaced: boolean;
  hasSessionCookie: boolean;
};

/**
 * Inspect a normalized Netscape file without logging values. Render's env UI
 * sometimes turns tabs into spaces; yt-dlp then skips every row.
 */
export function inspectNetscapeCookies(normalized: string): CookieFileReport {
  const rows = normalized
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line && !line.startsWith("#"));
  let hasTabs = false;
  let looksSpaced = false;
  let hasSessionCookie = false;
  for (const row of rows) {
    if (row.includes("\t")) {
      hasTabs = true;
      const parts = row.split("\t");
      const name = parts[5] ?? "";
      if (
        name === "SID" ||
        name === "LOGIN_INFO" ||
        name === "__Secure-3PSID" ||
        name === "__Secure-1PSID" ||
        name === "SAPISID"
      ) {
        hasSessionCookie = true;
      }
    } else if (/\s{2,}/.test(row) && row.includes(".youtube.com")) {
      looksSpaced = true;
    }
  }
  return { rowCount: rows.length, hasTabs, looksSpaced, hasSessionCookie };
}

export async function writeNetscapeCookiesFile(directory: string, raw: string): Promise<string> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const destination = path.join(directory, "cookies.txt");
  const normalized = normalizeNetscapeCookies(raw);
  const report = inspectNetscapeCookies(normalized);
  if (report.looksSpaced && !report.hasTabs) {
    console.error(
      "COOKIES_CONTENT looks like spaces replaced the Netscape tabs; yt-dlp will ignore the rows. Paste the file again with real tab separators.",
    );
  } else if (report.rowCount > 0 && !report.hasSessionCookie) {
    console.error(
      "COOKIES_CONTENT has Netscape rows but no YouTube session cookie names (SID / LOGIN_INFO / __Secure-*PSID). Export while signed in.",
    );
  } else {
    console.error(
      `COOKIES_CONTENT written (${report.rowCount} rows, sessionCookie=${report.hasSessionCookie ? "yes" : "no"}).`,
    );
  }
  const handle = await open(destination, "w", 0o600);
  try {
    await handle.writeFile(normalized, "utf8");
  } finally {
    await handle.close();
  }
  await chmod(destination, 0o600);
  return destination;
}
