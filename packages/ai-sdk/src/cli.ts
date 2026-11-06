#!/usr/bin/env node
/**
 * director bench <case-dir> --models a,b [--runs 3] [--arms with,without] --max-usd 5 [--out results.jsonl]
 * director report [--out results.jsonl]
 *
 * Models are AI Gateway ids (`openai/gpt-5-mini`, `anthropic/claude-sonnet-4.6`, …), read with AI_GATEWAY_API_KEY.
 * Each run gets a fresh Vercel Sandbox (VERCEL_OIDC_TOKEN, or VERCEL_TOKEN + VERCEL_TEAM_ID + VERCEL_PROJECT_ID).
 * Runs are interleaved (run 1 of every model and arm, then run 2…) so a slow minute hurts every arm alike, every row
 * is appended to the results file as it lands, and the bench stops before a run once the spend reaches --max-usd.
 */

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { gateway } from "ai";
import { loadCase, runOnce, type Row } from "./bench.ts";
import { render } from "./report.ts";

const HELP = `usage:
  director bench <case-dir> --models a,b --max-usd N [--runs 3] [--arms with,without] [--out results.jsonl]
  director report [--out results.jsonl]`;

function readRows(file: string): Row[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as Row);
}

async function sandbox() {
  const { Sandbox } = await import("@vercel/sandbox");
  const { createVercelSandboxSessionFromNativeSandbox } = await import("@ai-sdk/sandbox-vercel");
  const native = await Sandbox.create({ runtime: "python3.13", timeout: 15 * 60 * 1000 });
  return { session: createVercelSandboxSessionFromNativeSandbox(native), stop: () => native.stop() };
}

async function bench(caseDir: string, o: { models: string[]; runs: number; arms: boolean[]; maxUsd: number; out: string }) {
  const c = loadCase(caseDir);
  let spent = 0;
  for (let i = 1; i <= o.runs; i++) {
    for (const modelId of o.models) {
      for (const knowHow of o.arms) {
        if (spent >= o.maxUsd) {
          console.log(`stopped: US$${spent.toFixed(4)} spent, the cap is US$${o.maxUsd}`);
          return;
        }
        const sb = await sandbox();
        let row: Row;
        try {
          row = await runOnce(c, { model: gateway(modelId), modelId, knowHow, sandbox: sb.session });
        } finally {
          await sb.stop();
        }
        appendFileSync(o.out, JSON.stringify(row) + "\n");
        if (row.costUsd === null) {
          console.log(`stopped: ${modelId} reported no cost, so the cap cannot be enforced`);
          return;
        }
        spent += row.costUsd;
        console.log(`${i}/${o.runs} ${modelId.padEnd(36)} ${knowHow ? "with   " : "without"} ${row.verdict} (${row.score}) ` +
          `${row.durationS} s US$${row.costUsd.toFixed(4)}` + (row.missed.length ? `  missed: ${row.missed.join(", ")}` : "") +
          (row.note ? `  [${row.note}]` : ""));
      }
    }
  }
  console.log(`done: US$${spent.toFixed(4)} spent`);
}

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv, allowPositionals: true,
    options: {
      models: { type: "string" }, runs: { type: "string", default: "3" }, arms: { type: "string", default: "with,without" },
      "max-usd": { type: "string" }, out: { type: "string", default: "bench-results.jsonl" }, help: { type: "boolean" },
    },
  });
  const [cmd, caseDir] = positionals;
  if (values.help || !cmd) {
    console.log(HELP);
    return 0;
  }
  if (cmd === "report") {
    console.log(render(readRows(values.out!)));
    return 0;
  }
  if (cmd === "bench" && caseDir && values.models && values["max-usd"]) {
    const arms = values.arms!.split(",").map((a) => a.trim() === "with");
    await bench(caseDir, {
      models: values.models.split(",").map((m) => m.trim()), runs: Number(values.runs), arms,
      maxUsd: Number(values["max-usd"]), out: values.out!,
    });
    return 0;
  }
  console.error(HELP);
  return 1;
}

main(process.argv.slice(2)).then((code) => process.exit(code), (e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
