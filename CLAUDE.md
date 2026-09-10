@AGENTS.md

## Quickstart (deterministic, zero credentials)

nvm use            # Node >=24 (.nvmrc)
pnpm install
pnpm test          # typecheck + mock evals (preferred; equivalent to `pnpm eval`)

`pnpm test` (and `pnpm eval`) runs `tsc --noEmit` first, then the mock-model eval suite, so both
type-safety and agent behavior are gated by one command. The mock eval spawns
its own demo-target server per eval, drives the real agent runtime with a
scripted `mockModel` responder, and asserts on the full
snapshot → ref → click → signal → report_bug pipeline — no API keys, no
network calls to a model provider.