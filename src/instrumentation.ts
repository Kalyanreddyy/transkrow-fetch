export async function register() {
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  // `next build` loads this file while NODE_ENV is production. Do not require
  // secrets or exit during the image build.
  if (process.env.NEXT_PHASE === "phase-production-build" || process.env.npm_lifecycle_event === "build") {
    return;
  }
  try {
    const { startBackgroundWork } = await import("./lib/jobs");
    await startBackgroundWork();
  } catch (error) {
    console.error(error);
    if (process.env.NODE_ENV === "production") {
      process.exit(1);
    }
  }
}
