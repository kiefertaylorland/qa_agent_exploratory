import { defineTool, toolOutput } from "eve/tools";
import { z } from "zod";
import { requireSession, withAbort } from "#lib/browser.js";
import {
  formatObservationForModel,
  observe,
  resolveLocator,
  STALE_REF_HINT,
  type ObserveToolOutput,
} from "#lib/observe.js";

export default defineTool({
  description:
    "Click an element by aria ref (from the latest snapshot) or, as an escape hatch, a raw CSS " +
    "selector. Returns a fresh snapshot and any signals the click triggered.",
  inputSchema: z
    .object({
      element: z.string().min(1).describe("Human-readable description of the element, for repro steps."),
      ref: z.string().min(1).optional().describe("Element ref from the latest snapshot, e.g. e3."),
      selector: z.string().min(1).optional().describe("Raw CSS selector, used only when ref isn't available."),
    })
    .refine((value) => Boolean(value.ref) !== Boolean(value.selector), {
      message: "Provide exactly one of ref or selector.",
    }),
  async execute({ ref, selector }, ctx): Promise<ObserveToolOutput> {
    const state = requireSession(ctx.session.id);
    return withAbort(state, ctx.abortSignal, async () => {
      const locator = resolveLocator(state, { ref, selector });
      try {
        await locator.click();
      } catch {
        return { snapshot: STALE_REF_HINT, signals: [], staleRef: true };
      }
      const observation = await observe(state);
      return { snapshot: observation.snapshot, signals: observation.signals };
    });
  },
  toModelOutput(output) {
    return toolOutput.text(formatObservationForModel(output));
  },
});
