import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";

export interface DemoTarget {
  readonly url: string;
  stop(): Promise<void>;
}

const SERVER_PATH = join(process.cwd(), "demo-target", "server.js");
const LISTENING_PATTERN = /listening on (http:\/\/\S+)/;
const STARTUP_TIMEOUT_MS = 5_000;

/** Spawns a fresh demo-target instance on an OS-assigned port; collision-free under concurrency. */
export async function startDemoTarget(): Promise<DemoTarget> {
  const child: ChildProcess = spawn(process.execPath, [SERVER_PATH], {
    env: { ...process.env, DEMO_TARGET_PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const url = await new Promise<string>((resolve, reject) => {
    let buffer = "";
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("demo-target did not report a listening URL in time"));
    }, STARTUP_TIMEOUT_MS);

    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const match = LISTENING_PATTERN.exec(buffer);
      if (match) {
        cleanup();
        resolve(match[1]);
      }
    };
    const onExit = (code: number | null) => {
      cleanup();
      reject(new Error(`demo-target exited early (code ${code})`));
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    function cleanup() {
      clearTimeout(timeout);
      child.stdout?.off("data", onData);
      child.off("exit", onExit);
      child.off("error", onError);
    }

    child.stdout?.on("data", onData);
    child.once("exit", onExit);
    child.once("error", onError);
  });

  return {
    url,
    async stop() {
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill();
      await new Promise<void>((resolve) => child.once("exit", () => resolve()));
    },
  };
}
