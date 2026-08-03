# qa-agent-explore

An exploratory-testing QA agent built on Vercel's [eve](https://github.com/vercel/eve)
framework. Give it a target URL (and optionally a charter), and it runs a
session-based test-management (SBTM) session in real headless Chromium —
navigating, clicking, filling forms — while capturing console errors, page
errors, network failures, and HTTP error responses that a plain accessibility
snapshot would never surface. Findings land as structured, reproducible bug
reports on disk.

## Why this exists

Most agentic browser tools give a model eyes (a snapshot) but not a nervous
system — they don't notice the console `TypeError` that fired silently after
a click, or the button that "worked" but the request behind it 500'd. This
agent's custom Playwright tools (`agent/tools/browser_*.ts`) wire up
`console`, `pageerror`, `requestfailed`, and `response` listeners so every
tool result carries a "signals since last action" block the model has to
read before deciding what to do next.

## Project layout

```
agent/
  agent.ts            model selection (mock vs live gateway model)
  instructions.md      always-on SBTM methodology
  lib/                 browser lifecycle, signal capture, reporting, mock scripts
  tools/                browser_* custom tools, report_bug, finalize_session
  skills/               touring-heuristics, form-probing, bug-reporting
evals/                 deterministic mock evals + one tagged real-model eval
demo-target/          zero-dependency "Task Manager" app with 5 seeded bugs
reports/<run-id>/      output of each session: bugs/, evidence/, report.md, report.json, signals.jsonl
```

## Quickstart (deterministic, zero credentials)

```bash
nvm use            # Node >=24 (.nvmrc)
pnpm install
pnpm typecheck
pnpm eval           # mock model, --strict, excludes the real-model eval
```

`pnpm eval` spawns its own demo-target server per eval, drives the real agent
runtime with a scripted `mockModel` responder, and asserts on the full
snapshot → ref → click → signal → report_bug pipeline — no API keys, no
network calls to a model provider.

## Live run (requires Vercel AI Gateway credentials)

1. `vercel login`
2. `eve link` — links this directory to a Vercel project and writes
   `AI_GATEWAY_API_KEY` into `.env.local`.
3. In one terminal: `pnpm demo-target` (prints the URL it bound to).
4. In another: `pnpm dev` — this opens eve's interactive terminal REPL.
   Give it the demo-target URL and, optionally, a charter.
5. Grade the run against `demo-target/README.md`'s spoiler list of seeded
   bugs.
6. Optionally, `pnpm eval:real` runs the tagged `real-model-smoke` eval
   against a live model (needs the same credentials; excluded from the
   default `pnpm eval`).

Note: `eve eval`/`eve dev` may print `[world-local] Queue message failed ...
socket hang up` lines after a run completes — that's the local dev server's
workflow queue tearing down, not an agent failure; check the actual eval
results/exit code instead.

## Demo target

`demo-target/server.js` is a zero-dependency `node:http` "Task Manager" app
with 5 deliberately seeded bugs, used both as the deterministic-eval fixture
and as the gradeable target for a live run. See `demo-target/README.md` for
the spoiler list.

## Scope

No subagents, schedules, connections, or `channels/eve.ts` override in v1 —
the default eve HTTP channel and its default auth apply as-is. Everything the
agent can do lives in `agent/tools/`; the framework's shell/file/fetch
built-ins are disabled (see `agent/tools/{bash,web_fetch,read_file,write_file,glob,grep}.ts`)
since this agent's job is driving a browser, not touching the filesystem or
network directly.
