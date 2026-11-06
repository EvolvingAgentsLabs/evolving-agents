# agentvcs self-test — for a Claude Code agent

You are a Claude Code agent. This guide has you **verify, on your own live runtime,
that the agentvcs integration delivers real improvements** — not by reading claims,
but by running it and inspecting what it surfaces about *your* session. If
everything checks out, you'll help update the README / docs / video.

Read this top to bottom, then do the steps. It is self-contained; you don't need
any prior conversation.

---

## What you're testing (the premise in 4 lines)

agentvcs is a version-control + runtime-visibility layer that sits *beside* your
runtime (Claude Code), not inside it. It claims to give you four things your
closed runtime does **not**:

1. **Runtime visibility** — your exact token budget, **dollar** cost vs a ceiling,
   context-window pressure + compaction count, model routing, tool usage, and
   subagent fan-out — reconstructed from your own session log.
2. **An eval/score gate** — `freeze` refuses to crystallize a solution that hasn't
   passed a declared check, so a "frozen recipe" is a *proven* one.
3. **Recall** — "have I solved this before?" ranks frozen, verified recipes so you
   can `replay` a known-good solution for ~$0 instead of re-deriving it.
4. **Cross-runtime neutrality** — the same pipeline works for a qwen-code session,
   proving it isn't tied to Claude Code.

Your job: confirm each one is real, and judge whether the value is genuine.

---

## Before you run

Do a *little* real work in this session first (read a couple of files, make an
edit — anything), so your live transcript has substance. The live-session checks
in section [1] measure whatever you've actually done this session.

`agentvcs` is run from source (not pip-installed). The harness handles that for
you. If you ever invoke it by hand, the form is:

```bash
PYTHONPATH=/path/to/agentvcs/src python3.12 -m agentvcs.cli <command>
```

## Step 1 — run the harness

From the agentvcs project directory (must be under the dir Claude Code was launched
in, so the trace provider can find your session):

```bash
bash selftest/selftest.sh
```

It runs six blocks and prints `PASS` / `FAIL` / `WARN` per check, then a verdict.

- `FAIL` in blocks [2]–[6] is a real problem — those are deterministic.
- `WARN` in block [1] usually just means your live session was thin when you ran
  it. Do more work and re-run; it should turn into `PASS`.

## Step 2 — look at your own hidden frame (the qualitative check)

Block [1] prints **your runtime frame**. Actually read it. Ask yourself, honestly:

- Did Claude Code ever tell you the **dollar cost** of this session? agentvcs just did.
- Did you know how **full your context window** was, or how many times it was
  **compacted** (history silently dropped)? It's there now.
- If you spawned subagents, did your runtime show you the **fan-out**? Check the
  `subagents` line.

These are the "real improvements." If the numbers look plausible and tell you
something you genuinely couldn't see before, that's the win.

**Known limitation to expect:** if `context` shows **>100%**, that's not a bug in
the math — it means your model's context-window size isn't in the default table
(e.g. Opus's 1M variant reports its model id without the `[1m]` suffix in the
transcript, so it falls back to 200k). It's configurable per repo:
`"budget": {"windows": {"opus": 1000000}}` in `agent.json`. Note it as a doc item,
not a failure.

## Step 3 — exercise the trust loop yourself (optional but convincing)

The harness does this in a sandbox, but you can feel it directly:

```bash
A() { PYTHONPATH=/path/to/agentvcs/src python3.12 -m agentvcs.cli "$@"; }
cd selftest/.sandbox/evalgate
A show              # see the eval verdict + crystal on the verified commit
A recall "add"      # the verified recipe comes back, flagged ✓verified
A replay --json | python3 -m json.tool | head -20   # the deterministic recipe
cd -
```

## Step 3.5 — try to break it (be adversarial)

Don't just confirm the happy path. Spend a few minutes trying to make it lie:

- Declare an eval that flakes (`"command": "python3 -c 'import random,sys;
  sys.exit(random.randint(0,1))'", "runs": 5`) and confirm `freeze` refuses it —
  `ok` requires **all** runs to pass.
- `freeze --force` past a failing eval and confirm the recipe is honestly marked
  `verified: false`, and that `recall --verified-only` then excludes it.
- Point the claude-code trace at a transcript containing a fake secret
  (`sk-ant-...`) and confirm it's `[REDACTED]` in `show --trace`.
- Commit twice without changing anything and confirm the commit/runtime objects
  dedup (same content → same id).

Note anything that surprises you. A finding here is more valuable than another
green check.

## Step 4 — fill in the verdict

| Capability | Result | Real value you observed (one line) |
|---|---|---|
| [1] Runtime visibility (budget/$/context/routing/tools/subagents) | PASS/WARN/FAIL | |
| [2] Eval gate blocks unproven freeze | PASS/FAIL | |
| [2] Passing eval → recipe marked verified | PASS/FAIL | |
| [3] Recall returns verified recipe / honest miss | PASS/FAIL | |
| [4] Replay emits deterministic recipe | PASS/FAIL | |
| [5] Cross-runtime (qwen-code) parity | PASS/FAIL | |
| [6] Unit suite green | PASS/FAIL | |
| Adversarial attempts (step 3.5) | held / found: … | |

## Step 5 — decide

- **All deterministic blocks PASS and the live frame shows real, useful numbers**
  → tell the human it's verified, and propose concrete README / docs / video
  updates (what to show, in what order — lead with the runtime frame against the
  agent's own session, then the eval→freeze→recall trust loop).
- **Any FAIL** → do *not* touch the docs. Report which check failed, paste the
  failing command's output, and stop.

Be skeptical and concrete. The point is to find out whether this is genuinely
better, not to confirm that it is.

---

### Cleanup

```bash
rm -rf selftest/.sandbox
```
(The sandbox is gitignored, so leaving it won't dirty the repo.)
