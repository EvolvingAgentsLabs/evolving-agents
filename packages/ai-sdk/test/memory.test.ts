import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { parse, render, slugify, statements } from "../src/memory.ts";
import { tempMemory } from "./helpers.ts";

const PAGE = `## #bump_both
**When:** about to release.
**Do:** change the version in \`package.json\` and in \`src/version.ts\`.
**Because:** a release once shipped with the two out of step.
**Links:** [[release#changelog]] · [[tag-it]]

## #changelog
**When:** the version is bumped.
**Do:** add the entry on top, keep the older ones.
**Because:** an agent once replaced the previous entry.`;

test("a page reads back exactly as it was written", () => {
  const m = tempMemory();
  const p = m.create("Release the package", "releasing: version bump, changelog: tag", PAGE, {
    projects: ["web", "api"], origin: { platform: "person" },
  });
  const back = parse(render(p));
  assert.deepEqual(back, p);
  assert.equal(back.when, "releasing: version bump, changelog: tag");
});

test("statements carry when, do, because and their links", () => {
  const [first, second] = statements(parse(render(tempMemory().create("R", "r", PAGE))));
  assert.equal(first?.id, "bump_both");
  assert.match(first!.do, /package\.json/);
  assert.deepEqual(first!.links, ["release#changelog", "tag-it"]);
  assert.equal(second?.because, "an agent once replaced the previous entry.");
});

test("every change keeps the previous version, and a revert can itself be undone", () => {
  const m = tempMemory();
  const p = m.create("Release", "releasing", "v1 body");
  const v2 = m.update(p.id, { note: "keep older entries", body: "v2 body", origin: { platform: "ai-sdk", model: "m" } });
  assert.equal(v2.version, 2);
  assert.ok(existsSync(join(m.dir, ".history", p.id, "v1.md")));
  assert.match(v2.history[0]!, /^v2 \d{4}-\d{2}-\d{2} \(ai-sdk, m\): keep older entries$/);
  const v3 = m.revert(p.id);
  assert.equal(v3.body, "v1 body");
  assert.equal(v3.version, 3);
  assert.equal(m.revert(p.id).body, "v2 body");
});

test("ids are slugs and never collide", () => {
  const m = tempMemory();
  assert.equal(slugify("Ship it: v2.0 (now)!"), "ship-it-v2-0-now");
  assert.equal(m.create("Same", "a", "x").id, "same");
  assert.equal(m.create("Same", "b", "y").id, "same-2");
  assert.equal(m.all().length, 2);
  assert.match(readFileSync(join(m.dir, "same-2.md"), "utf8"), /^---\nid: same-2\n/);
});

test("a missing page is null, and changing it is an error", () => {
  const m = tempMemory();
  assert.equal(m.get("nope"), null);
  assert.throws(() => m.update("nope", { note: "x" }), /no page nope/);
  const p = m.create("Once", "o", "x");
  assert.throws(() => m.revert(p.id), /no earlier version/);
});
