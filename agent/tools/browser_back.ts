import { defineTool, toolOutput } from "eve/tools";
import { z } from "zod";
import { requireSession, withAbort } from "#lib/browser.js";
import { formatObservationForModel, observe, type ObserveToolOutput } from "#lib/observe.js";

export default defineTool({
  description: "Navigate back in the session's browser history — the way out of a dead end.",
  inputSchema: z.object({}),
  async execute(_input, ctx): Promise<ObserveToolOutput> {
    const state = requireSession(ctx.session.id);
    return withAbort(state, ctx.abortSignal, async () => {
      await state.page.goBack({ waitUntil: "load" });
      const observation = await observe(state);
      return { snapshot: observation.snapshot, signals: observation.signals };
    });
  },
  toModelOutput(output) {
    return toolOutput.text(formatObservationForModel(output));
  },
});
