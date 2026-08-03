import { defineEval } from "eve/evals";
import { satisfies } from "eve/evals/expect";
import { startDemoTarget } from "./helpers/demo-target.js";

/**
 * Live-model smoke test: give the agent a charter against the demo target
 * and confirm it works the SBTM loop end to end (finds at least one seeded
 * bug, reports it, finalizes exactly once). Requires AI Gateway credentials
 * — excluded from `pnpm eval`, run explicitly via `pnpm eval:real`.
 */
export default defineEval({
  description: "Given a charter, the agent finds and reports at least one seeded bug, then finalizes.",
  tags: ["real-model"],
  timeoutMs: 600_000,
  async test(t) {
    const demo = await startDemoTarget();
    try {
      const turn = await t.send(
        `Explore ${demo.url}. Charter: broadly probe the Task Manager app — try the Sort button, ` +
          `the Show stats button, the add-task form, and the nav links. Report every bug you find, ` +
          `then finalize the session.`,
      );
      t.succeeded();
      t.noFailedActions();

      const reportedBugs = turn.toolCalls.filter((call) => call.name === "report_bug");
      t.check(reportedBugs.length, satisfies<number>((n) => n >= 1, "at least one bug was reported"));
      turn.requireToolCall("finalize_session");
    } finally {
      await demo.stop();
    }
  },
});
