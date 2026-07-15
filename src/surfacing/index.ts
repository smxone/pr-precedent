import { octokit } from "../lib/github.js";
import { config } from "../lib/config.js";
import { logEvent } from "../lib/log.js";
import { inspectPullRequestRetrieval } from "./retrieval.js";
import type { RetrievalCandidate } from "../types/index.js";

interface SurfacePullRequestParams {
  owner: string;
  repo: string;
  pullNumber: number;
  deliveryId?: string;
}

const SOURCE_DOC_PATTERN = /precedent-bot:source-doc=([^\s>]+)/;
const SOURCE_PR_PATTERN = /precedent-bot:source-pr=(\d+)/;

export function parsePrecedentMarker(commentBody: string): { sourceDocId: string | null; sourcePrNumber: number | null } {
  const sourceDocId = commentBody.match(SOURCE_DOC_PATTERN)?.[1] ?? null;
  const rawPr = commentBody.match(SOURCE_PR_PATTERN)?.[1];
  return { sourceDocId, sourcePrNumber: rawPr ? Number(rawPr) : null };
}

function marker(candidate: RetrievalCandidate, threshold: number): string {
  return [
    `<!-- precedent-bot:source-pr=${candidate.sourcePrNumber}`,
    `precedent-bot:source-doc=${candidate.documentId}`,
    `precedent-bot:match-score=${candidate.score.toFixed(4)}`,
    `precedent-bot:threshold=${threshold.toFixed(4)}`,
    `precedent-bot:hunk=${candidate.triggeringHunk.replace(/\s+/g, "-")} -->`,
  ].join(" ");
}

function blockquote(text: string): string {
  return text.split("\n").map((line) => `> ${line}`).join("\n");
}

export function formatComment(candidate: RetrievalCandidate, threshold: number): string {
  const currentExcerpt = candidate.triggeringExcerpt
    ? ["Current changed code:", "```diff", candidate.triggeringExcerpt, "```", "" ]
    : [];
  return [
    `🔍 **This has precedent.**`,
    ``,
    `Your change to \`${candidate.triggeredBy}\` touches a pattern the team discussed in [#${candidate.sourcePrNumber}](${candidate.sourceUrl}):`,
    ``,
    ...currentExcerpt,
    `Prior decision:`,
    blockquote(candidate.summary),
    ``,
    `**Supermemory semantic match:** ${candidate.score.toFixed(2)}`,
    ``,
    `_Posted automatically by Precedent — powered by Supermemory._`,
    marker(candidate, threshold),
  ].join("\n");
}

export async function surfacePullRequest({ owner, repo, pullNumber, deliveryId }: SurfacePullRequestParams) {
  const label = `${owner}/${repo}#${pullNumber}`;
  const alreadySurfacedDocs = new Set<string>();
  const legacySurfacedPrs = new Set<number>();

  try {
    const existing = await octokit.paginate(octokit.issues.listComments, {
      owner,
      repo,
      issue_number: pullNumber,
      per_page: 100,
    });
    for (const comment of existing) {
      if (comment.user?.login !== config.github.botLogin) continue;
      const parsed = parsePrecedentMarker(comment.body ?? "");
      if (parsed.sourceDocId) alreadySurfacedDocs.add(parsed.sourceDocId);
      else if (parsed.sourcePrNumber !== null) legacySurfacedPrs.add(parsed.sourcePrNumber);
    }
  } catch (err) {
    console.error(`[surfacing] failed to establish comment idempotency for ${label}; aborting:`, err);
    return { posted: false, checked: 0 };
  }

  let inspection;
  try {
    inspection = await inspectPullRequestRetrieval({ owner, repo, pullNumber });
  } catch (err) {
    console.error(`[surfacing] failed to inspect ${label}:`, err);
    return { posted: false, checked: 0 };
  }

  for (const failure of inspection.failures) {
    console.error(`[surfacing] search failed for ${label} @ ${failure.queryId ?? failure.filename}: ${failure.message}`);
  }

  const best = inspection.decision === "surface" ? inspection.candidates.find((candidate) =>
    candidate.score >= inspection.threshold &&
    !alreadySurfacedDocs.has(candidate.documentId) &&
    !legacySurfacedPrs.has(candidate.sourcePrNumber)
  ) : undefined;

  if (!best) {
    console.log(
      `[surfacing] ${label} — checked ${inspection.checkedFiles} file(s)/${inspection.checkedQueries} hunk query(s), decision=${inspection.reason}, nothing posted`
    );
    logEvent("info", "surfacing.silent", {
      repository: `${owner}/${repo}`, pullNumber, deliveryId: deliveryId ?? null,
      reason: inspection.reason, profile: inspection.profile.id,
      topScore: inspection.candidates[0]?.score ?? null, threshold: inspection.threshold,
    });
    return { posted: false, checked: inspection.checkedFiles };
  }

  if (config.surfacingMode === "observe") {
    console.log(`[surfacing] ${label} — observe-only confident match ${best.documentId} (${best.score.toFixed(4)}); no comment posted`);
    logEvent("info", "surfacing.observed", {
      repository: `${owner}/${repo}`, pullNumber, deliveryId: deliveryId ?? null,
      documentId: best.documentId, profile: inspection.profile.id, score: best.score,
    });
    return { posted: false, checked: inspection.checkedFiles };
  }

  try {
    await octokit.issues.createComment({
      owner,
      repo,
      issue_number: pullNumber,
      body: formatComment(best, inspection.threshold),
    });
    console.log(
      `[surfacing] ${label} — posted comment (score ${best.score.toFixed(4)} @ ${best.triggeredBy}, precedent PR #${best.sourcePrNumber}, memory ${best.documentId})`
    );
    logEvent("info", "surfacing.posted", {
      repository: `${owner}/${repo}`, pullNumber, deliveryId: deliveryId ?? null,
      documentId: best.documentId, sourcePrNumber: best.sourcePrNumber,
      profile: inspection.profile.id, score: best.score, threshold: inspection.threshold,
    });
    return { posted: true, checked: inspection.checkedFiles };
  } catch (err) {
    console.error(`[surfacing] failed to post comment on ${label}:`, err);
    return { posted: false, checked: inspection.checkedFiles };
  }
}
