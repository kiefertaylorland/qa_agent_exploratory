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
    "Choose an option in a <select> element by aria ref (or a raw CSS selector escape hatch) and " +
    "option value. Returns a fresh snapshot and any signals triggered.",
  inputSchema: z
    .object({
      element: z.string().min(1).describe("Human-readable description of the select, for repro steps."),
      ref: z.string().min(1).optional().describe("Element ref from the latest snapshot, e.g. e3."),
      selector: z.string().min(1).optional().describe("Raw CSS selector, used only when ref isn't available."),
      value: z.string().min(1).describe("The option's value attribute to select."),
    })
    .refine((value) => Boolean(value.ref) !== Boolean(value.selector), {
      message: "Provide exactly one of ref or selector.",
    }),
  async execute({ ref, selector, value }, ctx): Promise<ObserveToolOutput> {
    const state = requireSession(ctx.session.id);
    return withAbort(state, ctx.abortSignal, async () => {
      const locator = resolveLocator(state, { ref, selector });
      try {
        await locator.selectOption(value);
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
