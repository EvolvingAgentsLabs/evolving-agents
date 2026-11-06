/**
 * `bench`: the same task on several models, with and without the team's know-how, judged by what the run left behind.
 *
 * A case is a folder: `case.json` (title, when, request), `piece.md` (the know-how), `setup.py <dir>` (builds a fresh
 * workspace) and `check.py <dir>` (prints `{"verdict": "g|c|f", "score": 0..1, "missed": [...]}`). The verdict comes
 * from git, the files and the tests, never from the model's own word.
 *
 * Every run gets its own sandbox: the case is set up there, the model works there through four tools (run a command,
 * read, edit and write a file), and the check runs there. With Vercel Sandbox nothing the model runs touches the
 * machine that started the bench.
 */

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateText, stepCountIs, tool, type LanguageModel } from "ai";
import type { Experimental_SandboxSession as SandboxSession } from "@ai-sdk/provider-utils";
import { z } from "zod";
import { Memory } from "./memory.ts";
import { withDirector } from "./middleware.ts";

export const WORK = "/tmp/work";
const CASE = "/tmp/case";
const OUTPUT_LIMIT = 4000;

export interface Case {
  name: string;
  dir: string;
  title: string;
  when: string;
  request: string;
  piece: string;
  maxSteps?: number;
}

export interface Verdict {
  verdict: "g" | "c" | "f";
  score: number;
  missed: string[];
}

export interface Row extends Verdict {
  case: string;
  model: string;
  knowHow: boolean;
  steps: number;
  durationS: number;
  tokens: { input: number; output: number };
  costUsd: number | null;
  note: string;
  at: string;
}

export function loadCase(dir: string): Case {
  const meta = JSON.parse(readFileSync(join(dir, "case.json"), "utf8"));
  return { name: dir.split("/").filter(Boolean).at(-1)!, dir, ...meta, piece: readFileSync(join(dir, "piece.md"), "utf8") };
}

const clip = (t: string) => (t.length <= OUTPUT_LIMIT ? t : `${t.slice(0, OUTPUT_LIMIT)}\n… (${t.length - OUTPUT_LIMIT} more chars)`);

function inside(path: string): string {
  const abs = path.startsWith("/") ? path : `${WORK}/${path}`;
  const parts: string[] = [];
  for (const p of abs.split("/")) {
    if (p === "..") parts.pop();
    else if (p && p !== ".") parts.push(p);
  }
  const norm = `/${parts.join("/")}`;
  if (norm !== WORK && !norm.startsWith(`${WORK}/`)) throw new Error(`${path} is outside the project folder`);
  return norm;
}

/** The model's four tools, each executed in the sandbox and confined to the workspace. Errors come back as text, so
 * one bad call never ends the task. */
export function sandboxTools(sb: SandboxSession) {
  const safe = <A,>(fn: (a: A) => Promise<string>) => async (a: A) => {
    try {
      return await fn(a);
    } catch (e) {
      return `error: ${(e as Error).message}`;
    }
  };
  return {
    run: tool({
      description: "Run a shell command in the project folder; returns its exit code and output.",
      inputSchema: z.object({ command: z.string() }),
      execute: safe(async ({ command }) => {
        const r = await sb.run({ command, workingDirectory: WORK });
        return clip(`exit code ${r.exitCode}\n${r.stdout}${r.stderr}`);
      }),
    }),
    read_file: tool({
      description: "Read a file of the project.",
      inputSchema: z.object({ path: z.string() }),
      execute: safe(async ({ path }) => {
        const t = await sb.readTextFile({ path: inside(path) });
        return t === null ? `no file ${path}` : clip(t);
      }),
    }),
    edit_file: tool({
      description: "Replace one exact piece of text in a file, keeping the rest. Use it to change or add to an existing file.",
      inputSchema: z.object({ path: z.string(), old: z.string(), new: z.string() }),
      execute: safe(async ({ path, old, new: replacement }) => {
        const p = inside(path);
        const text = (await sb.readTextFile({ path: p })) ?? "";
        const n = old ? text.split(old).length - 1 : 0;
        if (n !== 1) return `error: the old text must appear exactly once in ${path}; it appears ${n} times`;
        await sb.writeTextFile({ path: p, content: text.replace(old, replacement) });
        return `edited ${path}`;
      }),
    }),
    write_file: tool({
      description: "Write a whole new file of the project (replaces it if it exists).",
      inputSchema: z.object({ path: z.string(), content: z.string() }),
      execute: safe(async ({ path, content }) => {
        await sb.writeTextFile({ path: inside(path), content });
        return `wrote ${path}`;
      }),
    }),
  };
}

