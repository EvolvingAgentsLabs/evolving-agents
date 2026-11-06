/**
 * The memory: one markdown page per way of working, kept in a folder the team versions with git (`.director/` by
 * default). A page has a small frontmatter and a body of statements, the smallest unit a verifier can check:
 *
 *     ---
 *     id: release-the-package
 *     title: Release the package
 *     when: releasing a new version: version bump, changelog entry, tag
 *     version: 2
 *     ---
 *     ## #bump_both
 *     **When:** about to release.
 *     **Do:** change the version in `package.json` and in `src/version.ts`.
 *     **Because:** a release once shipped with the two out of step.
 *     **Links:** [[release-the-package#changelog]]
 *
 *     ## History
 *     - v2 2026-11-06 (ai-sdk, openai/gpt-5-mini): the changelog keeps older entries
 *     - v1 2026-11-05 (person): created
 *
 * Every change keeps the previous file under `.history/<id>/v<n>.md`, so nothing is overwritten silently and any
 * version can come back.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface Origin {
  platform?: string;
  model?: string;
  [key: string]: string | undefined;
}

export interface Page {
  id: string;
  title: string;
  when: string;
  body: string;
  projects: string[];
  created: string;
  lastUsed: string;
  origin: Origin;
  version: number;
  history: string[];
}

export interface Statement {
  id: string;
  when: string;
  do: string;
  because: string;
  links: string[];
}

const ID_MAX = 60;
const NEEDS_QUOTES = /[:#[\]{},"]/;
const KEY_LINE = /^(\s*)([A-Za-z_][\w-]*):\s*(.*)$/;
const HISTORY_LINE = /^## History\s*$/m;
const STATEMENT = /^## #([a-z0-9][a-z0-9_-]*)\s*$/gm;
const FIELD = /^\*\*(When|Do|Because|Links):\*\*\s*(.*)$/gm;
const LINK = /\[\[([^\]]+)\]\]/g;
export const INDEX_NAME = "Index.md";

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** A filename-safe id: lowercase ASCII letters and digits joined by single dashes, at most 60 characters. */
export function slugify(text: string): string {
  const dashed = (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).join("-");
  return dashed.slice(0, ID_MAX).replace(/^-+|-+$/g, "") || "page";
}

// ------------------------------------------------------------------------------------------------- frontmatter
function scalar(raw: string): string {
  const v = raw.trim();
  const quoted = v.length > 1 && (v[0] === '"' || v[0] === "'") && v.at(-1) === v[0];
  return quoted ? v.slice(1, -1).replaceAll('\\"', '"') : v;
}

function quote(v: string): string {
  const risky = !v || v.trim() !== v || NEEDS_QUOTES.test(v);
  return risky ? `"${v.replaceAll('"', '\\"')}"` : v;
}

type Field = string | string[] | Record<string, string>;

/** Split a document into its frontmatter fields and its body; a document without frontmatter gives `[{}, text]`.
 * Only the shapes this package writes are understood: `key: value`, `key: [a, b]`, and one nested mapping level. */
export function parseFrontmatter(text: string): [Record<string, Field>, string] {
  if (!text.startsWith("---")) return [{}, text];
  const close = text.indexOf("\n---", 3);
  if (close === -1) return [{}, text];
  const header = text.slice(3, close).replace(/^\n+|\n+$/g, "");
  const body = text.slice(close + 4).replace(/^\n+/, "");
  const fields: Record<string, Field> = {};
  let mapping: Record<string, string> | null = null;
  for (const line of header.split("\n")) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const m = KEY_LINE.exec(line);
    if (!m) continue;
    const [, indent, key, value] = m as unknown as [string, string, string, string];
    if (indent && mapping) mapping[key] = scalar(value);
    else if (value === "") fields[key] = mapping = {};
    else if (value.startsWith("[") && value.endsWith("]")) {
      fields[key] = value.slice(1, -1).split(",").filter((x) => x.trim()).map(scalar);
      mapping = null;
    } else {
      fields[key] = scalar(value);
      mapping = null;
    }
  }
  return [fields, body];
}

function str(f: Field | undefined): string {
  return typeof f === "string" ? f : "";
}

export function parse(text: string): Page {
  const [fields, rest] = parseFrontmatter(text);
  const heading = HISTORY_LINE.exec(rest);
  const body = (heading ? rest.slice(0, heading.index) : rest).trimEnd();
  const changelog = heading ? rest.slice(heading.index + heading[0].length) : "";
  const history = changelog.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("- ")).map((l) => l.slice(2));
  const projects = fields.projects;
  const origin = fields.origin;
  return {
    id: str(fields.id),
    title: str(fields.title),
    when: str(fields.when),
    body,
    projects: Array.isArray(projects) ? projects : typeof projects === "string" && projects ? [projects] : [],
    created: str(fields.created),
    lastUsed: str(fields.last_used),
    origin: origin && typeof origin === "object" && !Array.isArray(origin) ? origin : {},
    version: Number.parseInt(str(fields.version), 10) || 1,
    history,
  };
}

