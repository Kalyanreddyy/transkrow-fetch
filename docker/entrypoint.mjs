import { spawn } from "node:child_process";

const node = process.execPath;
const potScript = process.env.POT_SERVER_SCRIPT || "/opt/bgutil-provider/build/main.js";
const appScript = process.env.APP_SERVER_SCRIPT || "/app/server.js";
const potPort = process.env.POT_PORT || "4416";

let potStopped = false;
let potChild = null;
let restartTimer = null;

function startPot() {
  if (potStopped) {
    return;
  }
  potChild = spawn(node, [potScript, "--host", "127.0.0.1", "--port", potPort], { stdio: "inherit" });
  potChild.on("exit", (code, signal) => {
    if (potStopped) {
      return;
    }
    console.error(`PO token provider exited (${signal || code}); restarting`);
    restartTimer = setTimeout(startPot, 1000);
  });
}

function stopPot() {
  potStopped = true;
  if (restartTimer) {
    clearTimeout(restartTimer);
  }
  if (potChild && potChild.exitCode === null && !potChild.killed) {
    potChild.kill("SIGTERM");
  }
}

startPot();

const app = spawn(node, [appScript], { stdio: "inherit" });

function shutdown(signal) {
  stopPot();
  if (app.exitCode === null && !app.killed) {
    app.kill(signal);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

app.on("exit", (code, signal) => {
  stopPot();
  if (signal) {
    process.exit(1);
    return;
  }
  process.exit(code ?? 0);
});
