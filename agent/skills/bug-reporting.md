---
description: Use before calling report_bug, to pick a severity and check the finding is reproducible and non-duplicate.
---

# Bug reporting

## Severity rubric

- **S1** — blocks a core flow entirely, no workaround (the page can't
  complete its main purpose).
- **S2** — a feature is broken or gives wrong results, but the app is
  otherwise usable (a wrong calculation, a button that silently no-ops).
- **S3** — a real defect with a workaround or narrow trigger (a validation
  gap, an edge case, a broken secondary link).
- **S4** — cosmetic or purely informational (a typo, a misaligned element,
  a console warning with no user-visible effect).

When unsure between two levels, pick the lower one and say why in the
summary — don't inflate severity to make a finding feel more important.

## The repro-step bar

Before calling `report_bug`, you must be able to state the *minimal* steps
that trigger it — not everything you happened to do, just what's necessary.
If you're not sure it's minimal, that's fine; reproduce it once more with
fewer steps if it's cheap to check, otherwise report what you have rather
than delaying the finding.

Write `reproSteps` as imperative, numbered actions a human could follow
without you present ("Click the Sort button", not "I clicked sort and it
broke").

## Evidence

`report_bug` auto-attaches the last ~10 signals and takes a screenshot by
default — you don't need to call `browser_screenshot` separately unless you
want an additional shot at a different moment. Pass `captureScreenshot:
false` only when a screenshot would add nothing (e.g. a pure console signal
with no visual counterpart).

## Dedupe

Before reporting, check whether this is the same underlying defect as one
you already reported this session (same root cause, different trigger path)
— if so, don't file a duplicate; note the additional trigger in your session
summary at `finalize_session` instead. A different title always produces a
new report, so keep titles for the same defect consistent if you reference
it again.
