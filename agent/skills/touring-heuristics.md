---
description: Use when starting a new tour or deciding what to explore next in an exploratory-testing session.
---

# Touring heuristics

Turn a charter into a short, deliberate tour plan instead of clicking at random.

## SFDIPOT coverage

Before picking tours, sanity-check the charter against these dimensions. You
don't need a tour per dimension — just notice which ones the charter already
covers and which it's silent on:

- **Structure** — what's on the page: forms, nav, lists, media.
- **Function** — what actions are available: add, sort, filter, submit.
- **Data** — what data flows through: task titles, IDs, stats, empty states.
- **Interfaces** — how the UI talks to the backend: which clicks fire
  requests, and what those requests return.
- **Platform** — viewport, browser quirks (out of scope for a single headless
  Chromium session, but note it if the charter implies otherwise).
- **Operations** — how a real user would actually use this, versus how a
  developer tested it.
- **Time** — ordering, races, what happens on repeated or rapid actions.

## Tour catalog

Pick 2–3 tours that fit the charter. Don't run all of them every session.

- **Feature tour** — exercise every visible feature once: every button,
  every form, every link. Good default when the charter is broad.
- **Data tour** — follow one piece of data through the system: create it,
  see where it's displayed, see what reads/derives from it (a stats
  endpoint, a count, a filter).
- **Landmark tour** — visit every distinct page/state reachable from nav and
  links; note anything that doesn't land where its label implies.
- **Money tour** — do whatever the app's core value proposition is, the
  thing a user actually came here to do, end to end.
- **Back-alley tour** — try the parts a demo walkthrough would skip: nav
  links to secondary pages, secondary buttons, anything that looks
  half-finished.
- **Intellectual tour** — read every label, tooltip, and status message and
  check it against what the UI actually does; mismatches are bugs even when
  nothing crashes.

## Turning a plan into action

For each chosen tour, write one line to the `todo` list before you start
acting ("Feature tour: exercise nav, add-task form, sort, stats button").
Then work it in observe → act → read-signals cycles per the main
instructions. When a tour surfaces nothing new, mark it done and move to the
next; two tours in a row with nothing new is a stop condition.
