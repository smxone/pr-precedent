// Phase 1 — matching-quality spike (docs/TASKS.md, IMPLEMENTATION_SPEC.md §5).
// Seeds realistic decision passages into a test container, then checks that
// search.documents() distinguishes a genuinely related query from an unrelated
// one with a usable score gap. This sets CONFIDENCE_THRESHOLD. No GitHub involved.
import { addMemory, searchDocuments } from "../src/lib/supermemory.js";
import type { DecisionMemoryMetadata } from "../src/types/index.js";

const CONTAINER_TAG = "precedent_phase1-spike";

function passage(
  decisionType: DecisionMemoryMetadata["decisionType"],
  context: string,
  discussion: string,
  outcome: string
): string {
  return `[Decision type]: ${decisionType}\n[Context]: ${context}\n[Discussion]: ${discussion}\n[Outcome]: ${outcome}`;
}

const seedPassages: Array<{ content: string; metadata: DecisionMemoryMetadata }> = [
  {
    content: passage(
      "convention",
      "app/api/chat/route.ts — new LLM API route calling the OpenAI client directly with no error handling.",
      "\"For all LLM API routes, we must wrap the call in a try/catch and return a standard JSON error response — LLM calls fail unpredictably (rate limits, timeouts, content filtering) and an unhandled throw takes down the route.\"",
      "Route wrapped in try/catch; on failure returns `NextResponse.json({ error: message }, { status: 500 })`."
    ),
    metadata: {
      prNumber: 1001,
      filePath: "app/api/chat/route.ts",
      decisionType: "convention",
      resolvedAt: "2026-06-01T10:00:00Z",
      sourceUrl: "https://github.com/smxone/reviseflow-ai/pull/1001",
    },
  },
  {
    content: passage(
      "correction",
      "app/api/chat/route.ts — request body was read with manual `if (!body.prompt) throw ...` checks.",
      "\"Use zod to validate the request body instead of hand-rolled checks — it's our standard for any API route input, and it gives us typed errors for free.\"",
      "Replaced manual checks with a zod schema and `schema.parse(body)`."
    ),
    metadata: {
      prNumber: 1002,
      filePath: "app/api/chat/route.ts",
      decisionType: "correction",
      resolvedAt: "2026-06-03T10:00:00Z",
      sourceUrl: "https://github.com/smxone/reviseflow-ai/pull/1002",
    },
  },
  {
    content: passage(
      "style",
      "app/api/chat-history/route.ts — new route folder named with camelCase.",
      "\"Route folder names should be kebab-case, not camelCase, to match the rest of the app/api tree.\"",
      "Folder renamed from `chatHistory` to `chat-history`."
    ),
    metadata: {
      prNumber: 1003,
      filePath: "app/api/chat-history/route.ts",
      decisionType: "style",
      resolvedAt: "2026-06-05T10:00:00Z",
      sourceUrl: "https://github.com/smxone/reviseflow-ai/pull/1003",
    },
  },
  {
    content: passage(
      "bug-pattern",
      "app/api/chat/route.ts — the LLM model name was taken directly from the request body and passed to the provider SDK.",
      "\"Never trust a client-supplied model name — allowlist the models we actually support before passing it to the provider, otherwise a client can request an arbitrary/expensive model.\"",
      "Added a `SUPPORTED_MODELS` allowlist check before the provider call, returns 400 on an unlisted model."
    ),
    metadata: {
      prNumber: 1004,
      filePath: "app/api/chat/route.ts",
      decisionType: "bug-pattern",
      resolvedAt: "2026-06-07T10:00:00Z",
      sourceUrl: "https://github.com/smxone/reviseflow-ai/pull/1004",
    },
  },
  {
    content: passage(
      "architecture",
      "app/api/revision/route.ts — the route handler contained the full revision business logic inline.",
      "\"API route handlers should stay thin — parse input, call a service function in lib/services, format the response. Business logic belongs in lib/, not the route file, so it's testable without spinning up Next.js.\"",
      "Logic extracted into `lib/services/revision.ts`; route handler now just parses, calls the service, and responds."
    ),
    metadata: {
      prNumber: 1005,
      filePath: "app/api/revision/route.ts",
      decisionType: "architecture",
      resolvedAt: "2026-06-09T10:00:00Z",
      sourceUrl: "https://github.com/smxone/reviseflow-ai/pull/1005",
    },
  },
];

async function seed() {
  console.log(`Seeding ${seedPassages.length} passages into container "${CONTAINER_TAG}"...`);
  for (const p of seedPassages) {
    const res = await addMemory({
      content: p.content,
      containerTag: CONTAINER_TAG,
      metadata: { ...p.metadata },
    });
    console.log(`  added ${p.metadata.filePath} (${p.metadata.decisionType}) -> ${res.id} [${res.status}]`);
  }
}

async function query(label: string, q: string) {
  const { results } = await searchDocuments({ q, containerTags: [CONTAINER_TAG] });
  console.log(`\n${label}`);
  console.log(`  query: ${q}`);
  if (results.length === 0) {
    console.log("  (no results)");
    return;
  }
  for (const r of results.slice(0, 3)) {
    const meta = r.metadata as Partial<DecisionMemoryMetadata> | null;
    console.log(
      `  score=${r.score.toFixed(4)} filePath=${meta?.filePath ?? "?"} decisionType=${meta?.decisionType ?? "?"} sourceUrl=${meta?.sourceUrl ?? "?"}`
    );
  }
}

async function main() {
  const skipSeed = process.argv.includes("--skip-seed");

  if (!skipSeed) {
    await seed();
    // Ingestion is async in Supermemory Local (status: "queued") — give it a moment before searching.
    console.log("\nWaiting 5s for ingestion to process before querying...");
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  await query(
    "RELATED query (new LLM API route, no try/catch — should match PR #1001)",
    "app/api/revision/route.ts new LLM route calling the model provider with no try/catch around the call, no error handling on failure"
  );

  await query(
    "UNRELATED query (should NOT return a confident match)",
    "updating the marketing landing page hero image and CSS grid layout on the homepage"
  );
}

main().catch((err) => {
  console.error("Phase 1 spike failed:", err);
  process.exit(1);
});
