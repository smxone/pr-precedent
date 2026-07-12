import { octokit } from "../lib/github.js";
import { addMemory } from "../lib/supermemory.js";
import type { DecisionMemoryMetadata } from "../types/index.js";

interface IngestPullRequestParams {
  owner: string;
  repo: string;
  pullNumber: number;
  mergedAt: string;
}

const MIN_COMMENT_LENGTH = 15;

function isSubstantive(body: string | null | undefined): body is string {
  return !!body && body.trim().length >= MIN_COMMENT_LENGTH;
}

function composePassage(params: {
  filePath: string;
  diffHunk: string;
  discussion: string;
  prNumber: number;
  prTitle: string;
}): string {
  const context = params.diffHunk ? `${params.filePath}\n${params.diffHunk}` : params.filePath;
  return [
    `[Decision type]: convention`,
    `[Context]: ${context}`,
    `[Discussion]: ${params.discussion}`,
    `[Outcome]: Merged as part of PR #${params.prNumber} ("${params.prTitle}").`,
  ].join("\n");
}

// V1 always tags decisionType as "convention" — deriving the real type per comment
// would require the same LLM-extraction classification explicitly deferred to V2
// (PRD F11/N6, same principle as patternTags). decisionType isn't used for matching
// (search.documents() embeds `content`, not metadata) so this doesn't affect quality.
const DEFAULT_DECISION_TYPE: DecisionMemoryMetadata["decisionType"] = "convention";

export async function ingestPullRequest({ owner, repo, pullNumber, mergedAt }: IngestPullRequestParams) {
  const containerTag = `${owner}_${repo}`;

  let pr: { title: string };
  try {
    const res = await octokit.pulls.get({ owner, repo, pull_number: pullNumber });
    pr = res.data;
  } catch (err) {
    console.error(`[ingestion] failed to fetch PR ${owner}/${repo}#${pullNumber}:`, err);
    return { ingested: 0, total: 0 };
  }

  let comments: Array<{
    body: string | null;
    path: string;
    diff_hunk: string;
    html_url: string;
    user: { type: string } | null;
  }>;
  try {
    const res = await octokit.pulls.listReviewComments({
      owner,
      repo,
      pull_number: pullNumber,
      per_page: 100,
    });
    comments = res.data;
  } catch (err) {
    console.error(`[ingestion] failed to fetch review comments for ${owner}/${repo}#${pullNumber}:`, err);
    return { ingested: 0, total: 0 };
  }

  let ingested = 0;
  for (const comment of comments) {
    if (comment.user?.type === "Bot") continue;
    if (!isSubstantive(comment.body)) continue;

    const content = composePassage({
      filePath: comment.path,
      diffHunk: comment.diff_hunk,
      discussion: comment.body,
      prNumber: pullNumber,
      prTitle: pr.title,
    });

    const metadata: DecisionMemoryMetadata = {
      prNumber: pullNumber,
      filePath: comment.path,
      decisionType: DEFAULT_DECISION_TYPE,
      resolvedAt: mergedAt,
      sourceUrl: comment.html_url,
    };

    try {
      await addMemory({ content, containerTag, metadata: { ...metadata } });
      ingested++;
      console.log(`[ingestion] stored memory for ${owner}/${repo}#${pullNumber} @ ${comment.path}`);
    } catch (err) {
      console.error(`[ingestion] failed to store memory for ${owner}/${repo}#${pullNumber} @ ${comment.path}:`, err);
    }
  }

  console.log(
    `[ingestion] ${owner}/${repo}#${pullNumber} merged — ingested ${ingested}/${comments.length} review comments into "${containerTag}"`
  );
  return { ingested, total: comments.length };
}
