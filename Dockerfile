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

# bgutil 2.0.2 HTTP server. canvas ships its own shared libraries, so the
# runtime image does not need a separate cairo/pango install.
FROM node:22-bookworm-slim AS pot
WORKDIR /src
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
ARG BGUTIL_VERSION=2.0.2
ARG BGUTIL_SHA256=1f2ae9ec39405b8e80397dfc2551f58deed09d8dff4b2b8fbc314df8e091c0a1
RUN curl -fsSL -o /tmp/bgutil.tar.gz \
        "https://github.com/Brainicism/bgutil-ytdlp-pot-provider/archive/refs/tags/${BGUTIL_VERSION}.tar.gz" \
    && echo "${BGUTIL_SHA256}  /tmp/bgutil.tar.gz" | sha256sum -c - \
    && tar -xzf /tmp/bgutil.tar.gz --strip-components=1 \
    && cd server \
    && npm ci --no-audit --no-fund \
    && npx tsc \
    && npm prune --omit=dev \
    && rm -rf /root/.npm

FROM node:22-bookworm-slim AS runner
ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    PORT=8080 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/tmp/transkrow \
    YTDLP_PATH=/usr/local/bin/yt-dlp \
    FFMPEG_PATH=/usr/bin/ffmpeg \
    FFPROBE_PATH=/usr/bin/ffprobe \
    YTDLP_PLUGIN_DIR=/opt/yt-dlp-plugins \
    POT_PROVIDER_URL=http://127.0.0.1:4416

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Official PyInstaller build. It bundles yt-dlp-ejs and loads plugin zips from
# --plugin-dirs. It does not see pip-installed plugins. Checksum from that
# nightly's SHA2-256SUMS.
ARG YT_DLP_VERSION=2026.10.29.232701
ARG YT_DLP_SHA256=d18dd9fb5671cec896b0bbbeabdfb2f9a5c043235e57296c29dc8747cede0e61
ARG YT_DLP_BASE=https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/download
ARG BGUTIL_VERSION=2.0.2
ARG BGUTIL_PLUGIN_SHA256=a26b980bf6d8e8400d8f21445daa4d8381bf6183d20f0be309391f86b31e27ef
RUN curl -fsSL -o /usr/local/bin/yt-dlp \
        "${YT_DLP_BASE}/${YT_DLP_VERSION}/yt-dlp_linux" \
    && echo "${YT_DLP_SHA256}  /usr/local/bin/yt-dlp" | sha256sum -c - \
    && chmod 755 /usr/local/bin/yt-dlp \
    && mkdir -p /opt/yt-dlp-plugins \
    && curl -fsSL -o /opt/yt-dlp-plugins/bgutil-ytdlp-pot-provider.zip \
        "https://github.com/Brainicism/bgutil-ytdlp-pot-provider/releases/download/${BGUTIL_VERSION}/bgutil-ytdlp-pot-provider.zip" \
    && echo "${BGUTIL_PLUGIN_SHA256}  /opt/yt-dlp-plugins/bgutil-ytdlp-pot-provider.zip" | sha256sum -c - \
    && chmod 644 /opt/yt-dlp-plugins/bgutil-ytdlp-pot-provider.zip

COPY --from=pot --chown=node:node /src/server/build /opt/bgutil-provider/build
COPY --from=pot --chown=node:node /src/server/node_modules /opt/bgutil-provider/node_modules
COPY --from=pot --chown=node:node /src/server/package.json /opt/bgutil-provider/package.json

WORKDIR /app
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --chown=node:node docker/entrypoint.mjs /app/docker-entrypoint.mjs

USER node
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "/app/docker-entrypoint.mjs"]
