import { octokit } from "../lib/github.js";
import { searchDocuments } from "../lib/supermemory.js";
import { config } from "../lib/config.js";
import type { DecisionMemoryMetadata } from "../types/index.js";

interface SurfacePullRequestParams {
  owner: string;
  repo: string;
  pullNumber: number;
}

interface Candidate {
  filename: string;
  score: number;
  fullContent: string;
  metadata: Partial<DecisionMemoryMetadata> | null;
}

const MAX_SUMMARY_LENGTH = 220;

// V1 does not run an LLM paraphraser over the match (would be new NLP scope not
// covered by any V1 requirement — the same boundary that keeps decisionType
// classification out of ingestion, see src/ingestion/index.ts). Instead we pull the
// original [Discussion] text back out of the full stored passage and truncate it.
//
// Must operate on the FULL document (search's includeFullDocs: true), not a chunk —
// Supermemory splits the composed passage into multiple chunks, and the top-scoring
// chunk for a given query is often the [Context] (diff) portion, not [Discussion].
// Regressed to posting a raw diff excerpt in production before this fix (2026-07-12).
export function extractSummary(fullContent: string): string {
  const match = fullContent.match(/\[Discussion\]:\s*([\s\S]*?)(?:\n\[Outcome\]:|$)/);
  // Strip the discussion's own quote marks — it's about to be wrapped in a blockquote,
  // and nesting quotes reads as awkward double-quoting (see docs/API_CONTRACTS.md).
  const discussion = (match?.[1] ?? fullContent).trim().replace(/^["'“]+|["'”]+$/g, "");
  if (discussion.length <= MAX_SUMMARY_LENGTH) return discussion;
  const truncated = discussion.slice(0, MAX_SUMMARY_LENGTH);
  const lastSpace = truncated.lastIndexOf(" ");
  return `${(lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated).trim()}…`;
}

export function formatComment(prNumber: number, sourceUrl: string, summary: string): string {
  return [
    `🔍 **This has precedent.**`,
    ``,
    `A similar pattern was discussed in [#${prNumber}](${sourceUrl}):`,
    ``,
    `> ${summary}`,
    ``,
    `_Posted automatically by Precedent — powered by Supermemory._`,
  ].join("\n");
}

export async function surfacePullRequest({ owner, repo, pullNumber }: SurfacePullRequestParams) {
  const containerTag = `${owner}_${repo}`;
  const label = `${owner}/${repo}#${pullNumber}`;

  let files: Array<{ filename: string; patch?: string }>;
  try {
    const res = await octokit.pulls.listFiles({ owner, repo, pull_number: pullNumber, per_page: 100 });
    files = res.data;
  } catch (err) {
    console.error(`[surfacing] failed to fetch changed files for ${label}:`, err);
    return { posted: false, checked: 0 };
  }

  let checked = 0;
  let best: Candidate | null = null;

  for (const file of files) {
    if (!file.patch) {
      console.log(`[surfacing] ${label} @ ${file.filename} — no patch (binary or too large), skipping`);
      continue;
    }
    checked++;

    const q = `${file.filename}\n${file.patch}`;

    let results: Array<{
      score: number;
      content?: string | null;
      metadata: Record<string, unknown> | null;
    }>;
    try {
      const res = await searchDocuments({ q, containerTags: [containerTag], includeFullDocs: true });
      results = res.results;
    } catch (err) {
      console.error(`[surfacing] search failed for ${label} @ ${file.filename}:`, err);
      continue;
    }

    const topResult = results[0];
    if (!topResult) {
      console.log(`[surfacing] ${label} @ ${file.filename} — no results`);
      continue;
    }
    console.log(`[surfacing] ${label} @ ${file.filename} — best score ${topResult.score.toFixed(4)} (threshold ${config.confidenceThreshold})`);

    if (topResult.score < config.confidenceThreshold) continue;
    if (best && topResult.score <= best.score) continue;

    best = {
      filename: file.filename,
      score: topResult.score,
      fullContent: topResult.content ?? "",
      metadata: topResult.metadata as Partial<DecisionMemoryMetadata> | null,
    };
  }

  if (!best) {
    console.log(`[surfacing] ${label} — checked ${checked} changed file(s), no confident match, nothing posted`);
    return { posted: false, checked };
  }

  if (!best.metadata?.prNumber || !best.metadata.sourceUrl) {
    console.error(`[surfacing] ${label} @ ${best.filename} — matched (score ${best.score}) but metadata missing prNumber/sourceUrl, skipping post`);
    return { posted: false, checked };
  }

  const summary = extractSummary(best.fullContent);
  const body = formatComment(best.metadata.prNumber, best.metadata.sourceUrl, summary);

  try {
    await octokit.issues.createComment({ owner, repo, issue_number: pullNumber, body });
    console.log(
      `[surfacing] ${label} — posted comment (score ${best.score.toFixed(4)} @ ${best.filename}, precedent PR #${best.metadata.prNumber})`
    );
    return { posted: true, checked };
  } catch (err) {
    console.error(`[surfacing] failed to post comment on ${label}:`, err);
    return { posted: false, checked };
  }
}