/** The markdown file for a page: the inverse of `parse`. */
export function render(p: Page): string {
  const origin = Object.entries(p.origin).map(([k, v]) => `  ${k}: ${quote(String(v ?? ""))}`);
  const lines = [
    "---",
    `id: ${p.id}`,
    `title: ${quote(p.title)}`,
    `when: ${quote(p.when)}`,
    `projects: [${p.projects.join(", ")}]`,
    `created: ${p.created}`,
    `last_used: ${p.lastUsed}`,
    "origin:",
    ...(origin.length ? origin : ["  platform: unknown"]),
    `version: ${p.version}`,
    "---",
    "",
    p.body.trimEnd(),
    "",
    "## History",
    ...p.history.map((h) => `- ${h}`),
  ];
  return lines.join("\n") + "\n";
}

/** The statements of a page, in order. A page written as plain steps has none and is read as one block. */
export function statements(p: Page): Statement[] {
  const heads = [...p.body.matchAll(STATEMENT)];
  return heads.map((h, i) => {
    const end = i + 1 < heads.length ? heads[i + 1]!.index : p.body.length;
    const chunk = p.body.slice(h.index + h[0].length, end);
    const f: Record<string, string> = {};
    for (const m of chunk.matchAll(FIELD)) f[m[1]!.toLowerCase()] = m[2]!.trim();
    return {
      id: h[1]!,
      when: f.when ?? "",
      do: f.do ?? "",
      because: f.because ?? "",
      links: [...(f.links ?? "").matchAll(LINK)].map((m) => m[1]!),
    };
  });
}

// ------------------------------------------------------------------------------------------------- the store
export interface Change {
  note: string;
  body?: string;
  title?: string;
  when?: string;
  origin?: Origin;
}

export class Memory {
  readonly dir: string;

  constructor(dir = ".director") {
    this.dir = dir;
  }

  private file(id: string): string {
    return join(this.dir, `${id}.md`);
  }

  private historyDir(id: string): string {
    return join(this.dir, ".history", id);
  }

  all(): Page[] {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir)
      .filter((f) => f.endsWith(".md") && f !== INDEX_NAME)
      .sort()
      .map((f) => parse(readFileSync(join(this.dir, f), "utf8")));
  }

  get(id: string): Page | null {
    const f = this.file(id);
    return existsSync(f) ? parse(readFileSync(f, "utf8")) : null;
  }

  private write(p: Page): void {
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.file(p.id), render(p));
  }

  private archive(p: Page): void {
    const d = this.historyDir(p.id);
    mkdirSync(d, { recursive: true });
    copyFileSync(this.file(p.id), join(d, `v${p.version}.md`));
  }

  private freeId(wanted: string): string {
    let id = wanted;
    for (let n = 2; existsSync(this.file(id)); n++) id = `${wanted}-${n}`;
    return id;
  }

  create(title: string, when: string, body: string, opts: { id?: string; projects?: string[]; origin?: Origin } = {}): Page {
    const origin = opts.origin ?? {};
    const p: Page = {
      id: this.freeId(opts.id ?? slugify(title)),
      title, when, body,
      projects: opts.projects ?? [],
      created: today(),
      lastUsed: today(),
      origin,
      version: 1,
      history: [`v1 ${today()} (${where(origin)}): created`],
    };
    this.write(p);
    return p;
  }

  /** A new version of a page; the one it replaces is archived first. */
  update(id: string, change: Change): Page {
    const old = this.require(id);
    this.archive(old);
    const origin = change.origin ?? old.origin;
    const p: Page = {
      ...old,
      body: change.body ?? old.body,
      title: change.title ?? old.title,
      when: change.when ?? old.when,
      lastUsed: today(),
      version: old.version + 1,
      history: [`v${old.version + 1} ${today()} (${where(origin)}): ${change.note}`, ...old.history],
    };
    this.write(p);
    return p;
  }

  /** Put back the previous version, as a new version (so the revert itself can be undone). */
  revert(id: string): Page {
    const cur = this.require(id);
    const prev = join(this.historyDir(id), `v${cur.version - 1}.md`);
    if (!existsSync(prev)) throw new Error(`${id} has no earlier version`);
    const back = parse(readFileSync(prev, "utf8"));
    return this.update(id, { note: `reverted to v${back.version}`, body: back.body, title: back.title, when: back.when });
  }

  /** Mark a page as used today, without a new version. */
  touch(id: string): void {
    const p = this.get(id);
    if (p && p.lastUsed !== today()) this.write({ ...p, lastUsed: today() });
  }

  private require(id: string): Page {
    const p = this.get(id);
    if (!p) throw new Error(`no page ${id}`);
    return p;
  }
}

function where(origin: Origin): string {
  return `${origin.platform ?? "unknown"}, ${origin.model ?? "unknown"}`;
}
