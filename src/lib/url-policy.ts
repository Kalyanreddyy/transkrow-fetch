import { BlockList, isIP } from "node:net";

export class UrlPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UrlPolicyError";
  }
}

export type ResolvedAddress = { address: string; family: number };
export type LookupFn = (hostname: string) => Promise<ResolvedAddress[]>;

const block = new BlockList();
block.addSubnet("0.0.0.0", 8, "ipv4");
block.addSubnet("10.0.0.0", 8, "ipv4");
block.addSubnet("100.64.0.0", 10, "ipv4");
block.addSubnet("127.0.0.0", 8, "ipv4");
block.addSubnet("169.254.0.0", 16, "ipv4");
block.addSubnet("172.16.0.0", 12, "ipv4");
block.addSubnet("192.0.0.0", 24, "ipv4");
block.addSubnet("192.0.2.0", 24, "ipv4");
block.addSubnet("192.168.0.0", 16, "ipv4");
block.addSubnet("198.18.0.0", 15, "ipv4");
block.addSubnet("198.51.100.0", 24, "ipv4");
block.addSubnet("203.0.113.0", 24, "ipv4");
block.addSubnet("224.0.0.0", 4, "ipv4");
block.addSubnet("240.0.0.0", 4, "ipv4");
block.addAddress("255.255.255.255", "ipv4");
block.addAddress("::", "ipv6");
block.addAddress("::1", "ipv6");
block.addSubnet("fc00::", 7, "ipv6");
block.addSubnet("fe80::", 10, "ipv6");
block.addSubnet("ff00::", 8, "ipv6");
block.addSubnet("2001:db8::", 32, "ipv6");

const BLOCKED_NAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata",
  "metadata.google",
  "metadata.google.internal",
  "metadata.google.com",
]);

export function isBlockedIp(address: string): boolean {
  let normalized = address.trim().toLowerCase().replace(/^\[|\]$/g, "");
  const mapped = normalized.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) {
    normalized = mapped[1];
  }
  const family = isIP(normalized);
  if (family !== 4 && family !== 6) {
    return true;
  }
  try {
    return block.check(normalized, family === 4 ? "ipv4" : "ipv6");
  } catch {
    return true;
  }
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!host || BLOCKED_NAMES.has(host)) {
    return true;
  }
  return (
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".localdomain") ||
    host.endsWith(".internal") ||
    host.endsWith(".home.arpa")
  );
}

/**
 * Accept only public http(s) URLs. Hostnames are resolved and rejected when
 * any address is loopback, private, link-local, or otherwise non-routable.
 * yt-dlp may still follow a later redirect; that residual risk is documented
 * in SYSTEM_DESIGN.md.
 */
export async function assertPublicHttpUrl(input: string, lookup: LookupFn): Promise<URL> {
  if (typeof input !== "string") {
    throw new UrlPolicyError("Enter a link.");
  }
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 2048) {
    throw new UrlPolicyError("That link is empty or too long.");
  }
  if (/[\u0000-\u001f\u007f\s]/.test(trimmed)) {
    throw new UrlPolicyError("That link contains invalid characters.");
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new UrlPolicyError("That link is not a valid URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UrlPolicyError("Only http and https links are allowed.");
  }
  if (url.username || url.password) {
    throw new UrlPolicyError("Links with a username or password are not allowed.");
  }

  const hostname = url.hostname;
  if (isBlockedHostname(hostname)) {
    throw new UrlPolicyError("That address is not allowed.");
  }

  if (isIP(hostname)) {
    if (isBlockedIp(hostname)) {
      throw new UrlPolicyError("That address is not allowed.");
    }
    return url;
  }

  let records: ResolvedAddress[];
  try {
    records = await lookup(hostname);
  } catch {
    throw new UrlPolicyError("That host could not be resolved.");
  }
  if (records.length === 0) {
    throw new UrlPolicyError("That host could not be resolved.");
  }
  for (const record of records) {
    if (isBlockedIp(record.address)) {
      throw new UrlPolicyError("That address is not allowed.");
    }
  }
  return url;
}
