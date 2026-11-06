/**
 * `withDirector(model, memory)`: any AI SDK language model, with the team's know-how in front of it. On every call the
 * middleware reads the last user message, finds the pages it needs, and adds them as a system message before it.
 * Which pages were added is reported through `onLoaded`, so a ledger can record what each run had.
 */

import { wrapLanguageModel, type LanguageModel, type LanguageModelMiddleware } from "ai";
import { find } from "./find.ts";
import type { Memory, Page } from "./memory.ts";
import { instructionsFor } from "./skills.ts";

export interface DirectorOptions {
  /** Called with the pages added to a call (possibly none). */
  onLoaded?: (pages: Page[]) => void;
}

type Prompt = Parameters<NonNullable<LanguageModelMiddleware["transformParams"]>>[0]["params"]["prompt"];

function lastUserText(prompt: Prompt): string {
  for (let i = prompt.length - 1; i >= 0; i--) {
    const m = prompt[i]!;
    if (m.role === "user") return m.content.map((part) => (part.type === "text" ? part.text : "")).join(" ").trim();
  }
  return "";
}

export function directorMiddleware(memory: Memory, opts: DirectorOptions = {}): LanguageModelMiddleware {
  return {
    transformParams: async ({ params }) => {
      const request = lastUserText(params.prompt);
      const pages = request ? find(request, memory.all()) : [];
      opts.onLoaded?.(pages);
      if (!pages.length) return params;
      for (const p of pages) memory.touch(p.id);
      const at = params.prompt.findLastIndex((m) => m.role === "user");
      const prompt = [...params.prompt];
      prompt.splice(at, 0, { role: "system", content: instructionsFor(pages) });
      return { ...params, prompt };
    },
  };
}

export function withDirector(model: Exclude<LanguageModel, string>, memory: Memory, opts: DirectorOptions = {}) {
  return wrapLanguageModel({ model: model as Parameters<typeof wrapLanguageModel>[0]["model"], middleware: directorMiddleware(memory, opts) });
}
