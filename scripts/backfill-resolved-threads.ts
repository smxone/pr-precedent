import { octokit } from "../src/lib/github.js";
import { ingestPullRequest } from "../src/ingestion/index.js";

async function main() {
  const [ownerRepo, ...args] = process.argv.slice(2);
  const apply = args.includes("--apply");
  if (!ownerRepo) {
    console.error("Usage: npm run backfill:threads -- <owner>/<repo> [--apply]");
    process.exit(1);
  }
  const [owner, repo] = ownerRepo.split("/");
  if (!owner || !repo) throw new Error(`Expected <owner>/<repo>, got "${ownerRepo}"`);

  const pulls = await octokit.paginate(octokit.pulls.list, {
    owner,
    repo,
    state: "closed",
    per_page: 100,
  });
  const merged = pulls.filter((pull) => pull.merged_at);
  console.log(`${apply ? "APPLY" : "DRY RUN"}: inspecting ${merged.length} merged PR(s) in ${owner}/${repo}`);

  let planned = 0;
  for (const pull of merged) {
    if (!pull.merged_at) continue;
    const result = await ingestPullRequest({
      owner,
      repo,
      pullNumber: pull.number,
      mergedAt: pull.merged_at,
      dryRun: !apply,
    });
    planned += result.ingested;
  }
  console.log(`${apply ? "Stored" : "Would store"} ${planned} resolved review thread(s).`);
  if (!apply) console.log("No Supermemory writes were made. Re-run with --apply after reviewing this output.");
}

main().catch((err) => {
  console.error("Resolved-thread backfill failed:", err);
  process.exit(1);
});
