/**
 * The router: which pages of the memory reach the model for one request. The memory as a whole is never pasted in:
 * the best page comes whole, and a runner-up only when it scores close to it and fits the budget.
 *
 * Ranking is lexical and deterministic. A page earns the weight of each request token found in its title or "when",
 * and a quarter of that for tokens found only in its body; rarer tokens weigh more. A page is kept only when it also
 * shares real words with the request (not only prefixes): two of them, or one long word no other title has.
 */

import { render, type Page } from "./memory.ts";

export const INJECT_CAP = 8000;   // characters of pages added to one request (the best page is exempt)
export const TOP_K = 2;
export const RUNNER_UP = 0.5;     // a second page needs at least half the best page's score
export const MIN_SCORE = 1.2;
const STEM = 5;
const ONE_WORD_DF = 1;

const STOP = new Set(`
  a about after again all also an and any are as at be been before being but by can could did do does done down each
  else for from had has have he here how i if in into is it its just may me might more most must my no not of off on
  only or other our out over own same shall she should so some such than that the their them then there these they
  this those to too up very was we were what when where which who whom why will with would yes you your
  al como cómo con cual cuál cuando cuándo de del donde dónde el en entonces es esa ese eso esta este estas estos fue
  hay la las le les lo los me mis mi más menos muy nos o para pero por porque que qué se ser si sin sobre son su sus
  te tu tus un una unas unos y ya`.split(/\s+/).filter(Boolean));

const fold = (t: string) => t.normalize("NFKD").replace(/[^\x00-\x7f]/g, "");
const STOP_PLAIN = new Set([...STOP].map(fold));

/** Whole words for the exact match: punctuation and file names split, accents dropped. */
export function words(text: string): Set<string> {
  return new Set((fold(text.toLowerCase()).match(/[a-z0-9]{3,}/g) ?? []).filter((w) => !STOP_PLAIN.has(w)));
}

/** Stemmed tokens for scoring. */
export function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-záéíóúñü0-9_.-]{3,}/g) ?? []).filter((t) => !STOP.has(t)).map((t) => t.slice(0, STEM));
}

const ENDINGS = ["ings", "ing", "ed", "es", "s", "ados", "adas", "ado", "ada", "ar", "er", "ir"];

/** A word without an ending that only inflects it: "published" → "publish", "publicado" → "public". */
export function plain(w: string): string {
  for (const e of ENDINGS) if (w.endsWith(e) && w.length - e.length >= 4) return w.slice(0, -e.length);
  return w;
}

const baseWords = (t: string) => new Set([...words(t)].map(plain));
const head = (p: Page) => `${p.title} ${p.when}`;
const NOT_A_REQUEST = /^\s*<(task-notification|system-reminder|agent-message)[\s>]/;

function intersect<T>(a: Set<T>, b: Set<T>): Set<T> {
  return new Set([...a].filter((x) => b.has(x)));
}

/** Every page that clears the bar, best first (ties by id, so the order never depends on the folder's). */
export function rank(request: string, pages: Page[]): Array<[number, Page]> {
  const asked = new Set(tokens(request));
  if (!asked.size || !pages.length || NOT_A_REQUEST.test(request)) return [];
  const heads = pages.map((p) => new Set(tokens(head(p))));
  const bodies = pages.map((p) => new Set(tokens(p.body)));
  const headWords = pages.map((p) => baseWords(head(p)));
  const titleWords = pages.map((p) => baseWords(p.title));
  const weight = (t: string) =>
    Math.log(1 + pages.length / (1 + heads.filter((h, i) => h.has(t) || bodies[i]!.has(t)).length)) + 1;
  const titlesWith = (w: string) => titleWords.filter((t) => t.has(w)).length;
  const requestWords = baseWords(request);
  const kept: Array<[number, Page]> = [];
  pages.forEach((p, i) => {
    const inHead = intersect(asked, heads[i]!);
    const onlyInBody = [...intersect(asked, bodies[i]!)].filter((t) => !heads[i]!.has(t));
    const score = [...inHead].reduce((s, t) => s + weight(t), 0) + 0.25 * onlyInBody.reduce((s, t) => s + weight(t), 0);
    const same = intersect(requestWords, headWords[i]!);
    const sameEnough = same.size >= 2 ||
      [...intersect(same, titleWords[i]!)].some((w) => w.length >= 5 && titlesWith(w) <= ONE_WORD_DF);
    if (inHead.size && score >= MIN_SCORE && sameEnough) kept.push([score, p]);
  });
  return kept.sort((a, b) => b[0] - a[0] || a[1].id.localeCompare(b[1].id));
}

/** The pages to load for this request, within the budget. */
export function find(request: string, pages: Page[]): Page[] {
  const ranked = rank(request, pages);
  const chosen: Page[] = [];
  let used = 0;
  for (const [score, page] of ranked.slice(0, TOP_K)) {
    if (chosen.length && score < RUNNER_UP * ranked[0]![0]) break;
    const size = render(page).length;
    if (chosen.length && used + size > INJECT_CAP) break;
    chosen.push(page);
    used += size;
  }
  return chosen;
}
