# @evolvingagents/director: your team's know-how for Vercel AI SDK agents

**Status: in development, not published to npm.** Nothing here has been measured on a real model yet. The plan and its
phases: [PLAN.md](PLAN.md).

Your team's conventions live as markdown pages of linked statements (**When / Do / Because / Links**) in `.director/`,
versioned with your repository. Each request gets only the pages it needs. A bench tells you which model does *your*
task right, with and without that know-how, and at what cost. The verdict comes from what the run left behind (git,
tests, files), never from the model's own word.

## Use

```ts
import { generateText, gateway } from "ai";
import { Memory, withDirector, skillsFor } from "@evolvingagents/director";

const memory = new Memory(".director");

// Any AI SDK model: the pages a request needs are added before it.
const { text } = await generateText({
  model: withDirector(gateway("openai/gpt-6-luna"), memory),
  prompt: "Release 0.3.0 with a new name_upper option",
});

// A HarnessAgent (Claude Code, Codex, OpenCode, …): the same pages as skills.
const skills = skillsFor(memory, "Release 0.3.0 with a new name_upper option");
```

## Bench

```
AI_GATEWAY_API_KEY=… VERCEL_OIDC_TOKEN=… \
  director bench cases/release --models deepseek/deepseek-v4-flash,openai/gpt-6-luna --runs 3 --max-usd 5
director report
```

- Every run gets a fresh Vercel Sandbox. The case is set up there, the model works there, and the check runs there.
- Each row is saved as it lands.
- The bench stops before a run once the Gateway cost reaches `--max-usd`.

A case is a folder:
- `case.json`: title, when, request.
- `piece.md`: the know-how.
- `setup.py <dir>`: builds the workspace.
- `check.py <dir>`: prints `{"verdict": "g|c|f", "score", "missed"}`.

## Develop

```
npm ci && npm run typecheck && npm test && npm run build
```

Apache 2.0.
