// Phase 4 — explicit query CLI (Flow 3). Usage:
//   npm run cli -- <owner>/<repo> "what's our convention for X?"
import { getProfile } from "../lib/supermemory.js";
import { config } from "../lib/config.js";
import type { DecisionMemoryMetadata } from "../types/index.js";

interface SearchResultEntry {
  memory: string;
  similarity: number;
  metadata: Partial<DecisionMemoryMetadata> | null;
}

async function main() {
  const [ownerRepo, ...questionParts] = process.argv.slice(2);
  const q = questionParts.join(" ").trim();

  if (!ownerRepo || !q) {
    console.error('Usage: npm run cli -- <owner>/<repo> "<question>"');
    process.exit(1);
  }

  const [owner, repo] = ownerRepo.split("/");
  if (!owner || !repo) {
    console.error(`Expected <owner>/<repo>, got "${ownerRepo}"`);
    process.exit(1);
  }
  const containerTag = `${owner}_${repo}`;

  const response = await getProfile({ containerTag, q });

  // profile.static/dynamic are NOT filtered by relevance to `q` — verified live
  // (2026-07-12): they mixed unrelated facts from the same container in alongside
  // the real answer. searchResults.results[].similarity IS query-relevance-scored,
  // so that's the actual answer source; reuse CONFIDENCE_THRESHOLD as the same
  // "stay silent below a confidence bar" principle the surfacing handler applies.
  const results = (response.searchResults?.results ?? []) as unknown as SearchResultEntry[];
  const confident = results
    .filter((r) => r.similarity >= config.confidenceThreshold)
    .sort((a, b) => b.similarity - a.similarity);

  if (confident.length === 0) {
    console.log(`No confident answer found for: "${q}"`);
    return;
  }

  console.log(`"${q}"\n`);
  confident.forEach((r, i) => {
    console.log(`${i + 1}. ${r.memory}`);
    if (r.metadata?.prNumber && r.metadata.sourceUrl) {
      console.log(`   Source: PR #${r.metadata.prNumber} — ${r.metadata.sourceUrl}`);
    }
    console.log();
  });
}

main().catch((err) => {
  console.error("CLI query failed:", err);
  process.exit(1);
});
