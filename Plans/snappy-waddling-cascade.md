# Plan: Build the QA Agent per `Plans/cozy-brewing-ocean.md`

## Context

`Plans/cozy-brewing-ocean.md` already contains a fully-designed spec for `qa-agent-explore` — an exploratory-testing QA agent built on Vercel's `eve` framework, decisions already confirmed with Kiefer (custom Playwright tools, AI Gateway for live runs, bundled buggy demo app as the gradeable target). The goal set for this session is to **implement** that plan. The repo (`~/Developer/qa_agent_explore`) is currently empty except for `Plans/`.

Before writing code I re-verified every environment/API claim in the source plan against the real, currently-published packages (not memory) — `eve` is beta (0.29.x) and API drift was called out as a real risk. This plan is the execution version of `cozy-brewing-ocean.md`: same design, one corrected package pin, plus the operational details needed to actually execute the build order without getting stuck.

## Verification performed this session

- Installed `eve@0.29.4`, `ai@^7.0.38`, `zod@4.4.3`, `@vercel/connect@0.4.3`, `playwright@1.61.1` into a scratch dir under Node 24 and read the *actual* shipped `node_modules/eve/docs/**`, not training memory.
- Confirmed against real docs: `defineTool`/`toolOutput`/`toolOutputPart`/`ctx.session`/`ctx.abortSignal` shape (`docs/tools/overview.mdx`); the 6 disable-able built-ins (`bash`, `read_file`, `write_file`, `glob`, `grep`, `web_fetch`) and `disableTool()` sentinel semantics (`docs/concepts/default-harness.md`); `mockModel` callback signature `{ lastUserMessage, userMessageCount, toolResults, ... }` returning `{ toolCalls }` (`docs/evals/overview.mdx`); the eval assertion surface `t.toolOrder`, `t.calledTool(name, { input, output, status, count })`, `t.noFailedActions()` (`docs/evals/assertions.mdx`); and the CLI flags `--tag`, `--exclude-tag`, `--strict`, `--max-concurrency`, `--timeout` (`docs/evals/running.mdx`). **All match the source plan exactly — no corrections needed there.**
- Confirmed Playwright's `page.ariaSnapshot({ mode: "ai" })` and the `aria-ref=` selector engine are real, current public APIs.
- **Correction found:** the source plan assumes Chromium is "already cached, zero-download" because `~/Library/Caches/ms-playwright` has a `1228`-revision entry. It does — but only `chromium_headless_shell-1228` (the shell-only build). Playwright's default `chromium.launch({ headless: true })` (no `channel` override, as the plan's `browser.ts` design uses) launches the **full** `chromium-1228` build, which is *not* cached and would trigger a ~300MB download on first run.
  - Fix: pin `playwright` to **`1.60.0`** instead of `1.61.1`. It bundles Chromium revision **1223**, and `chromium-1223` (the full, non-shell build) **is** already cached locally — genuinely zero-download. Verified `1.60.0` still ships `ariaSnapshot({ mode: "ai" })` and the `aria-ref=` selector, so nothing in the plan's design changes, only the version string.
- **Operational note (not a design change):** each Bash tool call starts a fresh shell — `nvm use` does not persist across tool calls the way it would in an interactive terminal. Every build/run command in this environment that needs Node ≥24 must explicitly `source ~/.nvm/nvm.sh && nvm use` (or invoke `~/.nvm/versions/node/v24.18.1/bin/node`/`corepack`/pnpm directly with that binary on `PATH`) in the same command. No shell profile hook auto-switches Node on `cd`.

## What we're building

Exactly what `cozy-brewing-ocean.md` specifies: `qa-agent-explore`, an eve agent that runs a session-based exploratory-testing loop (charter → tours/heuristics → observe-act-read-signals cycles → structured findings) against a target URL in real headless Chromium, driven by custom Playwright tools with full console/pageerror/network-failure capture, writing per-bug reports + a session summary to `reports/<run-id>/`. Deterministic `mockModel`-driven evals prove the pipeline end-to-end with zero credentials; a bundled deliberately-buggy demo Task Manager app (5 seeded bugs) is both the eval fixture target and the gradeable manual-run target.

