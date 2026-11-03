# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner
ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    PORT=8080 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/tmp/transkrow \
    YTDLP_PATH=/usr/local/bin/yt-dlp \
    FFMPEG_PATH=/usr/bin/ffmpeg \
    FFPROBE_PATH=/usr/bin/ffprobe

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Official PyInstaller build. It bundles yt-dlp-ejs. Node from this image is
# passed as --js-runtimes. Prefer a nightly newer than 2026.10.26 while YouTube
# challenge solving is moving quickly; checksum from that release's SHA2-256SUMS.
ARG YT_DLP_VERSION=2026.10.29.232701
ARG YT_DLP_SHA256=d18dd9fb5671cec896b0bbbeabdfb2f9a5c043235e57296c29dc8747cede0e61
ARG YT_DLP_BASE=https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/download
RUN curl -fsSL -o /usr/local/bin/yt-dlp \
        "${YT_DLP_BASE}/${YT_DLP_VERSION}/yt-dlp_linux" \
    && echo "${YT_DLP_SHA256}  /usr/local/bin/yt-dlp" | sha256sum -c - \
    && chmod 755 /usr/local/bin/yt-dlp

WORKDIR /app
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public

USER node
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
