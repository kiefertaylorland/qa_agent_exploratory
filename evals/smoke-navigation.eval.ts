import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";
import { startDemoTarget } from "./helpers/demo-target.js";

export default defineEval({
  description: "Navigating to the demo target returns an aria snapshot of the page.",
  async test(t) {
    const demo = await startDemoTarget();
    try {
      const turn = await t.send(`[script: smoke-navigation] against ${demo.url}`);
      t.succeeded();
      t.noFailedActions();

      const call = turn.requireToolCall("browser_navigate");
      const snapshot = (call.output as { snapshot?: string } | undefined)?.snapshot ?? "";
      t.check(snapshot, includes("Task Manager"));
    } finally {
      await demo.stop();
    }
  },
});
