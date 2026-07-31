# Plan

Four milestones. Two are done, one is blocked on a measurement that came back
flat, and the one that justifies the repository has not started.

## M0 · Bet on the SDK — **done** (2026-07-28)

The repository stopped being a framework. The Claude Agent SDK supplies the
loop, the tools, context management, subagents, permissions, sessions and MCP;
none of that is reimplemented here. 10,165 lines were deleted with the
reasoning recorded in [`docs/WHAT-WAS-DELETED.md`](docs/WHAT-WAS-DELETED.md).

What ships is [`plugin/`](plugin/): an MCP server exposing agentvcs's tools to
the agent mid-loop, plus three hooks. The `PreCompact` one matters most — it is
the only point where trace fidelity is lost irrecoverably, because after
compaction the earlier turns exist only as a summary.

Worth recording why the bet was safe rather than fashionable: agentvcs's
`claude-code` trace provider already read the exact store the SDK writes
(`~/.claude/projects/<encoded-cwd>/<uuid>.jsonl`). Verified against a real
6,843-line transcript before a line was written.

**What it cost.** Two of this organisation's projects cannot follow.
`token-trie` masks logits and `sleep-harness` reads model activations; an
API-backed SDK exposes neither. They are not competing with the SDK — they are
on a different substrate, and no amount of refactoring makes them plug in. They
stay in their own repositories and are not part of this pitch.

## M1 · Merge across sessions — **not started, and the reason this repo exists**

`fork` branches a session. Nothing rejoins the branches.

agentvcs already merges its own commits across four dimensions, with a
`--reconcile` seam for the ones a text merge cannot resolve. What does not exist
is the adapter that turns two SDK session transcripts into something mergeable —
a session is an append-only event log, not a tree with a common ancestor.

**The hard part, stated honestly:** two forked sessions share a prefix, so the
common ancestor is findable and that is not the problem. The problem is what a
*conflict* is when both branches are conversations. Two different files edited is
easy. Two different conclusions reached about the same file is the interesting
case, and it is the one `--reconcile` exists for.

Sequence:

1. `avcs_diff` over two session IDs — the smallest useful thing, and it stands
   alone even if merge never ships.
2. A conflict model derived from real forked sessions, not designed ahead of
   them.
3. `avcs_merge` on top, reusing the existing `--reconcile` protocol.

## M2 · Structured memory — **runs now; still has no measured advantage**

The SDK loads memory from `.claude/` as flat markdown into context. No
confidence, no consolidation, no recall beyond what fits.

[`packages/memory/`](packages/memory/) is the layer above that. Two things that
were broken are fixed:

- `pyproject.toml` set `readme = "LICENSE"`, so `pip install` failed outright on
  a content-type error. It installs.
- The test that *demonstrates* the value passed or failed depending on
  `PYTHONHASHSEED`. The cause was a test double: a bag-of-words encoder whose
  docstring said "deterministic" while it bucketed words with `hash(word) % dim`,
  and Python randomises string hashing per process. Different buckets, different
  collisions, different cosine on every run. Now `crc32`, and all 171 tests pass
  identically under every seed.

That was a broken instrument, not evidence against the idea — worth separating,
because the benchmark is a different result and it stands: the dual-embedding
resolver measures **80% acc@1 against 80% for plain description matching**. No
difference. Both residual errors are within-domain confusions, which
applicability text cannot address.

So the honest position is that the memory story has a working mechanism and no
demonstrated advantage over the naive approach. Finding a case where the second
axis pays — the hypothesis predicts a smaller or older encoder, which is where
most of this organisation's other work lives — is the real work, and it has not
been done. Until it is, this is not the part of the repository to sell.

## M3 · CI — **done** (2026-07-28)

The repository had no workflows at all. It now runs every suite together on push
and pull request: 222 tests that had never executed in the same place.

## M4 · Distribution — **ready, one manual step outstanding**

Worth stating as a milestone because its absence was invisible for a year: the
flagship was never installable. `pip install agentvcs` returned 404 while the
package had 214 tests, a version number and a release workflow in the repository
it used to live in. Every reader who wanted to try it had to clone a monorepo
first, which is most of the distance between this repository's 452 stars and
agentvcs's one.

`release-agentvcs.yml` builds on a `agentvcs-v*` tag and refuses to publish
unless the wheel installs into an empty virtualenv, both console scripts start,
the MCP entrypoint imports, the dashboard's frontend is present in the wheel, and
pip resolved nothing outside the standard library.

What is not done: the Trusted Publisher has to be registered on PyPI once, by
hand, by someone with the account. Until then the workflow builds and stops.

## What is deliberately not planned

**Re-implementing anything the SDK does.** Tools, the loop, permissions,
subagent orchestration, context compaction. The moment one of those looks
tempting, re-read `docs/WHAT-WAS-DELETED.md` — every row is a thing this
organisation has already built at least twice.

**Reviving the SmartAgentBus.** A thousand lines of registry and routing welded
to MongoDB, solving a problem MCP now owns. Recorded as dropped rather than left
silent, so nobody re-derives it a third time.
