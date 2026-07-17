// Debug/demo utility (not product code — same category as the smoke-test scripts):
// enumerates everything actually stored in a container via documents.list(), rather
// than inferring presence from a semantic search query (which only returns *related*
// results, not *everything*). Answers "did X actually get ingested?" directly.
//
// Usage: npx tsx scripts/list-memories.ts <owner>/<repo>
import { supermemory } from "../src/lib/supermemory.js";
import type { DecisionMemoryMetadata } from "../src/types/index.js";

async function main() {
  const ownerRepo = process.argv[2];
  if (!ownerRepo) {
    console.error("Usage: npx tsx scripts/list-memories.ts <owner>/<repo>");
    process.exit(1);
  }
  const [owner, repo] = ownerRepo.split("/");
  if (!owner || !repo) {
    console.error(`Expected <owner>/<repo>, got "${ownerRepo}"`);
    process.exit(1);
  }
  const containerTag = `${owner}_${repo}`;

  const { memories } = await supermemory.documents.list({ containerTags: [containerTag] });

  if (memories.length === 0) {
    console.log(`No memories found in container "${containerTag}".`);
    return;
  }

  console.log(`${memories.length} memor${memories.length === 1 ? "y" : "ies"} in "${containerTag}":\n`);
  for (const m of memories) {
    const meta = m.metadata as Partial<DecisionMemoryMetadata> | null;
    console.log(`[${m.status}] ${m.title ?? "(untitled)"}`);
    if (meta?.prNumber) console.log(`  PR #${meta.prNumber} — ${meta.filePath ?? "?"} (${meta.decisionType ?? "?"})`);
    if (meta?.sourceUrl) console.log(`  ${meta.sourceUrl}`);
    console.log(`  ingested: ${m.createdAt}`);
    console.log();
  }
}

main().catch((err) => {
  console.error("List memories failed:", err);
  process.exit(1);
});
