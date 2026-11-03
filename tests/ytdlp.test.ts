import assert from "node:assert/strict";
import test from "node:test";
import {
  buildYtDlpArgs,
  contentDisposition,
  friendlyYtDlpError,
  isDownloadableFileName,
  sanitizeYtDlpExcerpt,
} from "../src/lib/ytdlp";

const hostile = "https://example.com/watch?v=1;rm -rf /tmp/pwned&x=$(id)";

test("passes the URL as one argument and never through a shell", () => {
  const args = buildYtDlpArgs({
    url: hostile,
    mode: "audio",
    outputDir: "/data/downloads/job",
    maxFileBytes: 500,
    maxDurationSeconds: 180,
    playlist: false,
    maxPlaylistItems: 5,
    ffmpegPath: "/usr/bin/ffmpeg",
    cookiesPath: "/data/cookies.txt",
    proxyUrl: "http://proxy.example:8080",
    cacheDir: "/data/yt-dlp-cache",
    pluginDir: "/opt/yt-dlp-plugins",
  });
  assert.equal(args.includes("--cache-dir"), true);
  assert.equal(args.includes("/data/yt-dlp-cache"), true);
  assert.equal(args.includes("--remote-components"), true);
  assert.equal(args.includes("ejs:github"), true);
  assert.equal(args.includes("--no-warnings"), false);
  assert.equal(args.includes("--plugin-dirs"), true);
  assert.equal(args.includes("/opt/yt-dlp-plugins"), true);
  assert.equal(args.includes("youtube:player_client=default,mweb;fetch_pot=always"), true);
  assert.equal(args.includes("--cookies"), true);
  assert.equal(args.at(-1), hostile);
  assert.equal(args.at(-2), "--");
  assert.equal(args.includes("!is_live & duration <=? 180"), true);
  assert.equal(args.includes("--no-playlist"), true);
  assert.equal(args.includes("--cookies"), true);
  assert.equal(args.includes("/data/cookies.txt"), true);
  assert.equal(args.includes("--proxy"), true);
  assert.equal(args.includes("http://proxy.example:8080"), true);
  assert.equal(args.some((arg) => arg.includes("&&") || arg.includes("| sh")), false);
  const joined = args.join("\0");
  assert.equal(joined.includes("rm -rf"), true);
  assert.equal(args.filter((arg) => arg === hostile).length, 1);
});

test("caps playlists and selects mp4 for video", () => {
  const args = buildYtDlpArgs({
    url: "https://www.youtube.com/playlist?list=abc",
    mode: "video",
    outputDir: "/data/downloads/job",
    maxFileBytes: 1000,
    maxDurationSeconds: 60,
    playlist: true,
    maxPlaylistItems: 5,
    ffmpegPath: "ffmpeg",
  });
  assert.equal(args.includes("--yes-playlist"), true);
  assert.equal(args.includes("--playlist-end"), true);
  assert.equal(args[args.indexOf("--playlist-end") + 1], "5");
  assert.equal(args.includes("--merge-output-format"), true);
  assert.equal(args.includes("mp4"), true);
  assert.equal(args.includes("--ffmpeg-location"), false);
  assert.equal(args.includes("--plugin-dirs"), false);
  assert.equal(args.includes("--cookies"), false);
  assert.equal(args.includes("youtube:player_client=default,mweb;fetch_pot=always"), true);
});

test("explains common yt-dlp failures without leaking paths", () => {
  assert.match(friendlyYtDlpError("ERROR: File is larger than max-filesize"), /larger than the allowed size/);
  assert.match(friendlyYtDlpError("Sign in to confirm you’re not a bot"), /cookies file or a residential proxy/);
  assert.match(
    friendlyYtDlpError("WARNING: [youtube] The provided YouTube account cookies are no longer valid. They have likely been rotated in the browser"),
    /no longer valid/,
  );
  assert.match(friendlyYtDlpError("ERROR: [youtube] abc: No video formats found!"), /no usable formats/);
  assert.match(friendlyYtDlpError("ERROR: /data/secret/cookies.txt: nope"), /\[path\]/);
  assert.equal(friendlyYtDlpError("ERROR: /data/secret/cookies.txt: nope").includes("/data/secret"), false);
  const excerpt = sanitizeYtDlpExcerpt("WARNING: rotated\n.youtube.com\tTRUE\t/\tTRUE\t1\tSID\tSECRET\nERROR: blocked");
  assert.match(excerpt, /rotated/);
  assert.match(excerpt, /blocked/);
  assert.equal(excerpt.includes("SECRET"), false);
});

test("accepts media filenames and rejects path traversal", () => {
  assert.equal(isDownloadableFileName("Interview-abc.mp3"), true);
  assert.equal(isDownloadableFileName("../etc/passwd"), false);
  assert.equal(isDownloadableFileName("..mp3"), false);
  assert.equal(isDownloadableFileName(".hidden.mp3"), false);
  assert.equal(isDownloadableFileName("notes.txt"), false);
  assert.match(contentDisposition("Talk (final).mp3"), /attachment;/);
});
