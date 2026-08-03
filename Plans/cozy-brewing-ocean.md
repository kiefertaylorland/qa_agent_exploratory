# Plan: Exploratory-Testing QA Agent on Vercel eve

## Context

Kiefer wants a software testing / QA agent that performs **exploratory testing**, built on Vercel's **eve** framework (github.com/vercel/eve, v0.29.4, beta) — both a working tool and a portfolio-grade exploration of eve for his AI-quality/verification-layer practice.

eve is a *filesystem-first framework for durable AI agents*: an agent is a directory — `agent/instructions.md`, `agent/agent.ts` (model config), `agent/tools/*.ts` (typed tools, names derived from file paths), `agent/skills/*.md` (on-demand procedures), plus a sibling `evals/` directory run by `eve eval`. Tools execute in the app runtime with full Node.js — so they can drive Playwright directly.

**Decisions confirmed with Kiefer:** (1) custom Playwright tools (full console/pageerror/network-failure capture — the QA signals no packaged eve browser extension exposes); (2) Vercel AI Gateway for live model runs (documented manual step; all automated verification uses eve's deterministic `mockModel`); (3) bundled deliberately-buggy demo app as the gradeable target.

**Environment (verified):** eve needs Node ≥ 24 — machine default is 22, nvm has v24.18.1 → `.nvmrc` + `nvm use`. pnpm 11 present. **Playwright 1.61.1 pins Chromium rev 1228, already cached** in `~/Library/Caches/ms-playwright` → exact-pin for zero-download install. No model credentials on machine; Vercel CLI installed but logged out → live runs are user steps, never automated gates. Verified firsthand: `page.ariaSnapshot({ mode: "ai" })` (public in PW ≥1.61, emits `[ref=eN]`) + `aria-ref=` selector engine; `mockModel` responders see `{ lastUserMessage, toolResults, ... }` and return scripted `toolCalls`.

## What we're building

`qa-agent-explore`: given a target URL + optional charter, the agent runs a session-based test-management (SBTM) loop — charter → tours/heuristics → observe-act-read-signals cycles → structured findings — in real Chromium, and writes per-bug reports + a session summary to `reports/<run-id>/` with screenshot evidence.

## File tree

```
qa_agent_explore/
├── .nvmrc                          # 24
├── .gitignore                      # node_modules/, .eve/, .env*, reports/* (keep .gitkeep)
├── .env.example                    # QA_AGENT_MODEL, AI_GATEWAY_API_KEY, DEMO_TARGET_PORT
├── package.json                    # deps + scripts below; "#*" imports map (eve scaffold parity)
├── tsconfig.json                   # eve scaffold shape (strict, ES2022, bundler, noEmit; agent/ + evals/)
├── README.md                       # overview, quickstart, live-run recipe, demo walkthrough
├── AGENTS.md                       # points coding agents at node_modules/eve/docs
├── agent/
│   ├── agent.ts                    # QA_AGENT_MODEL switch: "mock" → mockModel(scriptedResponder) + modelContextWindowTokens: 1_000_000 (mocks lack gateway metadata); else gateway id, default "anthropic/claude-sonnet-5"
│   ├── instructions.md             # lean always-on prompt (outline below)
│   ├── lib/
│   │   ├── browser.ts              # lazy singleton Chromium; per-session state keyed by ctx.session.id; abort handling
│   │   ├── signals.ts              # Signal type; page.on wiring; drain/format "signals since last action"
│   │   ├── reporting.ts            # run-id, reports/<run-id>/ writers (bugs, evidence, session report)
│   │   └── mock-scripts.ts         # scripted mockModel responder for deterministic evals
│   ├── tools/
│   │   ├── browser_navigate.ts     # goto (origin-locked to session target) → snapshot + signals
│   │   ├── browser_snapshot.ts     # re-observe → snapshot + signals
│   │   ├── browser_click.ts        # click by ref → fresh snapshot + signals
│   │   ├── browser_fill.ts         # fill by ref (+optional Enter) → snapshot + signals
│   │   ├── browser_select.ts       # <select> option by ref+value → snapshot + signals
│   │   ├── browser_back.ts         # history back (dead-end recovery)
│   │   ├── browser_screenshot.ts   # viewport PNG → evidence file + inline image content part
│   │   ├── report_bug.ts           # structured finding → reports/<run>/bugs/NN-slug.md (+json index); auto-attaches recent signals
│   │   ├── finalize_session.ts     # session report.md/.json; closes browser context; returns paths
│   │   └── bash.ts, web_fetch.ts, read_file.ts, write_file.ts, glob.ts, grep.ts
│   │                               # each `export default disableTool()` — no shell/sandbox for a browser QA agent (also avoids just-bash sandbox auto-install)
│   └── skills/
│       ├── touring-heuristics.md   # SFDIPOT coverage + tour catalog; charter → tour plan
│       ├── form-probing.md         # boundary/negative-input matrix; validation-gap definition
│       └── bug-reporting.md        # S1–S4 severity rubric, repro-step bar, evidence + dedupe rules
├── evals/
│   ├── evals.config.ts             # defineEvalConfig({ maxConcurrency: 4, timeoutMs: 120_000 })
│   ├── helpers/demo-target.ts      # spawn server.js with PORT=0, parse URL from stdout → { url, stop() }
│   ├── smoke-navigation.eval.ts    # mock: navigate → assert page observed
│   ├── finds-console-error.eval.ts # mock: click "Sort" → pageerror signal in tool output
│   ├── finds-network-failure.eval.ts # mock: click → 500 signal → report_bug → file exists on disk
│   ├── form-validation-gap.eval.ts # mock: fill empty title → report S3 → finalize
│   └── real-model-smoke.eval.ts    # tags: ["real-model"], timeoutMs 600_000; live charter run, ≥1 bug reported
├── demo-target/
│   ├── server.js                   # zero-dep node:http "Task Manager"; PORT=0 support; 5 seeded bugs
│   └── README.md                   # run instructions + spoiler list of seeded bugs for grading
└── reports/.gitkeep                # runs land at reports/<run-id>/{bugs/,evidence/,report.md,report.json,signals.jsonl}
```

No subagents, schedules, connections, hooks, sandbox override, or `channels/eve.ts` in v1 (default eve channel + `[vercelOidc(), localDev()]` auth applies without the file).

## Key designs

### Observation & targeting (public Playwright APIs only)
Every observing tool returns `page.ariaSnapshot({ mode: "ai" })` — YAML accessibility tree with `[ref=eN]` markers (truncated ~20k chars with a note). Interaction tools take `ref` + a human `element` description (feeds repro steps), resolved via `page.locator("aria-ref=" + ref)`; raw CSS `selector` escape hatch. Stale ref → caught error returning "page changed — call browser_snapshot and retry", a self-correcting loop.

### Signals (the QA differentiator)
`lib/signals.ts`: listeners attached once per page — `console` (error/warn), `pageerror`, `requestfailed`, `response` with status ≥ 400 → per-session ring buffer (cap 200) + append to `reports/<run>/signals.jsonl`. Every tool result drains the buffer and its `toModelOutput` text ends with a `signals since last action:` block. `execute` returns the structured object (eval matchers + mock responder inspect it); `toModelOutput` renders the model-facing text.

### Browser lifecycle
Module-scope lazy `chromium.launch({ headless: true })` singleton (safe: `eve dev`/`start` = one long-lived process; serverless caveat documented, not solved). Per-session `Map<ctx.session.id, SessionState>` holding context/page/targetOrigin/runId/buffers. `context.setDefaultTimeout(10_000)` / navigation 15s so no tool hangs a durable step. `withAction(ctx, ...)` honors `ctx.abortSignal` by closing the context (Playwright calls don't take signals). `finalize_session` closes context; `process.once` SIGINT/SIGTERM best-effort `browser.close()`. First `browser_navigate` locks the target origin in code (off-origin later navigations rejected) and derives run-id `<YYYYMMDD-HHmmss>-<session.id.slice(0,8)>`.

### Reporting
`report_bug` input: `{ title, severity: S1–S4, summary, reproSteps[], expected, actual, captureScreenshot=true }` → `bugs/NN-slug.md` (deterministic slug → durable-replay re-run overwrites, not duplicates) + `bugs.json` index + last ~10 signals embedded; optional screenshot to `evidence/`. `finalize_session` input `{ charter, summary, coverageNotes[], openQuestions[] }` → `report.md` (charter, tour log, bug table, coverage, questions) + `report.json`; returns paths so the final reply cites them. Screenshots always hit disk first — inline image parts are "look now" only (re-sent each call, dropped on compaction; viewport-only 1280×800 keeps them far under the 3 MiB warning).

### instructions.md outline (methodology lives in skills, loaded on demand)
Identity; inputs (URL + optional charter, else propose one); SBTM loop (restate charter → load `touring-heuristics`, pick 2–3 tours → explore in observe/act/read-signals cycles → load `form-probing` at forms → on any anomaly reproduce minimally, load `bug-reporting`, call `report_bug` immediately, never batch → `finalize_session` exactly once → reply citing paths); signal discipline (unexpected signal always investigated before moving on); targeting rules (refs from latest snapshot only; re-snapshot on stale); stop conditions (~40 actions, or two tours with no new findings); use built-in `todo` as the SBTM session sheet.

### Demo target seeded bugs (verifiable via curl or eval)
1. Console `TypeError` on "Sort" button (client). 2. Button fetching `/api/stats` → **500**. 3. Broken image (404 src). 4. Form accepts empty/whitespace task title (validation gap). 5. Nav link → 404 dead end.

### Deterministic evals (zero credentials)
Each eval spawns its own demo server (`PORT=0`, URL parsed from stdout, `stop()` in `finally`) — collision-free under concurrency. Prompts carry a directive (`[script: console-error-hunt] against <url>`); `mock-scripts.ts` parses it, counts `toolResults` to find the current step, extracts live refs from the previous snapshot output via `refFor(lastOutput, /button "Sort/)` matching `[ref=(e\d+)]` (searches `JSON.stringify(output)` so raw-vs-projected output shape doesn't matter; probe with `t.log` in eval 1), and emits the next scripted tool call — exercising the **real snapshot → ref → click → signal → report pipeline** end to end. Assertions: `t.toolOrder([...])`, `t.calledTool(name, { input, output: predicate })`, `t.noFailedActions()`, plus direct `node:fs` existence checks on report files.

## package.json essentials

```jsonc
{
  "name": "qa-agent-explore", "private": true, "type": "module",
  "engines": { "node": ">=24" },
  "imports": { "#*": "./agent/*", "#evals/*": "./evals/*" },
  "scripts": {
    "dev": "eve dev", "start": "eve start", "build": "eve build", "info": "eve info",
    "demo-target": "node demo-target/server.js",
    "typecheck": "tsc --noEmit",
    "eval": "QA_AGENT_MODEL=mock eve eval --strict --exclude-tag real-model",
    "eval:real": "eve eval --tag real-model"
  },
  "dependencies": {
    "eve": "0.29.4",            // exact pin — pre-1.0 API drift
    "ai": "^7.0.38", "zod": "4.4.3", "@vercel/connect": "0.4.3",  // scaffold parity
    "playwright": "1.61.1"      // exact pin — Chromium 1228 already cached (zero download); has ariaSnapshot mode:"ai"
  },
  "devDependencies": { "typescript": "match eve scaffold catalog", "@types/node": "^24" }
}
```

## Build order & gates

1. **Env**: `nvm use` (`.nvmrc`) → gate: `node --version` = v24.x. `git init` + initial commit after scaffold.
2. **Scaffold by hand** (avoids interactive `eve init`; template shape known exactly): config files, `agent/agent.ts`, `instructions.md`, stub `mock-scripts.ts` → `pnpm install` → gate: `npx eve --version` = 0.29.4.
3. **Demo target** → gates (curl): `/` contains "Task Manager"; `/api/stats` → 500; broken-image path → 404; dead-end link → 404.
4. **Browser lib + 9 tools + 6 disableTool files + 3 skills** → gates: `pnpm typecheck` clean; `npx eve info` lists all tools/skills, no diagnostics, built-ins gone.
5. **Mock scripts + 4 mock evals** → gate: `pnpm eval` exits 0 (transitively proves: Chromium launched from cache, signals captured, refs resolved, reports written).
6. **Real-model eval + README** → gates: `eve eval --list` discovers it; `pnpm eval` still green (tag-excluded). Document live recipe for Kiefer: `vercel login` → `eve link` (writes AI_GATEWAY_API_KEY to .env.local) → `pnpm demo-target` + `pnpm dev` → charter prompt → grade against spoiler README; optionally `pnpm eval:real`.

## Risks / gotchas

| Risk | Mitigation |
|---|---|
| Durable replay re-runs interrupted steps → double click/submit | Acceptable for exploratory testing; `report_bug` idempotent via deterministic filenames; `approval` gating noted for real destructive targets |
| Image parts re-sent every call / dropped on compaction | Viewport-only PNGs, screenshot opt-in per bug; disk copy is the durable artifact |
| Node 22 default vs eve's ≥24 | `.nvmrc` + engines + gate 1 |
| Mock `toolResults` output shape (raw vs projection) | `refFor` searches JSON.stringify; `t.log` probe in first eval |
| Stale aria-refs after DOM change | Caught error instructs re-snapshot |
| Eval port collisions (concurrency 8 default) | PORT=0 per-eval servers, `maxConcurrency: 4` |
| just-bash sandbox auto-install surprise | All sandbox built-ins disabled; static skills need no sandbox |
| Agent wanders off-target on live runs | Origin lock enforced in `browser_navigate` code |
| eve beta API drift | Exact pin; local clone at scratchpad is the API reference |
| Singleton browser vs serverless deploy | Documented v1 constraint (local-first project) |

## v2 (out of scope)

Per-tour subagents; `regression-check` schedule re-running saved charters; Vercel Sandbox/remote-CDP browser to lift the singleton constraint; Slack/GitHub channel posting reports; `t.judge.autoevals` grading of bug-report quality.
