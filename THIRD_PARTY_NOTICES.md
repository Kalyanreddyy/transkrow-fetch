# Third-party notices

Transkrow Fetch is an independent single-service downloader. It does not copy
the VidBee application source. It uses the same kind of download engine VidBee
uses (yt-dlp and FFmpeg) and is meant for the same job: saving video or audio
from a public page so it can be transcribed.

## VidBee

Upstream: https://github.com/nexmoe/VidBee

```
MIT License

Copyright (c) 2025 VidBee

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

VidBee may be forked and self-hosted. The MIT grant includes commercial use.
This deployment does not vendor the VidBee monorepo; see SYSTEM_DESIGN.md for
why the desktop and web apps were not copied in.

## yt-dlp

https://github.com/yt-dlp/yt-dlp — Unlicense (public domain dedication).

The Docker image installs the official `yt-dlp_linux` binary, pinned by
version and SHA-256.

## bgutil PO token provider

https://github.com/Brainicism/bgutil-ytdlp-pot-provider — GPL-3.0-only.

The image runs the pinned 2.0.2 Node server and loads the matching yt-dlp
plugin zip. It is a separate process, not part of the Next.js application.

## FFmpeg

https://ffmpeg.org/ — built from the Debian `ffmpeg` package. FFmpeg is
licensed under the GPL or LGPL depending on how it was compiled. The Debian
package is the one installed in the image.

## Application libraries

Next.js, React, and the shadcn/ui primitives are installed from npm. Their
license texts are in `node_modules` after install and are not redistributed
as source in this repository beyond the lockfile.
