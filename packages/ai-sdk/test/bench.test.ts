import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { MockLanguageModelV4 } from "ai/test";
import type { Experimental_SandboxSession as SandboxSession } from "@ai-sdk/provider-utils";
import { loadCase, runOnce, sandboxTools, type Row } from "../src/bench.ts";
import { arms, cheapest, render } from "../src/report.ts";

const RELEASE = join(dirname(fileURLToPath(import.meta.url)), "..", "cases", "release");

/** A stand-in for Vercel Sandbox on a temporary folder: `/tmp/work` and `/tmp/case` are mapped under it. Only the
 * scripted model below ever drives it, never a real one. */
function fakeSandbox(): SandboxSession {
  const root = mkdtempSync(join(tmpdir(), "director-sb-"));
  const map = (s: string) => s.replaceAll("/tmp/work", `${root}/work`).replaceAll("/tmp/case", `${root}/case`);
  return {
    description: "a test sandbox",
    run: async ({ command, workingDirectory }: { command: string; workingDirectory?: string }) => {
      const cwd = workingDirectory ? map(workingDirectory) : root;
      try {
        const stdout = execSync(map(command), { cwd: existsSync(cwd) ? cwd : root, encoding: "utf8", stdio: "pipe" });
        return { exitCode: 0, stdout, stderr: "" };
      } catch (e) {
        const err = e as { status?: number; stdout?: string; stderr?: string };
        return { exitCode: err.status ?? 1, stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
      }
    },
    readTextFile: async ({ path }: { path: string }) => (existsSync(map(path)) ? readFileSync(map(path), "utf8") : null),
    writeTextFile: async ({ path, content }: { path: string; content: string }) => {
      mkdirSync(dirname(map(path)), { recursive: true });
      writeFileSync(map(path), content);
    },
  } as unknown as SandboxSession;
}

const usage = {
  inputTokens: { total: 100, noCache: 100, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 10, text: 10, reasoning: undefined },
};
const call = (command: string) => ({
  content: [{ type: "tool-call" as const, toolCallId: "c1", toolName: "run", input: JSON.stringify({ command }) }],
  finishReason: { unified: "tool-calls" as const, raw: undefined }, usage, warnings: [],
  providerMetadata: { gateway: { cost: "0.0010" } },
});
const done = {
  content: [{ type: "text" as const, text: "Released." }], finishReason: { unified: "stop" as const, raw: undefined },
  usage, warnings: [], providerMetadata: { gateway: { cost: "0.0005" } },
};

test("a run that does the release the house way is judged good, from git and the tests", async () => {
  const sb = fakeSandbox();
  await sb.writeTextFile({ path: "/tmp/case/solve.py", content: readFileSync(join(RELEASE, "solve.py"), "utf8") });
  const model = new MockLanguageModelV4({ doGenerate: [call("python3 /tmp/case/solve.py /tmp/work"), done] });
  const row = await runOnce(loadCase(RELEASE), { model, modelId: "mock/solver", knowHow: true, sandbox: sb });
  assert.equal(row.verdict, "g", row.missed.join(", "));
  assert.equal(row.steps, 2);
  assert.deepEqual(row.tokens, { input: 200, output: 20 });
  assert.equal(row.costUsd, 0.0015);
  const system = model.doGenerateCalls[0]!.prompt.filter((m) => m.role === "system").map((m) => m.content).join("\n");
  assert.match(system, /greet X\.Y\.Z/, "with the know-how, the case's piece reaches the model");
});

test("a run that does nothing fails, and without the know-how the piece never reaches the model", async () => {
  const model = new MockLanguageModelV4({ doGenerate: [done] });
  const row = await runOnce(loadCase(RELEASE), { model, modelId: "mock/idle", knowHow: false, sandbox: fakeSandbox() });
  assert.equal(row.verdict, "f");
  assert.ok(row.missed.includes("tag v0.3.0"));
  const system = model.doGenerateCalls[0]!.prompt.filter((m) => m.role === "system").map((m) => m.content).join("\n");
  assert.doesNotMatch(system, /greet X\.Y\.Z/);
});

test("the file tools stay inside the project folder", async () => {
  const tools = sandboxTools(fakeSandbox());
  const out = await tools.write_file.execute!({ path: "../escape.txt", content: "x" }, { toolCallId: "t", messages: [], context: {} });
  assert.match(String(out), /outside the project folder/);
});

test("the report names the cheapest model that matches the best success", () => {
  const row = (model: string, knowHow: boolean, verdict: Row["verdict"], costUsd: number | null): Row => ({
    case: "release", model, knowHow, verdict, score: 1, missed: [], steps: 3, durationS: 10,
    tokens: { input: 1, output: 1 }, costUsd, note: "", at: "",
  });
  const rows = [
    row("big", true, "g", 0.05), row("big", true, "g", 0.05),
    row("small", true, "g", 0.002), row("small", true, "g", 0.002),
    row("small", false, "c", 0.002), row("small", false, "f", 0.002),
  ];
  const a = arms(rows);
  assert.equal(a.find((x) => x.model === "small" && !x.knowHow)?.success, 0);
  assert.equal(cheapest(a).release?.model, "small");
  assert.match(render(rows), /cheapest that matches the best: small with the know-how \(US\$0\.0020\/run\)/);
});
