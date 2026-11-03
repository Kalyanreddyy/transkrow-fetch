# Deploy Transkrow Fetch for free

The target is a **Render free web service**. The monthly cost is **$0**. There is no database and no disk to pay for. The service sleeps after 15 minutes of no visitors, and anything still in `/tmp` is discarded when it sleeps.

You need a GitHub repository that contains this project, and a Render account. Render's free plan does not ask you to pick a paid instance.

## What the free plan allows

From Render's pricing and free-plan docs (checked 2 November 2026):

- Price: $0 per month
- Memory: 512 MB
- One instance only
- Spins down after 15 minutes without a request, and takes about a minute to wake
- Local files are lost on spin-down, restart, and redeploy
- No persistent disk
- 750 free instance hours per workspace per month (a sleeping service does not use those hours)

The app is built for those limits: one download at a time, audio or video up to 90 minutes and 150 MB, temporary files only in `/tmp/transkrow`, and the file is streamed to your browser and deleted on the server when the save finishes. Anything you do not save is deleted within 15 minutes.

## 1. Create the Render service

1. Sign in at https://dashboard.render.com.
2. Click **New**, then **Blueprint**.
3. Connect the GitHub repository that contains this project.
4. Render reads `render.yaml`. Confirm the service name `transkrow-fetch`, runtime **Docker**, and plan **Free**.
5. When Render asks for `AUTH_PASSWORD`, type a password of at least 12 characters. This is the password you will type on the sign-in page. Do not reuse a password from another site.
6. Leave `AUTH_SECRET` as the value Render generates. You never need to read it.
7. Click **Apply** or **Deploy** and wait for the first Docker build to finish. The first build is the slow part. Later deploys reuse layers when they can.

The health check path is `/api/health`. The deployment is ready when that check is green.

If you would rather not use the Blueprint button: **New → Web Service**, choose the same repository, set the runtime to **Docker**, the instance type to **Free**, and the health check path to `/api/health`. Then add the variables from the next section by hand.

## 2. Variables

`render.yaml` already sets the free-tier limits. You only have to supply the password (and you can ignore the generated secret).

| Variable | Required | What it is |
| --- | --- | --- |
| `AUTH_PASSWORD` | Yes | Sign-in password. At least 12 characters. |
| `AUTH_SECRET` | Yes | Cookie signing secret. Render generates this from the blueprint. At least 16 characters if you type one yourself. |
| `COOKIE_SECURE` | Set to `1` | Marks the login cookie HTTPS-only. The blueprint sets this. |
| `DATA_DIR` | Set to `/tmp/transkrow` | Temporary files. The blueprint sets this. Do not point it at a paid disk. |
| `DELETE_AFTER_MINUTES` | `15` | Leftover files are removed after this many minutes. A finished save deletes the file immediately. |
| `MAX_DURATION_MINUTES` | `90` | Refuses longer media, including livestreams. |
| `MAX_FILE_BYTES` | `150M` | Refuses a larger file so a 512 MB instance is less likely to run out of memory. |
| `MAX_DISK_BYTES` | `400M` | Stops new downloads when `/tmp` is already holding this much. |
| `MAX_CONCURRENT` | `1` | One download at a time. |
| `MAX_PLAYLIST_ITEMS` | `3` | Used only if the playlist box is checked. |
| `JOB_TIMEOUT_MINUTES` | `20` | Gives up on a stuck download. |
| `RATE_LIMIT_PER_MINUTE` | `20` | Optional. New downloads allowed per minute. |
| `LOGIN_RATE_LIMIT` | `8` | Optional. Wrong-password attempts. |
| `LOGIN_WINDOW_MINUTES` | `15` | Optional. Window for those attempts. |
| `SESSION_TTL_HOURS` | `168` | Optional. How long the sign-in cookie lasts. |
| `COOKIES_CONTENT` | Optional | Netscape `cookies.txt` text, if YouTube blocks the host. See below. |
| `YTDLP_PROXY` | Optional | `http://…`, `https://…`, or `socks5://…` proxy. See below. |

Mark `AUTH_PASSWORD`, `AUTH_SECRET`, `COOKIES_CONTENT`, and `YTDLP_PROXY` as secret. Do not commit them.

Render sets `PORT` itself. Do not set `PORT` unless a fallback host tells you to.

## 3. Open the site

