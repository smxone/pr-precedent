import { Webhooks, createNodeMiddleware } from "@octokit/webhooks";
import { config } from "../lib/config.js";
import { ingestPullRequest } from "../ingestion/index.js";
import { surfacePullRequest } from "../surfacing/index.js";

export const webhooks = new Webhooks({
  secret: config.github.webhookSecret,
});

webhooks.on("pull_request.closed", async ({ payload }) => {
  const { repository, pull_request: pr } = payload;
  const label = `${repository.full_name}#${pr.number}`;

  if (!pr.merged) {
    console.log(`[webhooks] ${label} closed without merging — skipping ingestion`);
    return;
  }
  if (!pr.merged_at) {
    console.error(`[webhooks] ${label} reports merged=true but has no merged_at — skipping`);
    return;
  }

  const [owner, repo] = repository.full_name.split("/");
  if (!owner || !repo) {
    console.error(`[webhooks] could not parse owner/repo from "${repository.full_name}" — skipping`);
    return;
  }

  await ingestPullRequest({ owner, repo, pullNumber: pr.number, mergedAt: pr.merged_at });
});

webhooks.on(["pull_request.opened", "pull_request.synchronize"], async ({ payload }) => {
  const { repository, pull_request: pr } = payload;
  const label = `${repository.full_name}#${pr.number}`;

  const [owner, repo] = repository.full_name.split("/");
  if (!owner || !repo) {
    console.error(`[webhooks] could not parse owner/repo from "${repository.full_name}" — skipping`);
    return;
  }

  console.log(`[webhooks] ${label} ${payload.action} — checking for precedent`);
  await surfacePullRequest({ owner, repo, pullNumber: pr.number });
});

webhooks.onError((error) => {
  console.error("[webhooks] handler error:", error);
});

export const webhookMiddleware = createNodeMiddleware(webhooks, {
  path: "/api/webhooks/github",
});
