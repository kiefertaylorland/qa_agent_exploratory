import { existsSync } from "node:fs";
import { defineEval } from "eve/evals";
import { satisfies } from "eve/evals/expect";
import { startDemoTarget } from "./helpers/demo-target.js";

interface ObserveOutput {
  readonly signals?: ReadonlyArray<{ readonly type: string; readonly status?: number }>;
}

interface ReportBugOutput {
  readonly filePath?: string;
}

export default defineEval({
  description: "Clicking Show stats surfaces the /api/stats 500, and report_bug writes a file to disk.",
  async test(t) {
    const demo = await startDemoTarget();
    try {
      const turn = await t.send(`[script: finds-network-failure] against ${demo.url}`);
      t.succeeded();
      t.noFailedActions();
      t.toolOrder(["browser_navigate", "browser_click", "report_bug"]);

      const click = turn.requireToolCall("browser_click");
      const signals = (click.output as ObserveOutput | undefined)?.signals ?? [];
      t.check(
        signals,
        satisfies<ObserveOutput["signals"]>(
          (s) => (s ?? []).some((signal) => signal.status === 500),
          "a 500 response signal was captured",
        ),
      );

      const report = turn.requireToolCall("report_bug");
      const filePath = (report.output as ReportBugOutput | undefined)?.filePath;
      t.check(
        filePath,
        satisfies<string | undefined>((p) => typeof p === "string" && existsSync(p), "bug report file exists on disk"),
      );
    } finally {
      await demo.stop();
    }
  },
});
