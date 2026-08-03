import { basename, join } from "node:path";
import { defineTool, toolOutput } from "eve/tools";
import { z } from "zod";
import { requireSession, withAbort } from "#lib/browser.js";
import { attachScreenshotToBug, writeBugReport } from "#lib/reporting.js";

export default defineTool({
  description:
    "Record a structured bug finding immediately when you notice one — never batch findings for " +
    "later. Writes a markdown report plus a screenshot by default, and attaches recent signals.",
  inputSchema: z.object({
    title: z.string().min(1),
    severity: z.enum(["S1", "S2", "S3", "S4"]).describe("S1 blocks core flows, S4 is cosmetic."),
    summary: z.string().min(1),
    reproSteps: z.array(z.string().min(1)).min(1),
    expected: z.string().min(1),
    actual: z.string().min(1),
    captureScreenshot: z.boolean().optional().default(true),
  }),
  async execute(input, ctx) {
    const state = requireSession(ctx.session.id);
    return withAbort(state, ctx.abortSignal, async () => {
      const recentSignals = state.signals.recent(10);
      const entry = await writeBugReport(state.paths, input, recentSignals);

      let screenshotPath: string | undefined;
      if (input.captureScreenshot) {
        screenshotPath = join(state.paths.evidenceDir, `${basename(entry.filePath, ".md")}.png`);
        await state.page.screenshot({ path: screenshotPath });
        await attachScreenshotToBug(state.paths, entry.slug, screenshotPath);
      }

      return { seq: entry.seq, slug: entry.slug, filePath: entry.filePath, screenshotPath };
    });
  },
  toModelOutput(output) {
    return toolOutput.text(`Reported bug #${output.seq} (${output.slug}) → ${output.filePath}`);
  },
});
