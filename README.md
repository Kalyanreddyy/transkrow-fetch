# Transkrow Fetch

Private downloader for Transkrow's transcription desk. Paste a public video link, save audio (MP3) or video (MP4), and the server deletes the file as soon as it has streamed to your computer. It is one Docker web service aimed at Render's free plan ($0).

The download engine is [yt-dlp](https://github.com/yt-dlp/yt-dlp) plus FFmpeg, the same pair [VidBee](https://github.com/nexmoe/VidBee) uses. VidBee is MIT-licensed (Copyright (c) 2025 VidBee). This repository does not copy the VidBee monorepo. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md).

## Run locally

You need Node.js 22, ffmpeg, and yt-dlp on your PATH.

```bash
cp .env.example .env.local
```

Edit `.env.local` and set `AUTH_PASSWORD` (12+ characters) and `AUTH_SECRET` (16+ characters).

```bash
npm install
npm test
npm run dev
```

Open http://127.0.0.1:43123 and sign in with `AUTH_PASSWORD`.

## Run the container

```bash
docker build -t transkrow-fetch .
docker run --rm -p 43123:8080 \
  -e AUTH_PASSWORD='replace-with-a-long-password' \
  -e AUTH_SECRET='replace-with-a-long-secret' \
  transkrow-fetch
```

Health check: http://127.0.0.1:43123/api/health

The image stores temporary files in `/tmp/transkrow`. Render deployment steps, including every variable, are in [DEPLOY.md](DEPLOY.md). Hugging Face Spaces and Koyeb are short fallbacks in that same file.

## Tests

```bash
npm test
```

The tests cover URL blocking (including private and metadata addresses), yt-dlp argument construction without a shell, session cookies, rate limits, file-name checks, and automatic deletion.
