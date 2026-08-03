# demo-target: Task Manager

A zero-dependency `node:http` app with 5 deliberately seeded bugs. It's both
the deterministic-eval fixture (each eval spawns its own instance) and the
gradeable target for a live agent run.

## Run it

```bash
pnpm demo-target
```

Binds to `DEMO_TARGET_PORT` (or `PORT`), defaulting to `0` (an OS-assigned
free port) — the actual URL is printed to stdout on startup.

## Spoiler: the 5 seeded bugs

Don't read this before grading a QA session against the app.

1. **Console `TypeError` on "Sort"** — the Sort button's click handler calls
   `.sortItems()` on a `NodeList`, which doesn't exist. Throws an uncaught
   exception every time.
2. **`/api/stats` → 500** — the "Show stats" button calls this endpoint,
   which always crashes server-side (dereferences a property on
   `undefined`) and returns HTTP 500.
3. **Broken image** — the header logo (`/img/logo.png`) 404s; no such route
   or file exists.
4. **Form validation gap** — "Add a task" accepts an empty or
   whitespace-only title with no client- or server-side check, and adds it
   to the list as a blank row.
5. **Dead-end nav link** — the "Archive" nav link points to `/archive`,
   which 404s.