const SYSTEM = `You do one task in the project folder ${WORK}, using the tools. Today is {today}. Look at the files before \
changing them. Change only what the task needs. When the task is done, reply with a short summary and no tool call.`;

async function upload(sb: SandboxSession, c: Case): Promise<void> {
  for (const f of ["setup.py", "check.py"]) {
    await sb.writeTextFile({ path: `${CASE}/${f}`, content: readFileSync(join(c.dir, f), "utf8") });
  }
}

export async function check(sb: SandboxSession): Promise<Verdict> {
  const r = await sb.run({ command: `python3 ${CASE}/check.py ${WORK}` });
  try {
    return JSON.parse(r.stdout.trim().split("\n").at(-1)!);
  } catch {
    return { verdict: "f", score: 0, missed: [`check failed: ${r.stderr.slice(-300)}`] };
  }
}

function gatewayCost(meta: unknown): number | null {
  const cost = (meta as { gateway?: { cost?: string | number } } | undefined)?.gateway?.cost;
  const n = typeof cost === "string" ? Number.parseFloat(cost) : cost;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

export interface RunOptions {
  model: Exclude<LanguageModel, string>;
  modelId: string;
  knowHow: boolean;
  sandbox: SandboxSession;
}

/** One run: set the case up in the sandbox, let the model work, check what it left. */
export async function runOnce(c: Case, o: RunOptions): Promise<Row> {
  let note = "";
  let steps = 0;
  let tokens = { input: 0, output: 0 };
  let costUsd: number | null = null;
  await upload(o.sandbox, c);
  const setup = await o.sandbox.run({ command: `rm -rf ${WORK} && python3 ${CASE}/setup.py ${WORK}` });
  if (setup.exitCode !== 0) throw new Error(`setup failed: ${setup.stderr.slice(-300)}`);
  const tmp = mkdtempSync(join(tmpdir(), "director-bench-"));
  const t0 = performance.now();                       // the model's time only, not the case's setup
  try {
    let model = o.model;
    if (o.knowHow) {
      const memory = new Memory(tmp);
      memory.create(c.title, c.when, c.piece);
      model = withDirector(o.model, memory);
    }
    const r = await generateText({
      model,
      system: SYSTEM.replace("{today}", new Date().toISOString().slice(0, 10)),
      prompt: c.request,
      tools: sandboxTools(o.sandbox),
      stopWhen: stepCountIs(c.maxSteps ?? 20),
    });
    steps = r.steps.length;
    tokens = { input: r.totalUsage.inputTokens ?? 0, output: r.totalUsage.outputTokens ?? 0 };
    const costs = r.steps.map((s) => gatewayCost(s.providerMetadata));
    costUsd = costs.every((x) => x === null) ? null : costs.reduce<number>((a, x) => a + (x ?? 0), 0);
  } catch (e) {
    note = `${(e as Error).name}: ${(e as Error).message}`.slice(0, 200);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  const durationS = Math.round((performance.now() - t0) / 100) / 10;
  const v = await check(o.sandbox);
  return {
    case: c.name, model: o.modelId, knowHow: o.knowHow, ...v, steps, durationS, tokens, costUsd, note,
    at: new Date().toISOString(),
  };
}
