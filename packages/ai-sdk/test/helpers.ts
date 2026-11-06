import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after } from "node:test";
import { Memory } from "../src/memory.ts";

/** A memory in its own temporary folder, removed when the test file ends. */
export function tempMemory(): Memory {
  const dir = mkdtempSync(join(tmpdir(), "director-"));
  after(() => rmSync(dir, { recursive: true, force: true }));
  return new Memory(dir);
}
