import { defineEval } from "eve/evals";
import { equals } from "eve/evals/expect";
import { startDemoTarget } from "./helpers/demo-target.js";

interface ReportBugOutput {
  readonly severity?: string;
}

export default defineEval({
  description: "Filling the task title with whitespace and submitting reports an S3 validation gap.",
  async test(t) {
    const demo = await startDemoTarget();
    try {
      const turn = await t.send(`[script: form-validation-gap] against ${demo.url}`);
      t.succeeded();
      t.noFailedActions();
      t.toolOrder(["browser_navigate", "browser_fill", "browser_click", "report_bug"]);

      const report = turn.requireToolCall("report_bug", { input: { severity: "S3" } });
      t.check((report.input as { severity?: string }).severity, equals("S3"));
    } finally {
      await demo.stop();
    }
  },
});
