/**
 * What the bench says, per case: for each model, with and without the know-how, the runs, how many passed (g), were
 * done with a convention missed (c) or failed (f), the median time and the cost; and the cheapest model whose success
 * with the know-how matches the best one seen on that case.
 */

import type { Row } from "./bench.ts";

export interface Arm {
  case: string;
  model: string;
  knowHow: boolean;
  runs: number;
  g: number;
  c: number;
  f: number;
  success: number;
  medianS: number | null;
  costUsd: number | null;
  costPerRun: number | null;
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function arms(rows: Row[]): Arm[] {
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const k = JSON.stringify([r.case, r.model, r.knowHow]);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return [...groups.values()].map((rs) => {
    const known = rs.map((r) => r.costUsd).filter((x): x is number => x !== null);
    const cost = known.length === rs.length ? known.reduce((a, b) => a + b, 0) : null;
    const g = rs.filter((r) => r.verdict === "g").length;
    return {
      case: rs[0]!.case, model: rs[0]!.model, knowHow: rs[0]!.knowHow, runs: rs.length, g,
      c: rs.filter((r) => r.verdict === "c").length, f: rs.filter((r) => r.verdict === "f").length,
      success: g / rs.length, medianS: median(rs.map((r) => r.durationS)), costUsd: cost,
      costPerRun: cost === null ? null : cost / rs.length,
    };
  }).sort((a, b) => a.case.localeCompare(b.case) || a.model.localeCompare(b.model) || Number(b.knowHow) - Number(a.knowHow));
}

/** Per case, the cheapest model with the know-how whose success equals the best success seen on the case. */
export function cheapest(all: Arm[]): Record<string, Arm | null> {
  const out: Record<string, Arm | null> = {};
  for (const name of new Set(all.map((a) => a.case))) {
    const mine = all.filter((a) => a.case === name);
    const best = Math.max(...mine.map((a) => a.success));
    const candidates = mine.filter((a) => a.knowHow && a.success === best && best > 0 && a.costPerRun !== null);
    out[name] = candidates.sort((a, b) => a.costPerRun! - b.costPerRun!)[0] ?? null;
  }
  return out;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const usd = (x: number | null) => (x === null ? "cost unknown" : `US$${x.toFixed(4)}/run`);

export function render(rows: Row[]): string {
  const a = arms(rows);
  const lines: string[] = [];
  for (const name of new Set(a.map((x) => x.case))) {
    lines.push(name);
    for (const x of a.filter((y) => y.case === name)) {
      lines.push(`  ${x.model.padEnd(36)} ${x.knowHow ? "with   " : "without"}  ${x.g}g ${x.c}c ${x.f}f of ${x.runs}` +
        `  success ${pct(x.success).padStart(4)}  median ${x.medianS ?? "—"} s  ${usd(x.costPerRun)}`);
    }
    const best = cheapest(a)[name];
    lines.push(best ? `  cheapest that matches the best: ${best.model} with the know-how (${usd(best.costPerRun)})`
      : "  cheapest that matches the best: none yet (no passing run with a known cost)");
  }
  return lines.join("\n");
}
