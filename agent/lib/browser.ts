import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { deriveRunId, ensureReportDirs, reportPathsFor, type ReportPaths } from "./reporting.js";
import { SignalBuffer } from "./signals.js";

export interface SessionState {
  readonly context: BrowserContext;
  readonly page: Page;
  readonly runId: string;
  readonly paths: ReportPaths;
  readonly signals: SignalBuffer;
  targetOrigin: string | null;
}

// One process = one long-lived `eve dev`/`eve start`; a serverless deploy
// would need a per-invocation browser instead. See Plans for the v1 tradeoff.
let browserPromise: Promise<Browser> | null = null;

function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true });
  }
  return browserPromise;
}

const sessions = new Map<string, SessionState>();

export async function getOrCreateSession(sessionId: string): Promise<SessionState> {
  const existing = sessions.get(sessionId);
  if (existing) return existing;

  const browser = await getBrowser();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  context.setDefaultTimeout(10_000);
  context.setDefaultNavigationTimeout(15_000);
  const page = await context.newPage();

  const runId = deriveRunId(sessionId);
  const paths = reportPathsFor(runId);
  await ensureReportDirs(paths);

  const state: SessionState = {
    context,
    page,
    runId,
    paths,
    signals: new SignalBuffer(page, paths.signalsJsonlPath),
    targetOrigin: null,
  };
  sessions.set(sessionId, state);
  return state;
}

export function requireSession(sessionId: string): SessionState {
  const state = sessions.get(sessionId);
  if (!state) {
    throw new Error("No active browser session for this conversation — call browser_navigate first.");
  }
  return state;
}

export async function closeSession(sessionId: string): Promise<void> {
  const state = sessions.get(sessionId);
  if (!state) return;
  sessions.delete(sessionId);
  await state.context.close().catch(() => {});
}

/** Locks the session to the origin of its first navigation; rejects any later cross-origin navigation. */
export function lockOrJoinOrigin(state: SessionState, url: string): void {
  const origin = new URL(url).origin;
  if (state.targetOrigin === null) {
    state.targetOrigin = origin;
    return;
  }
  if (origin !== state.targetOrigin) {
    throw new Error(
      `Navigation blocked: ${origin} is outside this session's locked target origin (${state.targetOrigin}).`,
    );
  }
}

/** Bounded wait for in-flight network activity to settle after an action. */
export async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 3_000 }).catch(() => {});
}

/** Closes the session's browser context if the turn is cancelled mid-call. */
export async function withAbort<T>(
  state: SessionState,
  signal: AbortSignal,
  fn: () => Promise<T>,
): Promise<T> {
  const onAbort = () => {
    void state.context.close().catch(() => {});
  };
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    return await fn();
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

async function closeAllBestEffort(): Promise<void> {
  if (!browserPromise) return;
  const browser = await browserPromise.catch(() => null);
  await browser?.close().catch(() => {});
}

process.once("SIGINT", () => void closeAllBestEffort());
process.once("SIGTERM", () => void closeAllBestEffort());