1. On the service page, copy the `https://….onrender.com` address.
2. The first open after a quiet period can take about a minute. Render shows its own loading page while the free instance wakes. Wait for it.
3. Sign in with `AUTH_PASSWORD`.
4. Paste one short link, leave **Audio (MP3)** selected, and click **Download**.
5. When the row says **Ready**, click **Save**. The browser should start a download. The server streams the file and then deletes it.
6. Prefer audio. A video merge uses more of the 512 MB and is more likely to be killed.

The page asks search engines not to index it. The address is still a secret: anyone with the password can use your free hours.

If the desk is empty after the site has been asleep, that is expected. Start the download again. Nothing was stored.

## 4. When YouTube says the server is a bot

Render's addresses are datacenter addresses. YouTube often blocks them. The desk says so when it happens. Cookies help only when they are still valid; a residential proxy is the reliable fix when the IP itself is flagged.

### Export cookies the way yt-dlp recommends

YouTube rotates account cookies while a normal YouTube tab stays open. Export from a throwaway session that you then close:

1. Open a **new private/incognito** window. Sign into YouTube with a spare Google account (not your main one).
2. In that same tab, open `https://www.youtube.com/robots.txt` (do not open other YouTube tabs).
3. Use a cookies extension and export **only** `youtube.com` as Netscape `cookies.txt`. Do **not** choose "export all sites".
4. **Close the private window** so the browser never rotates those cookies again.
5. In Render → Environment, set secret `COOKIES_CONTENT` to the **entire file**. Keep the tab characters. If the dashboard turns tabs into spaces, yt-dlp will skip every row.
6. Save (Render redeploys). Try one short public video.

Cookies are a secret. Do not paste them into chat or commit them.

A failed job may include a `detail` field with a short, sanitized yt-dlp excerpt (no cookie values). If it says cookies are "no longer valid" or "rotated", repeat the steps above.

### If fresh cookies still fail

Set `YTDLP_PROXY` to a **residential or ISP** proxy (`http://…`, `https://…`, or `socks5://…`) and redeploy. Another datacenter proxy usually fails the same way. A bgutil PO-token plugin can help with some formats on a clean IP; it does **not** unblock an IP YouTube has already flagged.

The image pins yt-dlp nightly `2026.10.29.232701` (PyInstaller `yt-dlp_linux`, which bundles EJS). Node in the image is used as `--js-runtimes`. If every link starts failing again, update `YT_DLP_VERSION` and `YT_DLP_SHA256` in the Dockerfile from that release's `SHA2-256SUMS` and push.

## 5. Day-to-day

- Use **Audio (MP3)** for transcription.
- Leave the playlist box off unless you want up to 3 items.
- Click **Save** before you close the tab. There is no library to come back to.
- Only download media Transkrow has the right to transcribe.
- One free service that sleeps most of the time stays inside the 750 hour monthly allowance. A service that is suspended at the end of the month wakes again when the hours reset.

## Fallback: Hugging Face Spaces (Docker)

Use this only if Render is unavailable. Create a new Space, choose **Docker**, and use the free CPU hardware if the form still offers it. Some accounts are only shown paid hardware for a new Docker Space; in that case skip to Koyeb.

In the Space `README.md`, the header should include:

```yaml
---
title: Transkrow Fetch
sdk: docker
app_port: 8080
---
```

The Dockerfile in this repository already listens on port 8080 unless `PORT` is set. In the Space settings, add secrets:

- `AUTH_PASSWORD`
- `AUTH_SECRET` (16+ random characters)
- `COOKIE_SECURE` = `1`
- `DATA_DIR` = `/tmp/transkrow`

Spaces sleep when idle and the container disk is ephemeral, so the same "save it now" rule applies. Docs: https://huggingface.co/docs/hub/spaces-sdks-docker

## Fallback: Koyeb free

Koyeb's free instance is one web service: 512 MB RAM, 0.1 vCPU, about 2 GB of SSD, no volume, and it scales to zero after an hour without traffic. It can run in Frankfurt or Washington, D.C. Docs: https://www.koyeb.com/docs/reference/instances

1. Create a Koyeb service from the GitHub repository.
2. Choose the **Dockerfile** build and the **Free** instance.
3. Set the health check path to `/api/health`.
4. Set the same variables as the Render table: `AUTH_PASSWORD`, `AUTH_SECRET`, `COOKIE_SECURE=1`, `DATA_DIR=/tmp/transkrow`, and the size limits.
5. Do not add a volume.

If Koyeb asks for a payment method just to open the account, use Render instead. This project does not require a paid instance on either host.
