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

export async function writeNetscapeCookiesFile(directory: string, raw: string): Promise<string> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const destination = path.join(directory, "cookies.txt");
  const handle = await open(destination, "w", 0o600);
  try {
    await handle.writeFile(normalizeNetscapeCookies(raw), "utf8");
  } finally {
    await handle.close();
  }
  await chmod(destination, 0o600);
  return destination;
}
