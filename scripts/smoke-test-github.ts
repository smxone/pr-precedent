// Phase 0 acceptance check (docs/TASKS.md): authenticate as the GitHub App and fetch one PR's data.
// Usage: npx tsx scripts/smoke-test-github.ts <owner> <repo> <pull_number>
import { octokit } from "../src/lib/github.js";

async function main() {
  const [owner, repo, pullNumberArg] = process.argv.slice(2);
  if (!owner || !repo || !pullNumberArg) {
    console.error("Usage: npx tsx scripts/smoke-test-github.ts <owner> <repo> <pull_number>");
    process.exit(1);
  }
  const pull_number = Number(pullNumberArg);

  const { data } = await octokit.pulls.get({ owner, repo, pull_number });
  console.log(`OK — authenticated and fetched PR #${data.number}: "${data.title}" (${data.state})`);
}

main().catch((err) => {
  console.error("GitHub smoke test failed:", err);
  process.exit(1);
});
