/**
 * The memory as AI SDK skills. A page becomes one skill (`name`, `description`, `content`), in the shape `HarnessAgent`
 * takes in its `skills` setting, so Claude Code, Codex, OpenCode or any other AI SDK harness gets the same know-how.
 * `skillsFor` gives only the pages a request needs; `allSkills` gives every page, for harnesses that discover skills
 * on demand by their description.
 */

import { find } from "./find.ts";
import type { Memory, Page } from "./memory.ts";

export interface Skill {
  name: string;
  description: string;
  content: string;
}

export function toSkill(p: Page): Skill {
  return {
    name: p.id,
    description: `${p.title}. Use when: ${p.when}`,
    content: `# ${p.title}\n\n${p.body.trim()}\n`,
  };
}

export function skillsFor(memory: Memory, request: string): Skill[] {
  return find(request, memory.all()).map(toSkill);
}

export function allSkills(memory: Memory): Skill[] {
  return memory.all().map(toSkill);
}

/** The pages as one block of instructions, for a plain model call (no harness). Empty when nothing applies. */
export function instructionsFor(pages: Page[]): string {
  if (!pages.length) return "";
  const blocks = pages.map((p) => `## ${p.title} (\`${p.id}\`, v${p.version})\nUse when: ${p.when}\n\n${p.body.trim()}`);
  return "Your team's know-how for this request. Follow it unless the request says otherwise.\n\n" +
    blocks.join("\n\n");
}
