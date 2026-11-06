import assert from "node:assert/strict";
import { test } from "node:test";
import { generateText } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { withDirector } from "../src/middleware.ts";
import { skillsFor, toSkill } from "../src/skills.ts";
import { tempMemory } from "./helpers.ts";

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 5, text: 5, reasoning: undefined },
};

function mock() {
  return new MockLanguageModelV4({
    doGenerate: async () => ({ content: [{ type: "text", text: "ok" }], finishReason: { unified: "stop", raw: undefined }, usage, warnings: [] }),
  });
}

function releaseMemory() {
  const m = tempMemory();
  m.create("Release the greet package", "releasing a new version: version bump, changelog entry, tag",
    "## #tag\n**When:** the release commit is in.\n**Do:** annotated tag `vX.Y.Z` with message `greet X.Y.Z`.\n**Because:** the house convention.");
  m.create("Rotate an API key", "a credential leaked or expires", "Revoke first.");
  return m;
}

test("the matching page reaches the model as a system message before the request", async () => {
  const model = mock();
  let loaded: string[] = [];
  await generateText({ model: withDirector(model, releaseMemory(), { onLoaded: (ps) => (loaded = ps.map((p) => p.id)) }),
    prompt: "Release 0.3.0 with a new option" });
  const sent = model.doGenerateCalls[0]!.prompt;
  const system = sent.filter((m) => m.role === "system").map((m) => m.content).join("\n");
  assert.match(system, /greet X\.Y\.Z/);
  assert.doesNotMatch(system, /Revoke first/);
  assert.equal(sent.at(-1)!.role, "user");
  assert.deepEqual(loaded, ["release-the-greet-package"]);
});

test("a request no page fits goes through unchanged", async () => {
  const model = mock();
  await generateText({ model: withDirector(model, releaseMemory()), prompt: "write a haiku about autumn" });
  assert.equal(model.doGenerateCalls[0]!.prompt.filter((m) => m.role === "system").length, 0);
});

test("pages become harness skills, only the ones a request needs", () => {
  const m = releaseMemory();
  const skills = skillsFor(m, "release 0.4.0");
  assert.deepEqual(skills.map((s) => s.name), ["release-the-greet-package"]);
  const s = toSkill(m.get("rotate-an-api-key")!);
  assert.equal(s.description, "Rotate an API key. Use when: a credential leaked or expires");
  assert.match(s.content, /^# Rotate an API key\n\nRevoke first\.\n$/);
});
