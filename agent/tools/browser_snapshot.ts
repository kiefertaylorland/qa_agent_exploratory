import { defineTool, toolOutput } from "eve/tools";
import { z } from "zod";
import { requireSession, withAbort } from "#lib/browser.js";
import { formatObservationForModel, observe, type ObserveToolOutput } from "#lib/observe.js";

export default defineTool({
  description:
    "Re-observe the current page without acting: a fresh aria snapshot plus any signals since the " +
    "last action. Call this after a stale-ref error, or any time you need current refs.",
  inputSchema: z.object({}),
  async execute(_input, ctx): Promise<ObserveToolOutput> {
    const state = requireSession(ctx.session.id);
    return withAbort(state, ctx.abortSignal, async () => {
      const observation = await observe(state);
      return { snapshot: observation.snapshot, signals: observation.signals };
    });
  },
  toModelOutput(output) {
    return toolOutput.text(formatObservationForModel(output));
  },
});
