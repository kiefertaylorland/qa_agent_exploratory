import { defineTool, toolOutput } from "eve/tools";
import { z } from "zod";
import { closeSession, requireSession } from "#lib/browser.js";
import { writeSessionReport } from "#lib/reporting.js";

export default defineTool({
  description:
    "End the exploratory-testing session exactly once: writes the session report (charter, " +
    "summary, bug table, coverage notes, open questions) and closes the browser.",
  inputSchema: z.object({
    charter: z.string().min(1),
    summary: z.string().min(1),
    coverageNotes: z.array(z.string()).optional().default([]),
    openQuestions: z.array(z.string()).optional().default([]),
  }),
  async execute(input, ctx) {
    const state = requireSession(ctx.session.id);
    await writeSessionReport(state.paths, input);
    await closeSession(ctx.session.id);
    return {
      reportMdPath: state.paths.reportMdPath,
      reportJsonPath: state.paths.reportJsonPath,
      bugsDir: state.paths.bugsDir,
    };
  },
  toModelOutput(output) {
    return toolOutput.text(
      `Session finalized. Report: ${output.reportMdPath} (${output.reportJsonPath}). Bugs: ${output.bugsDir}`,
    );
  },
});
