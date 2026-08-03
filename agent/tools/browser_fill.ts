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
    "Fill a text input or textarea by aria ref (or a raw CSS selector escape hatch), optionally " +
    "pressing Enter afterward. Returns a fresh snapshot and any signals triggered.",
  inputSchema: z
    .object({
      element: z.string().min(1).describe("Human-readable description of the field, for repro steps."),
      ref: z.string().min(1).optional().describe("Element ref from the latest snapshot, e.g. e3."),
      selector: z.string().min(1).optional().describe("Raw CSS selector, used only when ref isn't available."),
      value: z.string().describe("Text to fill. Pass an empty or whitespace-only string deliberately to probe validation."),
      pressEnter: z.boolean().optional().describe("Press Enter after filling, e.g. to submit a search box."),
    })
    .refine((value) => Boolean(value.ref) !== Boolean(value.selector), {
      message: "Provide exactly one of ref or selector.",
    }),
  async execute({ ref, selector, value, pressEnter }, ctx): Promise<ObserveToolOutput> {
    const state = requireSession(ctx.session.id);
    return withAbort(state, ctx.abortSignal, async () => {
      const locator = resolveLocator(state, { ref, selector });
      try {
        await locator.fill(value);
        if (pressEnter) {
          await locator.press("Enter");
        }
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
