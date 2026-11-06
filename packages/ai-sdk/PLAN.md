# The director for the Vercel AI SDK: plan

**Status, 2026-11-06:** E0 and E1 built (#207). The E3 code is also built: the middleware, the skills for
`HarnessAgent`, the bench on Vercel Sandbox and its report, all tested against a scripted model. Nothing has been
measured on a real model yet: E2 ([BRIEF-E2](../director/docs/BRIEF-E2.md)) waits for the Gateway and Sandbox
credentials. Every claim a phase makes is marked **[ran]** only once it has run.

**Found while building it [read]:** AI SDK 7 ships `HarnessAgent`. It runs Claude Code, Codex, OpenCode, Cursor,
Copilot, Pi and others in a sandbox, and accepts `skills` (name, description, content). The SDK gives teams the runtime
and the slot for skills, but nothing decides which skills a request needs, where they come from, whether they help a
given harness and model, or how they improve after a correction. That is the layer this package fills, so a page of
the memory is also a `HarnessAgent` skill (`skillsFor(memory, request)`).

## What it is

The director moves to the platform most TypeScript agents are built on. Your team's know-how lives as linked
statements in markdown (**When / Do / Because / Links**), versioned, readable and reversible. An AI SDK agent receives
only the statements its request needs. Every claim is checked by a verifier that reads what the run left behind (git,
tests, files), never the model's own word. Models are reached through **Vercel AI Gateway**.

The question it answers is the one teams actually pay for:

> **Which is the cheapest model that does *our* task right, and what does our know-how add to it?**

## Why this shape, from what we already measured

- With a frontier planner, the memory adds little to rule-following. Opus alone follows D0's rules 0.964 of the time
  ([D0O](../director/docs/BRIEF-D0O.md)), and with the director it gains +0.05 on a thread of days
  ([C2](../director/docs/BRIEF-C2.md)). We say so up front.
- Where the know-how pays is what a model cannot know: house conventions, privacy rules, methods learned the hard way.
  It pays most on **smaller, cheaper models**, which miss those conventions without it. That is the effect to measure
  here, per model, with and without the know-how.
- The verifier comes first. A number that a model reports about itself is not a measurement.

## What carries over, and what is new

| | from | in the AI SDK package |
|---|---|---|
| Memory as linked statements, a version per change, revert | the director's pages and gate | `memory`: markdown in `.director/` inside the repo, shared by the team through git |
| Find the statements a request needs | the director's walk | `find`: a lexical router, with an optional router on a decision model (`experimental_decide`), each measured before it is trusted |
| Put the know-how in front of the model | the plugin's hooks | `withDirector(model)`: AI SDK middleware; `skillsFor(memory, request)`: the same pages as `HarnessAgent` skills; later, an MCP server for any MCP client |
| Learn from a correction, only with a yes | the gated lesson | `learn`: drafts a statement from the correction and checks it against the existing ones; nothing is kept without approval |
| A verdict from the result itself | the briefs' judges | `bench`: the same task on several Gateway models, with and without the know-how, checked by the case's own `check` script |
| What each piece and each model brings | — | `ledger` + `report`: tasks, verdicts, time, tokens and cost per statement and per model; the cheapest model that matches the best |
| Which change moved the result | agentvcs `blame` | later, over statement versions, once there is enough marked data |

Left out on purpose: local models on the user's machine (the platform is the cloud), per-editor plugins, and any UI
beyond a report.

## Phases

Each phase can stop the ones after it. Stopping conditions are written here before the runs. As for every run in this
lab, a phase that calls a model gets its `packages/director/docs/BRIEF-<ID>.md` first, with its cap.

| | step | cost | how we will know |
|---|---|---|---|
| E0 | **Repository ready.** A TypeScript workspace (`packages/ai-sdk`), CI, no personal data in the repository. | US$0 | CI green on `main` |
| E1 | **Memory and find in TypeScript.** Pages, statements, links, versions and revert; the lexical router with its tests. | US$0 | The same page parses the same way, and the router passes its fixture cases |
| E2 | **Headroom first.** One case (a release with house conventions, checked by its script), on 3 Gateway models from cheap to frontier, **without** the know-how, 3 runs each. | ≤ US$5 | If even the cheapest model already passes 3/3 without help, the case is replaced before anything is built on it |
| E3 | **The middleware and the bench.** `withDirector(model)` and `bench` with and without the know-how, on the same models, 5 runs per arm. | ≤ US$20 | Positive if a cheaper model with the know-how matches the frontier model's success; flat results are published too |
| E4 | **A decision model as router.** `find` on `experimental_decide` against the lexical router, on the same routing cases. | ≤ US$5 | Kept only if it beats the lexical router on hit@1 without adding wrong loads |
| E5 | **Learn from a correction**, and the report. One correction, then the next run passes without it. | ≤ US$10 | The corrected convention holds in the next 3 runs; the statement is readable and reversible |
| E6 | **Package and docs.** `npm i`, a two-minute quickstart, the measured numbers in the README. | — | Someone outside the lab installs it and runs the bench on their own case |

## Out of scope for now

- A pull-request review bot. It is a different product, with permissions over other people's repositories.
- Native bindings of agentvcs for Node. The Rust core stays as it is; the package records its own versions until
  attribution needs it.
- Team sync. Sharing statements across a team goes through git first.
