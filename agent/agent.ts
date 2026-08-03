import { defineAgent } from "eve";
import { mockModel } from "eve/evals";
import { scriptedResponder } from "#lib/mock-scripts.js";

// mockModel() returns an AI SDK LanguageModel with no AI Gateway catalog
// entry, so the agent-level modelContextWindowTokens escape hatch is
// required — without it, eve can't resolve the compaction trigger window
// and refuses to compile the agent config.
export default process.env.QA_AGENT_MODEL === "mock"
  ? defineAgent({
      model: mockModel(scriptedResponder),
      modelContextWindowTokens: 1_000_000,
    })
  : defineAgent({
      model: process.env.QA_AGENT_MODEL ?? "anthropic/claude-sonnet-5",
    });
