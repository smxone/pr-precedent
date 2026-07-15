import { octokit } from "../lib/github.js";
import { config } from "../lib/config.js";
import { logEvent } from "../lib/log.js";
import { addMemory, listAllDocuments } from "../lib/supermemory.js";
import type { DecisionDocumentV2, DecisionMemoryMetadata, ResolvedReviewThread } from "../types/index.js";
import { fetchResolvedReviewThreads } from "./review-threads.js";

interface IngestPullRequestParams {
  owner: string;
  repo: string;
  pullNumber: number;
  mergedAt: string;
  dryRun?: boolean;
  deliveryId?: string;
}

const ACKNOWLEDGEMENT_ONLY = /^(?:lgtm|looks good(?: to me)?|thanks|thank you|done|fixed|resolved|addressed)[.!\s]*$/i;
const ENTITY_CONTEXT = "Repository code-review decisions. Retain durable technical guidance, rationale, constraints, and accepted conventions from resolved threads. Do not infer contributor identity, performance, blame, or whether a future change is correct.";

function isTechnicalThread(thread: ResolvedReviewThread): boolean {
  if (!thread.isResolved) return false;
  const humanComments = thread.comments.filter((comment) => !comment.isBot && comment.body.trim());
  const root = humanComments[0];
  return !!root && !ACKNOWLEDGEMENT_ONLY.test(root.body.trim());
}

function discussion(thread: ResolvedReviewThread): string {
  return thread.comments
    .filter((comment) => !comment.isBot && comment.body.trim())
    .map((comment, index) => `${index === 0 ? "Review comment" : "Reply"}: ${comment.body.trim()}`)
    .join("\n");
}

function excerpt(content: string, line: number, radius: number): string {
  const lines = content.split(/\r?\n/);
  const start = Math.max(0, line - radius - 1);
  const end = Math.min(lines.length, line + radius);
  return lines.slice(start, end).map((value, index) => `${start + index + 1}: ${value}`).join("\n");
}

async function mergedFileContext(params: {
  owner: string;
  repo: string;
  mergeCommitSha: string | null;
  thread: ResolvedReviewThread;
  finalPatch: string | null;
}): Promise<{ label: string; content: string }> {
  if (params.mergeCommitSha && params.thread.line && params.thread.line > 0) {
    try {
      const response = await octokit.repos.getContent({
        owner: params.owner,
        repo: params.repo,
        path: params.thread.path,
        ref: params.mergeCommitSha,
      });
      if (!Array.isArray(response.data) && response.data.type === "file" && response.data.content) {
        const decoded = Buffer.from(response.data.content, "base64").toString("utf8");
        return {
          label: "Final merged code excerpt",
          content: excerpt(decoded, params.thread.line, config.ingestion.finalContextLines),
        };
      }
    } catch (err) {
      console.error(`[ingestion] failed to fetch final merged context for ${params.thread.path}:`, err);
    }
  }
  return params.finalPatch
    ? { label: "Final pull-request patch context", content: params.finalPatch }
    : { label: "Final merged context", content: "Unavailable; no specific code outcome is inferred." };
}

function composeDocument(params: {
  owner: string;
  repo: string;
  pullNumber: number;
  mergedAt: string;
  prTitle: string;
  thread: ResolvedReviewThread;
  finalContext: { label: string; content: string };
}): DecisionDocumentV2 {
  const root = params.thread.comments.find((comment) => !comment.isBot && comment.body.trim());
  if (!root) throw new Error(`Resolved thread ${params.thread.id} has no human root comment`);
  const originalDiff = root.diffHunk || "No original diff hunk was returned by GitHub.";
  const metadata: DecisionDocumentV2["metadata"] = {
    prNumber: params.pullNumber,
    filePath: params.thread.path,
    decisionType: "convention",
    resolvedAt: params.mergedAt,
    sourceUrl: root.url,
    schemaVersion: 2,
    recordKind: "review-thread",
    threadId: params.thread.id,
    isResolved: true,
    isOutdated: params.thread.isOutdated,
  };
  return {
    customId: `github-review-thread-${params.thread.id}`,
    containerTag: `${params.owner}_${params.repo}`,
    entityContext: ENTITY_CONTEXT,
    metadata,
    content: [
      "[Schema version]: 2",
      "[Record kind]: resolved review thread",
      `[Decision type]: ${metadata.decisionType}`,
      `[File]: ${params.thread.path}`,
      `[Original context]: ${originalDiff}`,
      `[Discussion]: ${discussion(params.thread)}`,
      `[Resolution]: GitHub reported this thread resolved when it was inspected after PR #${params.pullNumber} (\"${params.prTitle}\") merged at ${params.mergedAt}. The thread was${params.thread.isOutdated ? "" : " not"} outdated at ingestion time. No specific code change is inferred to have been caused by the discussion.`,
      `[${params.finalContext.label}]: ${params.finalContext.content}`,
    ].join("\n"),
  };
}

