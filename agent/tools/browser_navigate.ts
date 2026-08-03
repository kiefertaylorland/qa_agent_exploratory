import { defineTool, toolOutput } from "eve/tools";
import { z } from "zod";
import { getOrCreateSession, lockOrJoinOrigin, withAbort } from "#lib/browser.js";
import { formatObservationForModel, observe, type ObserveToolOutput } from "#lib/observe.js";

export default defineTool({
  description:
    "Navigate the session's browser to a URL and observe the resulting page. The first call in a " +
    "session locks the target origin; later navigation to a different origin is rejected.",
  inputSchema: z.object({
    url: z.string().min(1).describe("Absolute URL to navigate to."),
  }),
  async execute({ url }, ctx): Promise<ObserveToolOutput> {
    const state = await getOrCreateSession(ctx.session.id);
    return withAbort(state, ctx.abortSignal, async () => {
      lockOrJoinOrigin(state, url);
      await state.page.goto(url, { waitUntil: "load" });
      const observation = await observe(state);
      return { snapshot: observation.snapshot, signals: observation.signals };
    });
  },
  toModelOutput(output) {
    return toolOutput.text(formatObservationForModel(output));
  },
});
