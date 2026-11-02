import { execFile, type ExecFileException } from "node:child_process";

export type ProcessResult = { code: number; output: string };

const SECRET_ENV = ["AUTH_PASSWORD", "AUTH_SECRET", "COOKIES_CONTENT"];

export function childEnv(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...source, PYTHONUNBUFFERED: "1" };
  for (const key of SECRET_ENV) {
    delete env[key];
  }
  return env;
}

function exitCode(error: ExecFileException | null): number {
  if (!error) {
    return 0;
  }
  if (typeof error.code === "number") {
    return error.code;
  }
  if (error.code === "ENOENT") {
    return 127;
  }
  if (error.code === "ETIMEDOUT" || error.killed) {
    return 124;
  }
  return 1;
}

/**
 * Run a binary with an argument array. `shell` is false, so metacharacters
 * in an argument cannot start another command.
 */
export function runProcess(
  bin: string,
  args: readonly string[],
  timeoutMs: number,
  onLine: (line: string) => void,
  env: NodeJS.ProcessEnv = childEnv(),
): Promise<ProcessResult> {
  return new Promise((resolve) => {
    let streamed = "";
    let carry = "";
    const child = execFile(
      bin,
      [...args],
      {
        shell: false,
        windowsHide: true,
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024,
        killSignal: "SIGKILL",
        env,
      },
      (error, stdout, stderr) => {
        const tail = `${stdout ?? ""}\n${stderr ?? ""}`;
        resolve({
          code: exitCode(error),
          output: `${streamed}\n${tail}`.slice(-8000),
        });
      },
    );

    const take = (chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      streamed = `${streamed}${text}`.slice(-8000);
      carry += text;
      const lines = carry.split(/\r\n|\n|\r/);
      carry = lines.pop() ?? "";
      for (const line of lines) {
        if (line) {
          onLine(line);
        }
      }
    };

    child.stdout?.on("data", take);
    child.stderr?.on("data", take);
  });
}
