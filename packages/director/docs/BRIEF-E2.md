# BRIEF-E2 · Is there room? A release case on three Gateway models, without the know-how

**Status:** briefed 2026-11-06, not run. Part of [packages/ai-sdk/PLAN.md](../../ai-sdk/PLAN.md), phase E2.

## What and why

Before the know-how is measured on AI SDK agents (E3), one arm checks whether the case leaves anything to fix. A case
the cheapest model already passes every time cannot show what the know-how adds. Every arm would tie, and a tie reads
as a success. That is how C0, D0O and PG stopped.

- **Case:** `packages/ai-sdk/cases/release`. A small Python package at 0.2.0, already released once "the house way".
- **Request:** "Release 0.3.0 with a new name_upper option for greet() that uppercases the name."
- **House conventions the check looks for:** an annotated tag `v0.3.0` with message `greet 0.3.0`, the commit
  `release 0.3.0`, the version in both files, the changelog entry on top with older entries kept, a test for the new
  option, and a clean tree.
- **No know-how in this arm.** The previous release in the repository's own history shows the conventions, so a careful
  model can infer them. Whether it does is exactly the question.

## How

- **Instrument:** `director bench cases/release --models … --arms without --runs 3`.
- **The model:** works through the AI SDK (`generateText`, four tools: run, read, edit and write a file), stops after
  20 steps at most.
- **Where it runs:** each run gets a fresh **Vercel Sandbox** (`python3.13`). Setup, the model's commands and the check
  all run there.
- **The verdict:** `check.py` reads git, the files and the tests. **g** = everything, **c** = released but a convention
  missed, **f** = no tag, failing tests or the option not working.

| model (AI Gateway) | why | list price (in / out, US$ per 1M) |
|---|---|---|
| `deepseek/deepseek-v4-flash` | cheapest open-weights model with tool use | 0.13 / 0.26 |
| `openai/gpt-6-luna` | cheapest closed model | 0.10 / 0.50 |
| `anthropic/claude-sonnet-5.5` | frontier reference | 2 / 10 |

3 runs each, 9 in all.

## Verdict table (fixed before the run)

| result | reading | next |
|---|---|---|
| both cheap models 3/3 **g** | no room: the cheapest model already does the house way | replace the case with a harder one (one whose conventions the history does not show), E3 waits |
| a cheap model ≤ 2/3 **g** | room: something to measure | E3 on this case, with and without the know-how |
| Sonnet ≤ 1/3 **g** too | the conventions are not inferable from the repository | E3 still runs; say so, since the know-how is then the only source |

One seed of 3 runs per model is a headroom check, not a measurement of any model's quality.

## Cost and stopping condition

- **Estimate:** under US$1.50. Sonnet is about US$0.25 per run, the cheap models well under a cent. Vercel Sandbox
  time is billed separately by Vercel.
- **Cap: US$5.** `--max-usd 5` stops the bench before a run once the Gateway cost reaches it. A model that reports no
  cost stops the bench too.

## Result

Not run yet. It needs `AI_GATEWAY_API_KEY` and Vercel Sandbox credentials from the person.
