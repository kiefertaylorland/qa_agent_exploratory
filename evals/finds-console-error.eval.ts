import { defineEval } from "eve/evals";
import { satisfies } from "eve/evals/expect";
import { startDemoTarget } from "./helpers/demo-target.js";

interface ObserveOutput {
  readonly signals?: ReadonlyArray<{ readonly type: string }>;
}

export default defineEval({
  description: "Clicking the seeded Sort button surfaces a pageerror signal in the tool output.",
  async test(t) {
    const demo = await startDemoTarget();
    try {
      const turn = await t.send(`[script: finds-console-error] against ${demo.url}`);
      t.succeeded();
      t.noFailedActions();
      t.toolOrder(["browser_navigate", "browser_click"]);

      const call = turn.requireToolCall("browser_click");
      t.log(`browser_click output: ${JSON.stringify(call.output).slice(0, 500)}`);
      const signals = (call.output as ObserveOutput | undefined)?.signals ?? [];
      t.check(
        signals,
        satisfies<ObserveOutput["signals"]>(
          (s) => (s ?? []).some((signal) => signal.type === "pageerror"),
          "a pageerror signal was captured",
        ),
      );
    } finally {
      await demo.stop();
    }
  },
});
