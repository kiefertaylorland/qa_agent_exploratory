import type { MockModelRequest, MockModelResponder, MockModelResponse } from "eve/evals";

/**
 * Scripted responder for deterministic evals. Each eval's first user
 * message carries a `[script: <name>] against <url>` directive; the named
 * script below decides the next tool call purely from how many tool
 * results have accumulated so far, so it works whether this is the first
 * call or a durable-replay re-run of an interrupted step.
 */

interface ScriptContext {
  readonly url: string;
}

type Script = (request: MockModelRequest, ctx: ScriptContext) => MockModelResponse;

function parseDirective(message: string | null): { script: string; url: string } {
  if (!message) {
    throw new Error("Mock responder needs a [script: <name>] against <url> directive in the first user message.");
  }
  const match = /\[script:\s*([\w-]+)\]\s*against\s*(\S+)/.exec(message);
  if (!match) {
    throw new Error(`Could not parse a script directive from: ${message}`);
  }
  return { script: match[1], url: match[2] };
}

function lastOutput(request: MockModelRequest): unknown {
  const { toolResults } = request;
  return toolResults[toolResults.length - 1]?.output;
}

// The mock model only ever sees the model-facing projection of a tool
// result (its toModelOutput text) — not the raw execute() return — because
// that projection is exactly what's serialized into the prompt. So
// toolResults[i].output here is the snapshot+signals text string.
function textFrom(output: unknown): string {
  return typeof output === "string" ? output : JSON.stringify(output);
}

/** Finds the aria ref nearest after the first match of `near` in the latest tool result text. */
function refFor(output: unknown, near: RegExp): string {
  const snapshot = textFrom(output);
  const match = near.exec(snapshot);
  if (!match) {
    throw new Error(`No element matching ${near} found in:\n${snapshot}`);
  }
  const tail = snapshot.slice(match.index);
  const refMatch = /\[ref=(e\d+)\]/.exec(tail);
  if (!refMatch) {
    throw new Error(`Found ${near} but no ref nearby in:\n${tail.slice(0, 300)}`);
  }
  return refMatch[1];
}

const smokeNavigation: Script = (request, ctx) => {
  if (request.toolResults.length === 0) {
    return { toolCalls: [{ name: "browser_navigate", input: { url: ctx.url } }] };
  }
  return { text: "Observed the Task Manager page." };
};

const findsConsoleError: Script = (request, ctx) => {
  const step = request.toolResults.length;
  if (step === 0) {
    return { toolCalls: [{ name: "browser_navigate", input: { url: ctx.url } }] };
  }
  if (step === 1) {
    const ref = refFor(lastOutput(request), /"Sort"/);
    return { toolCalls: [{ name: "browser_click", input: { element: "Sort button", ref } }] };
  }
  return { text: "Clicking Sort threw an uncaught page error." };
};

const findsNetworkFailure: Script = (request, ctx) => {
  const step = request.toolResults.length;
  if (step === 0) {
    return { toolCalls: [{ name: "browser_navigate", input: { url: ctx.url } }] };
  }
  if (step === 1) {
    const ref = refFor(lastOutput(request), /"Show stats"/);
    return { toolCalls: [{ name: "browser_click", input: { element: "Show stats button", ref } }] };
  }
  if (step === 2) {
    return {
      toolCalls: [
        {
          name: "report_bug",
          input: {
            title: "Stats endpoint returns 500",
            severity: "S2",
            summary: "Clicking Show stats triggers a request to /api/stats that always fails server-side.",
            reproSteps: ["Navigate to the app.", "Click the Show stats button."],
            expected: "The stats panel shows a completed-task count.",
            actual: "The request to /api/stats returns HTTP 500 and no stats are shown.",
          },
        },
      ],
    };
  }
  return { text: "Reported the stats endpoint failure." };
};

const formValidationGap: Script = (request, ctx) => {
  const step = request.toolResults.length;
  if (step === 0) {
    return { toolCalls: [{ name: "browser_navigate", input: { url: ctx.url } }] };
  }
  if (step === 1) {
    const ref = refFor(lastOutput(request), /"New task title"/);
    return { toolCalls: [{ name: "browser_fill", input: { element: "New task title input", ref, value: "   " } }] };
  }
  if (step === 2) {
    const ref = refFor(lastOutput(request), /"Add"/);
    return { toolCalls: [{ name: "browser_click", input: { element: "Add button", ref } }] };
  }
  if (step === 3) {
    return {
      toolCalls: [
        {
          name: "report_bug",
          input: {
            title: "Add-task form accepts a whitespace-only title",
            severity: "S3",
            summary: "The add-task form has no client- or server-side validation against blank titles.",
            reproSteps: [
              "Navigate to the app.",
              "Type only spaces into the New task title field.",
              "Click Add.",
            ],
            expected: "The form rejects the submission and shows a validation error.",
            actual: "A blank task is added to the list with no error shown.",
          },
        },
      ],
    };
  }
  return { text: "Reported the form-validation gap." };
};

const SCRIPTS: Record<string, Script> = {
  "smoke-navigation": smokeNavigation,
  "finds-console-error": findsConsoleError,
  "finds-network-failure": findsNetworkFailure,
  "form-validation-gap": formValidationGap,
};

export const scriptedResponder: MockModelResponder = (request) => {
  const { script, url } = parseDirective(request.lastUserMessage ?? request.userMessages[0] ?? null);
  const handler = SCRIPTS[script];
  if (!handler) {
    throw new Error(`Unknown mock script: ${script}`);
  }
  return handler(request, { url });
};
