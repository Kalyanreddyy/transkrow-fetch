"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type JobFile = { name: string; bytes: number };

type Job = {
  id: string;
  url: string;
  pageHost: string;
  mode: "audio" | "video";
  playlist: boolean;
  status: "queued" | "running" | "completed" | "failed";
  progress: number | null;
  label: string | null;
  error: string | null;
  files: JobFile[];
  createdAt: string;
  expiresAt: string;
};

const STATUS_LABEL = {
  queued: "Waiting",
  running: "Downloading",
  completed: "Ready",
  failed: "Failed",
} as const;

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function Desk({
  deleteAfterMinutes,
  maxDurationMinutes,
  maxFileBytes,
  maxPlaylistItems,
}: {
  deleteAfterMinutes: number;
  maxDurationMinutes: number;
  maxFileBytes: number;
  maxPlaylistItems: number;
}) {
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<"audio" | "video">("audio");
  const [playlist, setPlaylist] = useState(false);
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [engineReady, setEngineReady] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer = 0;

    const tick = async () => {
      try {
        const response = await fetch("/api/jobs", { headers: { accept: "application/json" } });
        if (response.status === 401) {
          window.location.href = "/login";
          return;
        }
        if (!response.ok) {
          throw new Error("The desk could not load downloads.");
        }
        const body = (await response.json()) as { jobs: Job[] };
        if (cancelled) {
          return;
        }
        setJobs(body.jobs);
        setLoadError(null);
        const active = body.jobs.some((job) => job.status === "queued" || job.status === "running");
        timer = window.setTimeout(tick, active ? 1500 : 8000);
      } catch {
        if (!cancelled) {
          setLoadError("The desk could not be reached. Check the connection and leave this page open.");
          timer = window.setTimeout(tick, 5000);
        }
      }
    };

    void tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    void fetch("/api/health")
      .then((response) => response.json())
      .then((body: { ready?: boolean }) => setEngineReady(body.ready === true))
      .catch(() => setEngineReady(false));
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ url, mode, playlist }),
      });
      const body = (await response.json()) as { error?: string; job?: Job };
      if (!response.ok || !body.job) {
        setFormError(body.error ?? "The download could not be started.");
        return;
      }
      setJobs((current) => [body.job as Job, ...(current ?? []).filter((job) => job.id !== body.job?.id)]);
      setUrl("");
    } catch {
      setFormError("The download could not be started.");
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id: string) {
    const response = await fetch(`/api/jobs/${id}`, { method: "DELETE" });
    if (response.ok) {
      setJobs((current) => (current ?? []).filter((job) => job.id !== id));
      return;
    }
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    setFormError(body.error ?? "That download could not be removed.");
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-6 sm:px-6 sm:py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">Transkrow</p>
          <h1 className="font-heading text-4xl leading-none sm:text-5xl">Fetch</h1>
        </div>
        <form action="/api/auth/logout" method="post">
          <Button type="submit" variant="outline" className="h-10">
            Sign out
          </Button>
        </form>
      </header>

      <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
        Paste a YouTube link, or a link from another public video site. Audio is the usual choice for a
        transcript. The file streams to your computer and is deleted from the server as soon as that
        save finishes. Anything left behind is removed within {deleteAfterMinutes} minutes.
      </p>

      {engineReady === false ? (
        <p role="alert" className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          yt-dlp or ffmpeg is missing on this server, so downloads will fail until the image is rebuilt.
        </p>
      ) : null}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>New download</CardTitle>
          <CardDescription>
            Up to {maxDurationMinutes} minutes and {formatBytes(maxFileBytes)}. One video at a time unless you
            opt into a short playlist.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="url">Link</Label>
              <Input
                id="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://www.youtube.com/watch?v=…"
                inputMode="url"
                autoComplete="off"
                required
                className="h-11"
              />
            </div>
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium">Save as</legend>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={mode === "audio" ? "default" : "outline"}
                  className="h-11"
                  aria-pressed={mode === "audio"}
                  onClick={() => setMode("audio")}
                >
                  Audio (MP3)
                </Button>
                <Button
                  type="button"
                  variant={mode === "video" ? "default" : "outline"}
                  className="h-11"
                  aria-pressed={mode === "video"}
                  onClick={() => setMode("video")}
                >
                  Video (MP4)
                </Button>
              </div>
            </fieldset>
            <Label className="items-start gap-3 text-sm leading-5 font-normal">
              <Checkbox
                checked={playlist}
                onCheckedChange={(checked) => setPlaylist(checked === true)}
                className="mt-0.5"
              />
              <span>
                This is a playlist. Fetch only the first {maxPlaylistItems} items, so a whole channel is not
                pulled by accident.
              </span>
            </Label>
            {formError ? (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            ) : null}
            <Button type="submit" size="lg" className="h-11" disabled={submitting}>
              {submitting ? "Starting…" : "Download"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <section className="mt-8 flex flex-1 flex-col gap-3" aria-live="polite">
        <h2 className="font-heading text-2xl">Recent files</h2>
        {loadError ? (
          <p role="alert" className="text-sm text-destructive">
            {loadError}
          </p>
        ) : null}
        {jobs === null ? <p className="text-sm text-muted-foreground">Loading the desk…</p> : null}
        {jobs?.length === 0 ? (
          <Card>
            <CardContent className="py-8">
              <p className="font-heading text-xl">Nothing here yet</p>
              <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                Paste a link above. When the file is ready, save it to your computer and send it through the usual
                Transkrow transcription workflow.
              </p>
            </CardContent>
          </Card>
        ) : null}
        {jobs?.map((job) => (
          <Card key={job.id} size="sm">
            <CardHeader>
              <CardTitle className="truncate">{job.label || job.pageHost}</CardTitle>
              <CardDescription className="break-all">{job.url}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={job.status === "failed" ? "destructive" : job.status === "completed" ? "secondary" : "default"}>
                  {STATUS_LABEL[job.status]}
                  {job.status === "running" && job.progress !== null ? ` ${Math.round(job.progress)}%` : ""}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {job.mode === "audio" ? "Audio" : "Video"}
                  {job.playlist ? " · playlist" : ""} · {formatWhen(job.createdAt)}
                </span>
              </div>
              {job.status === "running" ? (
                <div
                  className="h-1.5 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(job.progress ?? 0)}
                >
                  <div
                    className="h-full bg-primary transition-[width]"
                    style={{ width: `${Math.round(job.progress ?? 2)}%` }}
                  />
                </div>
              ) : null}
              {job.error ? <p className="text-sm text-destructive">{job.error}</p> : null}
              {job.status === "completed" ? (
                <ul className="flex flex-col gap-2">
                  {job.files.map((file) => (
                    <li key={file.name} className="flex flex-wrap items-center justify-between gap-2">
                      <a
                        className="text-sm font-medium underline-offset-4 hover:underline"
                        href={`/api/jobs/${job.id}/file?name=${encodeURIComponent(file.name)}`}
                      >
                        Save {file.name}
                      </a>
                      <span className="text-xs text-muted-foreground">{formatBytes(file.bytes)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {job.status === "queued" || job.status === "running"
                    ? "Save it as soon as it is ready. The server does not keep a copy."
                    : job.status === "completed"
                      ? "Saving streams the file, then deletes it here."
                      : `Removed after ${formatWhen(job.expiresAt)}.`}
                </p>
                {job.status !== "running" ? (
                  <Button type="button" variant="ghost" className="h-8" onClick={() => void remove(job.id)}>
                    Delete now
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <footer className="mt-10 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
        Download engine: yt-dlp and FFmpeg. The workflow is adapted from{" "}
        <a className="underline-offset-4 hover:underline" href="https://github.com/nexmoe/VidBee">
          VidBee
        </a>{" "}
        by nexmoe, which is MIT licensed. Use this only for media Transkrow has the right to transcribe. YouTube
        often blocks hosting-provider addresses; cookies or a proxy are described in DEPLOY.md.
      </footer>
    </div>
  );
}
