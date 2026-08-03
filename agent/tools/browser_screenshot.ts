import { join } from "node:path";
import { defineTool, toolOutput, toolOutputPart } from "eve/tools";
import { z } from "zod";
import { requireSession, withAbort } from "#lib/browser.js";

export default defineTool({
  description:
    "Capture a viewport screenshot of the current page as evidence. Writes a PNG to the run's " +
    "evidence directory and shows it to you now — re-run this if you need to look again later.",
  inputSchema: z.object({}),
  async execute(_input, ctx) {
    const state = requireSession(ctx.session.id);
    return withAbort(state, ctx.abortSignal, async () => {
      const filename = `${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
      const path = join(state.paths.evidenceDir, filename);
      const buffer = await state.page.screenshot({ path });
      return { path, screenshotBase64: buffer.toString("base64") };
    });
  },
  toModelOutput(output) {
    return toolOutput.content([
      toolOutputPart.text(`Screenshot saved to ${output.path}:`),
      toolOutputPart.file(output.screenshotBase64, { mediaType: "image/png" }),
    ]);
  },
});
