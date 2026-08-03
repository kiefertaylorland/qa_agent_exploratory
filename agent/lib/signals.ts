import { appendFile } from "node:fs/promises";
import type { Page } from "playwright";

export type SignalType = "console" | "pageerror" | "requestfailed" | "response";

export interface Signal {
  readonly type: SignalType;
  readonly message: string;
  readonly url?: string;
  readonly status?: number;
  readonly timestamp: string;
}

const RING_CAPACITY = 200;

/**
 * Wires console/pageerror/requestfailed/response(>=400) listeners onto a
 * page once, keeps a capped ring buffer, and appends every signal to the
 * run's signals.jsonl. Tools drain "since last action" via a cursor rather
 * than re-reading the whole buffer each time.
 */
export class SignalBuffer {
  private readonly buffer: Signal[] = [];
  private cursor = 0;

  constructor(page: Page, private readonly logFilePath: string) {
    page.on("console", (message) => {
      const type = message.type();
      if (type === "error" || type === "warning") {
        this.record({
          type: "console",
          message: `[${type}] ${message.text()}`,
          timestamp: new Date().toISOString(),
        });
      }
    });

    page.on("pageerror", (error) => {
      this.record({
        type: "pageerror",
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    });

    page.on("requestfailed", (request) => {
      this.record({
        type: "requestfailed",
        message: request.failure()?.errorText ?? "request failed",
        url: request.url(),
        timestamp: new Date().toISOString(),
      });
    });

    page.on("response", (response) => {
      const status = response.status();
      if (status >= 400) {
        this.record({
          type: "response",
          message: `HTTP ${status}`,
          url: response.url(),
          status,
          timestamp: new Date().toISOString(),
        });
      }
    });
  }

  private record(signal: Signal): void {
    this.buffer.push(signal);
    if (this.buffer.length > RING_CAPACITY) {
      this.buffer.shift();
      this.cursor = Math.max(0, this.cursor - 1);
    }
    void appendFile(this.logFilePath, `${JSON.stringify(signal)}\n`).catch(() => {});
  }

  /** Signals recorded since the previous call to this method. */
  drainSinceCursor(): Signal[] {
    const since = this.buffer.slice(this.cursor);
    this.cursor = this.buffer.length;
    return since;
  }

  /** The most recent `count` signals, regardless of the cursor. */
  recent(count: number): Signal[] {
    return this.buffer.slice(-count);
  }
}

export function formatSignals(signals: readonly Signal[]): string {
  if (signals.length === 0) {
    return "signals since last action: none";
  }
  const lines = signals.map((signal) => {
    const location = signal.url ? ` ${signal.url}` : "";
    return `- [${signal.type}]${location} ${signal.message}`;
  });
  return `signals since last action:\n${lines.join("\n")}`;
}
