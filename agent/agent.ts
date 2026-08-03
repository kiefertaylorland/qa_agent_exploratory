import { defineAgent } from "eve";
import { mockModel } from "eve/evals";
import { scriptedResponder } from "#lib/mock-scripts.js";

// mockModel() returns an AI SDK LanguageModel with no AI Gateway catalog
// entry, so the agent-level modelContextWindowTokens escape hatch is
// required — without it, eve can't resolve the compaction trigger window
// and refuses to compile the agent config.
// playwright's optional fsevents dependency ships a native .node binary that
// eve's bundler can't trace — keep playwright external so it resolves via
// normal Node module resolution instead of getting inlined.
const build = { externalDependencies: ["playwright"] };

export default process.env.QA_AGENT_MODEL === "mock"
  ? defineAgent({
      model: mockModel(scriptedResponder),
      modelContextWindowTokens: 1_000_000,
      build,
    })
  : defineAgent({
      model: process.env.QA_AGENT_MODEL ?? "anthropic/claude-sonnet-5",
      build,
    });