async function getExistingKeys(containerTag: string): Promise<{ threadIds: Set<string>; sourceUrls: Set<string> } | null> {
  try {
    const documents = await listAllDocuments({ containerTags: [containerTag] });
    const threadIds = new Set<string>();
    const sourceUrls = new Set<string>();
    for (const document of documents) {
      const metadata = document.metadata as Partial<DecisionMemoryMetadata> | null;
      if (metadata?.threadId) threadIds.add(metadata.threadId);
      if (metadata?.sourceUrl) sourceUrls.add(metadata.sourceUrl);
    }
    return { threadIds, sourceUrls };
  } catch (err) {
    console.error(`[ingestion] failed to establish deduplication state for "${containerTag}"; aborting ingestion:`, err);
    return null;
  }
}

export async function ingestPullRequest({ owner, repo, pullNumber, mergedAt, dryRun = false, deliveryId }: IngestPullRequestParams) {
  const containerTag = `${owner}_${repo}`;
  let pr: { title: string; merge_commit_sha: string | null };
  let threads: ResolvedReviewThread[];
  let files: Array<{ filename: string; patch?: string }>;

  try {
    const [prResponse, reviewThreads, changedFiles] = await Promise.all([
      octokit.pulls.get({ owner, repo, pull_number: pullNumber }),
      fetchResolvedReviewThreads({ owner, repo, pullNumber }),
      octokit.paginate(octokit.pulls.listFiles, { owner, repo, pull_number: pullNumber, per_page: 100 }),
    ]);
    pr = { title: prResponse.data.title, merge_commit_sha: prResponse.data.merge_commit_sha };
    threads = reviewThreads;
    files = changedFiles;
  } catch (err) {
    console.error(`[ingestion] failed to fetch merged PR context for ${owner}/${repo}#${pullNumber}:`, err);
    return { ingested: 0, eligible: 0, total: 0, dryRun };
  }

  const eligible = threads.filter(isTechnicalThread);
  const existing = await getExistingKeys(containerTag);
  if (!existing) return { ingested: 0, eligible: eligible.length, total: threads.length, dryRun };

  const patches = new Map(files.map((file) => [file.filename, file.patch ?? null]));
  let ingested = 0;
  for (const thread of eligible) {
    const rootUrl = thread.comments.find((comment) => !comment.isBot && comment.body.trim())?.url;
    if (existing.threadIds.has(thread.id) || (rootUrl && existing.sourceUrls.has(rootUrl))) {
      console.log(`[ingestion] ${owner}/${repo}#${pullNumber} thread ${thread.id} — already captured`);
      continue;
    }
    const finalContext = await mergedFileContext({
      owner,
      repo,
      mergeCommitSha: pr.merge_commit_sha,
      thread,
      finalPatch: patches.get(thread.path) ?? null,
    });
    const document = composeDocument({ owner, repo, pullNumber, mergedAt, prTitle: pr.title, thread, finalContext });
    if (dryRun) {
      ingested++;
      console.log(`[ingestion] dry-run would store thread ${thread.id} for ${owner}/${repo}#${pullNumber} @ ${thread.path}`);
      continue;
    }
    try {
      await addMemory({
        content: document.content,
        containerTag: document.containerTag,
        customId: document.customId,
        entityContext: document.entityContext,
        metadata: { ...document.metadata },
      });
      ingested++;
      console.log(`[ingestion] stored resolved thread ${thread.id} for ${owner}/${repo}#${pullNumber} @ ${thread.path}`);
    } catch (err) {
      console.error(`[ingestion] failed to store thread ${thread.id} for ${owner}/${repo}#${pullNumber}:`, err);
    }
  }

  console.log(`[ingestion] ${owner}/${repo}#${pullNumber} — ${dryRun ? "planned" : "stored"} ${ingested}/${eligible.length} eligible resolved threads (${threads.length} total)`);
  logEvent("info", "ingestion.complete", {
    repository: `${owner}/${repo}`,
    pullNumber,
    deliveryId: deliveryId ?? null,
    dryRun,
    stored: ingested,
    eligible: eligible.length,
    totalThreads: threads.length,
  });
  return { ingested, eligible: eligible.length, total: threads.length, dryRun };
}

export { composeDocument, isTechnicalThread };