## File tree

(unchanged from the source plan — reproduced here as the build checklist)

```
qa_agent_explore/
├── .nvmrc                          # 24
├── .gitignore                      # node_modules/, .eve/, .env*, reports/* (keep .gitkeep)
├── .env.example                    # QA_AGENT_MODEL, AI_GATEWAY_API_KEY, DEMO_TARGET_PORT
├── package.json
├── tsconfig.json                   # eve scaffold shape (strict, ES2022, bundler, noEmit; agent/ + evals/)
├── README.md                       # overview, quickstart, live-run recipe, demo walkthrough
├── AGENTS.md                       # points coding agents at node_modules/eve/docs
├── agent/
│   ├── agent.ts                    # QA_AGENT_MODEL switch: "mock" → mockModel(scriptedResponder) + modelContextWindowTokens: 1_000_000; else gateway id, default "anthropic/claude-sonnet-5"
│   ├── instructions.md             # lean always-on prompt (outline below)
│   ├── lib/
│   │   ├── browser.ts              # lazy singleton Chromium (plain chromium.launch, no channel override); per-session state keyed by ctx.session.id; abort handling
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
│   │                               # each `export default disableTool()` — no shell/sandbox for a browser QA agent
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

No subagents, schedules, connections, hooks, sandbox override, or `channels/eve.ts` in v1.

## Key designs (condensed — full rationale in `cozy-brewing-ocean.md`)

- **Observation & targeting:** every observing tool returns `page.ariaSnapshot({ mode: "ai" })` (truncated ~20k chars). Interaction tools take `ref` + human `element` description, resolved via `page.locator("aria-ref=" + ref)`; raw CSS `selector` escape hatch. Stale ref → caught error telling the model to re-snapshot.
- **Signals (the QA differentiator):** `lib/signals.ts` wires `console`/`pageerror`/`requestfailed`/`response ≥400` once per page into a per-session ring buffer (cap 200) + `signals.jsonl`. Every tool result's `toModelOutput` ends with a "signals since last action" block; `execute` returns the structured object for eval matchers.
- **Browser lifecycle:** module-scope lazy `chromium.launch({ headless: true })` singleton (no `channel` override — plain full Chromium, now correctly zero-download at the 1.60.0/1223 pin). Per-session `Map<ctx.session.id, SessionState>`; `setDefaultTimeout(10_000)`/nav 15s; `ctx.abortSignal` closes the context; first `browser_navigate` locks target origin and derives run-id.
- **Reporting:** `report_bug` → `bugs/NN-slug.md` (deterministic slug, idempotent) + `bugs.json` + embedded recent signals + optional screenshot. `finalize_session` → `report.md`/`report.json`, closes context, returns paths.
- **instructions.md:** identity → inputs (URL + optional charter) → SBTM loop (charter → `touring-heuristics` → 2–3 tours → observe/act/read-signals → `form-probing` at forms → any anomaly → `bug-reporting` → `report_bug` immediately, never batch → `finalize_session` exactly once) → signal discipline → targeting rules → stop conditions (~40 actions or 2 tours with no new findings) → use built-in `todo` as the SBTM session sheet.
- **Demo target's 5 seeded bugs:** console `TypeError` on "Sort"; button → `/api/stats` 500; broken image (404 src); empty/whitespace task title accepted; nav link → 404.
- **Deterministic evals:** each spawns its own `PORT=0` demo server; prompts carry a `[script: ...]` directive parsed by `mock-scripts.ts`, which extracts live refs from prior tool output via `refFor(lastOutput, /button "Sort/)` and scripts the next `toolCalls` — exercising the real snapshot → ref → click → signal → report pipeline. Assertions: `t.toolOrder`, `t.calledTool`, `t.noFailedActions`, plus `node:fs` checks on report files.

## package.json essentials (corrected)

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
    "eve": "0.29.4",             // exact pin — verified against real published docs this session
    "ai": "^7.0.38", "zod": "4.4.3", "@vercel/connect": "0.4.3",
    "playwright": "1.60.0"       // CORRECTED from 1.61.1 — pins Chromium 1223, the full build already cached locally (true zero-download); still has ariaSnapshot mode:"ai" + aria-ref
  },
  "devDependencies": { "typescript": "match eve scaffold catalog", "@types/node": "^24" }
}
```

## Build order & gates

Every command below runs in a **fresh shell per Bash call** — always start Node-version-sensitive commands with `source ~/.nvm/nvm.sh && nvm use` (reads `.nvmrc`) in the same invocation; don't rely on a prior call's `nvm use` persisting.

1. **Env & init:** write `.nvmrc` (`24`) → gate: `source ~/.nvm/nvm.sh && nvm use && node --version` = v24.x. `git init` + initial commit after scaffold.
2. **Scaffold by hand:** config files, `agent/agent.ts`, `instructions.md`, stub `mock-scripts.ts` → `pnpm install` → gate: `nvm use && npx eve --version` = 0.29.4.
3. **Demo target:** `demo-target/server.js` → gates (curl against `PORT=0`-reported URL): `/` contains "Task Manager"; the stats button's endpoint → 500; broken-image path → 404; dead-end nav link → 404.
4. **Browser lib + 9 tools + 6 disableTool files + 3 skills** → gates: `pnpm typecheck` clean; `nvm use && npx eve info` lists all tools/skills, no diagnostics, built-ins gone. First real Chromium launch here confirms the 1223 zero-download fix (no download progress bar / instant launch).
5. **Mock scripts + 4 mock evals** → gate: `nvm use && pnpm eval` exits 0 (transitively proves: Chromium launched from cache, signals captured, refs resolved, reports written to disk).
6. **Real-model eval + README** → gates: `eve eval --list` discovers `real-model-smoke`; `pnpm eval` still green (tag-excluded, no credentials needed). Document the live recipe for Kiefer: `vercel login` → `eve link` (writes `AI_GATEWAY_API_KEY` to `.env.local`) → `pnpm demo-target` + `pnpm dev` → charter prompt → grade against the demo's spoiler README; optionally `pnpm eval:real`.

## Risks / gotchas

Same table as `cozy-brewing-ocean.md`, plus:

| Risk | Mitigation |
|---|---|
| Chromium download surprise on first real launch | Fixed via the 1.60.0/rev-1223 pin — verified that exact revision is cached as a full (non-shell) build |
| `nvm use` not persisting across tool calls in this harness | Every Node≥24 command sources nvm and calls `nvm use` inline |
| (all risks from the source plan: durable replay double-actions, image parts on compaction, mock output-shape assumptions, stale refs, eval port collisions, sandbox built-ins, off-target wandering, eve beta API drift, singleton-vs-serverless) | Unchanged — see `cozy-brewing-ocean.md` § Risks |

## v2 (out of scope)

Unchanged: per-tour subagents; `regression-check` schedule; Vercel Sandbox/remote-CDP browser; Slack/GitHub channel posting; `t.judge.autoevals` grading of bug-report quality.

## Verification (end-to-end, once implemented)

1. `pnpm typecheck` — clean.
2. `nvm use && npx eve info` — all 9 custom tools + 3 skills listed, 6 built-ins disabled, no diagnostics.
3. `nvm use && pnpm eval` — all 4 mock evals pass (`--strict`), exit code 0; confirms real headless Chromium launches from cache with zero download, signals pipeline fires, `reports/<run-id>/` files land on disk.
4. `curl` checks against `pnpm demo-target` for all 5 seeded bugs (per gate 3 above).
5. Manual live-run walkthrough documented in README for Kiefer to execute himself (requires `vercel login`/`eve link` — not run automatically, no credentials on this machine).
