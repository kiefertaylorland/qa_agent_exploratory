import type { Locator } from "playwright";
import { settle, type SessionState } from "./browser.js";
import { formatSignals, type Signal } from "./signals.js";

const MAX_SNAPSHOT_CHARS = 20_000;

export interface Observation {
  readonly snapshot: string;
  readonly signals: readonly Signal[];
}

/** Structured return shape shared by every observing/action tool. */
export interface ObserveToolOutput {
  readonly snapshot: string;
  readonly signals: readonly Signal[];
  readonly staleRef?: boolean;
}

export const STALE_REF_HINT =
  "The page changed since the last snapshot — call browser_snapshot to get fresh refs, then retry.";

export interface RefOrSelector {
  readonly ref?: string;
  readonly selector?: string;
}

/** Resolves a `ref` (via the `aria-ref=` selector engine) or a raw CSS `selector` escape hatch. */
export function resolveLocator(state: SessionState, target: RefOrSelector): Locator {
  if (target.selector) return state.page.locator(target.selector);
  if (target.ref) return state.page.locator(`aria-ref=${target.ref}`);
  throw new Error("Provide either ref or selector.");
}

/** Settles the page, takes an AI-mode aria snapshot, and drains signals since the last observation. */
export async function observe(state: SessionState): Promise<Observation> {
  await settle(state.page);
  const raw = await state.page.ariaSnapshot({ mode: "ai" });
  const signals = state.signals.drainSinceCursor();
  const snapshot =
    raw.length > MAX_SNAPSHOT_CHARS
      ? `${raw.slice(0, MAX_SNAPSHOT_CHARS)}\n... (truncated ${raw.length - MAX_SNAPSHOT_CHARS} more characters)`
      : raw;
  return { snapshot, signals };
}

/** The standard model-facing text for any observing tool: the snapshot plus the trailing signals block. */
export function formatObservationForModel(observation: Observation): string {
  return `${observation.snapshot}\n\n${formatSignals(observation.signals)}`;
}
