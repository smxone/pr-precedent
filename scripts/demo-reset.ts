import { octokit } from "../src/lib/github.js";

const BOT_LOGIN = "pr-precedent-ai[bot]";

async function main() {
  const [ownerRepo, ...prArgs] = process.argv.slice(2);
  if (!ownerRepo || prArgs.length === 0) {
    console.error("Usage: npx tsx scripts/demo-reset.ts <owner>/<repo> <pr#> [<pr#> ...]");
    process.exit(1);
  }
  const [owner, repo] = ownerRepo.split("/");
  if (!owner || !repo) {
    console.error(`Expected <owner>/<repo>, got "${ownerRepo}"`);
    process.exit(1);
  }

  for (const prArg of prArgs) {
    const pullNumber = Number(prArg);
    const { data: comments } = await octokit.issues.listComments({ owner, repo, issue_number: pullNumber });
    const botComments = comments.filter((c) => c.user?.login === BOT_LOGIN);
    for (const c of botComments) {
      await octokit.issues.deleteComment({ owner, repo, comment_id: c.id });
    }
    console.log(`PR #${pullNumber}: removed ${botComments.length} Precedent comment(s) — clean, re-triggerable.`);
  }
}

main().catch((err) => {
  console.error("Demo reset failed:", err);
  process.exit(1);
});
