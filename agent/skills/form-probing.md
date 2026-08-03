---
description: Use when you reach any form, input, or field before filling it in normally.
---

# Form probing

Before filling a form the "happy path" way, try at least one input from each
row below that plausibly applies to the field in front of you. You don't
need to try every row on every field — pick what's cheap and relevant, then
move on.

## Boundary / negative-input matrix

| Category | Try | What it exposes |
|---|---|---|
| Empty | Submit with the field blank | Missing required-field validation |
| Whitespace-only | A string of only spaces | Server/client trim-before-validate gaps |
| Boundary length | A single character; a very long string | Silent truncation, no max-length enforcement |
| Type mismatch | Letters in a numeric field, a malformed date | Weak client-side type coercion |
| Special characters | `<script>`, quotes, `&`, emoji | Unescaped rendering, injection surface |
| Duplicate submission | Submit the same value twice quickly | Missing idempotency/duplicate guard |
| Unicode / RTL | Non-Latin text, combining characters | Layout breakage, mojibake |

## Defining a validation gap

A validation gap is: the UI accepts an input as valid (no error shown, the
action completes) that a reasonable spec would reject — most commonly an
empty or whitespace-only required field getting silently accepted and
persisted. That's a real, reportable finding even though nothing throws or
errors: the actual behavior (accepted) contradicts the expected behavior
(rejected with a visible error). Frame it that way in `report_bug` — expected
"rejects and shows an error," actual "accepted and added to the list."

## After probing

Whatever you tried, take the next observation and check both the DOM state
(did a blank row appear in the list?) and the signals block (did the request
underneath fail silently, or succeed when it shouldn't have?) before moving
on.
