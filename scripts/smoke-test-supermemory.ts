// Phase 0 acceptance check (docs/TASKS.md): confirm add() succeeds against the running
// Supermemory Local instance, with the shape from docs/DATA_MODEL.md.
import { addMemory } from "../src/lib/supermemory.js";

async function main() {
  const response = await addMemory({
    content:
      "[Decision type]: convention\n[Context]: smoke test\n[Discussion]: Phase 0 connectivity check.\n[Outcome]: n/a",
    containerTag: "precedent_smoke-test",
    metadata: {
      prNumber: 0,
      filePath: "smoke-test",
      decisionType: "convention",
      resolvedAt: new Date(0).toISOString(),
      sourceUrl: "https://example.com/smoke-test",
    },
  });
  console.log("OK — Supermemory add() succeeded:", response);
}

main().catch((err) => {
  console.error("Supermemory smoke test failed:", err);
  process.exit(1);
});
