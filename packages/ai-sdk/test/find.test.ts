import assert from "node:assert/strict";
import { test } from "node:test";
import { find, INJECT_CAP, plain } from "../src/find.ts";
import { tempMemory } from "./helpers.ts";

// The router's cases, carried over with their history: each one is a request that once loaded the wrong page.

function threePages() {
  const m = tempMemory();
  m.create("Cut a release of a Python package", "preparing a release: version bump, changelog, tag",
    "1. Bump version.\n2. Update CHANGELOG.\n3. Tag and push.");
  m.create("Fix a flaky test", "a test fails only sometimes in CI", "Run it 20 times; look for shared state.");
  m.create("Rotate an API key", "a credential leaked or expires", "Revoke first, then issue, then deploy.");
  return m;
}

const picked = (m: ReturnType<typeof tempMemory>, request: string) => find(request, m.all()).map((p) => p.id);

test("a request gets only the page that fits", () => {
  assert.deepEqual(picked(threePages(), "the CI test is flaky again, it fails sometimes"), ["fix-a-flaky-test"]);
});

test("an unrelated request loads nothing", () => {
  assert.deepEqual(picked(threePages(), "write a haiku about autumn"), []);
});

test("a request in Spanish finds a Spanish page", () => {
  const m = tempMemory();
  m.create("Preparar un release", "preparar un release: subir versión, changelog y tag", "Pasos.");
  assert.deepEqual(picked(m, "hay que preparar el release nuevo"), ["preparar-un-release"]);
});

test("a second large page does not fit the budget", () => {
  const m = tempMemory();
  for (let n = 0; n < 5; n++) m.create(`Deploy service ${n}`, "deploy the service to production", "x".repeat(6000));
  assert.equal(picked(m, "deploy the service to production").length, 1);
});

test("the best page comes whole even past the budget", () => {
  const m = tempMemory();
  m.create("Rehearse the demo and time it", "rehearsing the demo", "z".repeat(INJECT_CAP + 2000));
  assert.equal(picked(m, "rehearse the demo and time it").length, 1);
});

test("a word stem is enough for a lone page", () => {
  const m = tempMemory();
  m.create("Cut a versioned release of a small Python package", "asked to bump a version, update the changelog, commit and tag", "x");
  assert.equal(picked(m, "Release 0.3.0 with a new option").length, 1);
});

test("words that only start alike do not load", () => {
  const m = tempMemory();
  m.create("Check CI of the PRs, including stacked ones", "asked to review the CI checks of a PR", "gh pr checks.");
  m.create("Audit the register of the texts", "a label sounds colloquial («Cargando tus casos»)", "x");
  for (const r of ["Revisá el contrato con mi checklist", "arregla lo de la carga de checklist"]) {
    assert.deepEqual(picked(m, r), [], r);
  }
});

test("a single common word does not load", () => {
  const m = tempMemory();
  m.create("Plan the outreach in the forum", "posting in the community forum", "x");
  m.create("Ship the feature PR", "a feature is ready to merge", "y");
  assert.deepEqual(picked(m, "Plan the tiling for the room"), []);
});

test("harness notices are not requests", () => {
  const m = tempMemory();
  m.create("Change a function output", "change what a SQL function returns", "x");
  assert.deepEqual(picked(m, "<task-notification>\n<task-id>b1</task-id>\n<summary>output changed</summary>"), []);
});

test("file names and punctuation break into words", () => {
  const m = tempMemory();
  m.create("Revisar un contrato con tu checklist", "revisar un contrato de servicios o de locación", "x");
  assert.equal(picked(m, "Revisá contrato-servicios.md, represento al Proveedor.").length, 1);
});

test("inflected words count as the same word", () => {
  const m = tempMemory();
  m.create("Verify a source before publishing", "a source gives information for a story (a document, a quote, a tip) and it must be checked before it is published", "x", { id: "verify" });
  m.create("Review a contract against your checklist", "reviewing a contract or lease", "y", { id: "contract" });
  assert.equal(picked(m, "We got a tip about the water plant contract. Can we publish it?")[0], "verify");
  assert.equal(plain("published"), "publish");
  assert.equal(plain("publicado"), "public");
  assert.equal(plain("tip"), "tip");
});
