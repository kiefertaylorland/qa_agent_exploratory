import type { MockModelResponder } from "eve/evals";

/**
 * Scripted responder for deterministic evals. Each eval's user message
 * carries a `[script: <name>]` directive; step scripts under evals/ drive
 * the actual tool-call sequences. This stub is replaced with the real
 * dispatch table once the eval scripts exist (see evals/*.eval.ts).
 */
export const scriptedResponder: MockModelResponder = () => {
  return { text: "Mock response" };
};
