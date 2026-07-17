import path from "node:path";
import { octokit } from "../lib/github.js";
import { config } from "../lib/config.js";
import { searchDocuments } from "../lib/supermemory.js";
import type {
  DecisionMemoryMetadata,
  DiffHunk,
  RetrievalCandidate,
  RetrievalEvidence,
  RetrievalInspection,
  RetrievalProfile,
  RetrievalQuery,
  SkippedFile,
} from "../types/index.js";

const MAX_CANDIDATES = 5;
const MAX_SUMMARY_LENGTH = 220;
const MAX_EVIDENCE_PER_CANDIDATE = 5;
const EXCERPT_LINE_LIMIT = 6;

const EXCERPT_STOP_WORDS = new Set([
  "added", "also", "calls", "change", "code", "comment", "could", "does", "from", "have",
  "helps", "into", "lines", "prior", "requested", "review", "same", "still", "that", "their",
  "these", "they", "this", "those", "value", "when", "where", "which", "with", "without",
]);

const DEPENDENCY_LOCKS = /(?:^|\/)(?:package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.lock|poetry\.lock|Gemfile\.lock)$/i;
const GENERATED = /(?:^|\/)(?:dist|build|coverage|generated|__generated__|\.next)(?:\/|$)|\.(?:map|min\.js|min\.css)$/i;
const VENDORED = /(?:^|\/)(?:vendor|vendors|third_party|node_modules)(?:\/|$)/i;
const SNAPSHOT = /(?:^|\/)(?:__snapshots__)(?:\/|$)|\.snap$/i;

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ".ts": "TypeScript", ".tsx": "TypeScript React", ".js": "JavaScript", ".jsx": "JavaScript React",
  ".py": "Python", ".go": "Go", ".rs": "Rust", ".java": "Java", ".kt": "Kotlin",
  ".rb": "Ruby", ".php": "PHP", ".cs": "C#", ".swift": "Swift", ".sql": "SQL",
  ".html": "HTML", ".css": "CSS", ".scss": "SCSS", ".vue": "Vue", ".svelte": "Svelte",
};

export const productionRetrievalProfile: RetrievalProfile = {
  id: config.retrieval.profileId,
  queryVariant: config.retrieval.queryVariant,
  rerank: config.retrieval.rerank,
  rewriteQuery: config.retrieval.rewriteQuery,
  onlyMatchingChunks: config.retrieval.onlyMatchingChunks,
  chunkThreshold: config.retrieval.chunkThreshold,
  resultLimit: config.retrieval.resultLimit,
  ambiguityMargin: config.retrieval.ambiguityMargin,
};

export function extractDiscussionSummary(fullContent: string): string | null {
  const match = fullContent.match(/\[Discussion\]:\s*([\s\S]*?)(?:\n\[(?:Outcome|Resolution)\]:|$)/);
  if (!match?.[1]) return null;
  const discussion = match[1].trim().replace(/^["'“]+|["'”]+$/g, "");
  if (!discussion) return null;
  if (discussion.length <= MAX_SUMMARY_LENGTH) return discussion;
  const truncated = discussion.slice(0, MAX_SUMMARY_LENGTH);
  const lastSpace = truncated.lastIndexOf(" ");
  return `${(lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated).trim()}…`;
}

function compactLines(lines: string[], limit = 14): string[] {
  return lines.map((line) => line.trimEnd()).filter((line) => line.trim()).slice(0, limit);
}

export function parsePatchHunks(filename: string, patchText: string): DiffHunk[] {
  const language = LANGUAGE_BY_EXTENSION[path.extname(filename).toLowerCase()] ?? "Code";
  const lines = patchText.split(/\r?\n/);
  const hunks: DiffHunk[] = [];
  let current: DiffHunk | null = null;

  function pushCurrent() {
    if (!current) return;
    current.context = compactLines(current.context);
    current.added = compactLines(current.added);
    current.removed = compactLines(current.removed);
    if (current.added.length || current.removed.length) hunks.push(current);
  }

  for (const line of lines) {
    if (line.startsWith("@@")) {
      pushCurrent();
      current = {
        id: `${filename}#h${hunks.length + 1}`,
        filename,
        language,
        header: line.replace(/^@@[^@]*@@\s*/, "").trim(),
        context: [],
        added: [],
        removed: [],
      };
      continue;
    }
    if (!current) {
      current = { id: `${filename}#h1`, filename, language, header: "", context: [], added: [], removed: [] };
    }
    if (line.startsWith("+") && !line.startsWith("+++")) current.added.push(line.slice(1));
    else if (line.startsWith("-") && !line.startsWith("---")) current.removed.push(line.slice(1));
    else if (line.startsWith(" ")) current.context.push(line.slice(1));
  }
  pushCurrent();
  return hunks;
}

function skipReason(filename: string, patchText?: string): SkippedFile["reason"] | null {
  if (!patchText) return "no_patch";
  if (DEPENDENCY_LOCKS.test(filename)) return "dependency_lock";
  if (VENDORED.test(filename)) return "vendored";
  if (SNAPSHOT.test(filename)) return "snapshot";
  if (GENERATED.test(filename)) return filename.endsWith(".min.js") || filename.endsWith(".min.css") ? "minified" : "generated";
  if (parsePatchHunks(filename, patchText).length === 0) return "no_meaningful_code";
  return null;
}

export function buildRetrievalQueries(params: {
  title: string;
  filename: string;
  patch: string;
  profile: RetrievalProfile;
}): RetrievalQuery[] {
  if (params.profile.queryVariant === "raw-file") {
    return [{
      id: `${params.filename}#raw`,
      filename: params.filename,
      hunkId: `${params.filename}#raw`,
      variant: "raw-file",
      text: `${params.filename}\n${params.patch}`,
      excerpt: compactLines(params.patch.split(/\r?\n/).filter((line) => /^[+-][^+-]/.test(line)), 6).join("\n"),
    }];
  }
  return parsePatchHunks(params.filename, params.patch).map((hunk) => {
    const sections = [
      `File: ${hunk.filename}`,
      `Language: ${hunk.language}`,
      params.title ? `Pull request context: ${params.title}` : "",
      hunk.header ? `Hunk context: ${hunk.header}` : "",
      hunk.context.length ? `Nearby code:\n${hunk.context.join("\n")}` : "",
      hunk.added.length ? `Added code:\n${hunk.added.join("\n")}` : "",
      hunk.removed.length ? `Removed code:\n${hunk.removed.join("\n")}` : "",
    ].filter(Boolean);
    const changed = hunk.added.length ? hunk.added : hunk.removed;
    return {
      id: hunk.id,
      filename: hunk.filename,
      hunkId: hunk.id,
      variant: "normalized-hunk" as const,
      text: sections.join("\n\n"),
      excerpt: changed.slice(0, 6).join("\n"),
    };
  });
}

function technicalTokens(text: string): Set<string> {
  const normalized = text.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  const tokens = normalized.match(/[a-z_$][a-z0-9_$-]*/g) ?? [];
  return new Set(tokens.filter((token) => token.length >= 3 && !EXCERPT_STOP_WORDS.has(token)));
}

/**
 * Select public evidence only after Supermemory has returned a candidate. Raw-file
 * search deliberately sends the full patch, but showing the first changed lines can
 * omit the code that caused the match. Rank contiguous changed-line windows by their
 * technical-token overlap with the matched review and keep the original diff markers.
 */
export function selectCandidateAwareExcerpt(
  query: RetrievalQuery,
  discussionSummary: string,
  limit = EXCERPT_LINE_LIMIT,
): string {
  if (query.variant !== "raw-file") return query.excerpt;

  const changedLines = query.text
    .split(/\r?\n/)
    .filter((line) => /^[+-][^+-]/.test(line));
  if (changedLines.length === 0) return query.excerpt;

  const targetTokens = technicalTokens(discussionSummary);
  if (targetTokens.size === 0) return query.excerpt;

  const lineScores = changedLines.map((line) => {
    const lineTokens = technicalTokens(line);
    let score = 0;
    for (const token of lineTokens) {
      if (targetTokens.has(token)) score++;
    }
    return score;
  });

  const windowSize = Math.min(limit, changedLines.length);
  let bestStart = 0;
  let bestScore = 0;
  let bestPeak = 0;
  for (let start = 0; start <= changedLines.length - windowSize; start++) {
    const scores = lineScores.slice(start, start + windowSize);
    const score = scores.reduce((sum, value) => sum + value, 0);
    const peak = Math.max(...scores);
    if (score > bestScore || (score === bestScore && peak > bestPeak)) {
      bestStart = start;
      bestScore = score;
      bestPeak = peak;
    }
  }

  if (bestScore === 0) return query.excerpt;
  return changedLines.slice(bestStart, bestStart + windowSize).join("\n");
}

function candidateFromResult(query: RetrievalQuery, result: {
  score: number;
  content?: string | null;
  documentId: string;
  metadata: Record<string, unknown> | null;
}, profile: RetrievalProfile): RetrievalCandidate | null {
  const metadata = result.metadata as Partial<DecisionMemoryMetadata> | null;
  const summary = extractDiscussionSummary(result.content ?? "");
  if (!Number.isFinite(result.score) || !result.documentId || !summary ||
      typeof metadata?.prNumber !== "number" || metadata.prNumber <= 0 ||
      typeof metadata.sourceUrl !== "string" || !metadata.sourceUrl ||
      typeof metadata.filePath !== "string" || !metadata.filePath) return null;
  const relevantExcerpt = selectCandidateAwareExcerpt(query, summary);

  const evidence: RetrievalEvidence = {
    queryId: query.id,
    hunkId: query.hunkId,
    filename: query.filename,
    query: query.text,
    excerpt: relevantExcerpt,
    score: result.score,
  };
  return {
    triggeredBy: query.filename,
    triggeringHunk: query.hunkId,
    triggeringExcerpt: relevantExcerpt,
    query: query.text,
    score: result.score,
    rawScore: result.score,
    ...(profile.rerank ? { rerankedScore: result.score } : {}),
    rank: 0,
    documentId: result.documentId,
    storedFilePath: metadata.filePath,
    sourcePrNumber: metadata.prNumber,
    sourceUrl: metadata.sourceUrl,
    summary,
    ...(metadata.benchmarkId ? { benchmarkId: metadata.benchmarkId } : {}),
    evidence: [evidence],
  };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown search error";
}

export async function inspectChangedFilesRetrieval(params: {
  containerTag: string;
  pullNumber: number;
  title: string;
  files: Array<{ filename: string; patch?: string }>;
  profile?: RetrievalProfile;
  threshold?: number;
}): Promise<RetrievalInspection> {
  const startedAt = Date.now();
  const profile = params.profile ?? productionRetrievalProfile;
  const threshold = params.threshold ?? config.confidenceThreshold;
  const failures: RetrievalInspection["failures"] = [];
  const skips: SkippedFile[] = [];
  const queries: RetrievalQuery[] = [];
  const checkedFiles = new Set<string>();

  for (const file of params.files) {
    const reason = skipReason(file.filename, file.patch);
    if (reason) {
      skips.push({ filename: file.filename, reason });
      continue;
    }
    checkedFiles.add(file.filename);
    queries.push(...buildRetrievalQueries({ title: params.title, filename: file.filename, patch: file.patch ?? "", profile }));
  }

  const byDocument = new Map<string, RetrievalCandidate>();
  let invalidCandidateCount = 0;
  for (const query of queries) {
    try {
      const response = await searchDocuments({
        q: query.text,
        containerTags: [params.containerTag],
        includeFullDocs: true,
        limit: profile.resultLimit,
        rerank: profile.rerank,
        rewriteQuery: profile.rewriteQuery,
        onlyMatchingChunks: profile.onlyMatchingChunks,
        ...(profile.chunkThreshold === null ? {} : { chunkThreshold: profile.chunkThreshold }),
      });
      for (const result of response.results) {
        const candidate = candidateFromResult(query, result, profile);
        if (!candidate) {
          invalidCandidateCount++;
          continue;
        }
        const previous = byDocument.get(candidate.documentId);
        if (!previous) byDocument.set(candidate.documentId, candidate);
        else {
          previous.evidence.push(candidate.evidence[0]!);
          previous.evidence.sort((a, b) => b.score - a.score);
          previous.evidence = previous.evidence.slice(0, MAX_EVIDENCE_PER_CANDIDATE);
          if (candidate.score > previous.score) {
            previous.score = candidate.score;
            previous.rawScore = candidate.rawScore;
            previous.triggeredBy = candidate.triggeredBy;
            previous.triggeringHunk = candidate.triggeringHunk;
            previous.triggeringExcerpt = candidate.triggeringExcerpt;
            previous.query = candidate.query;
            if (candidate.rerankedScore !== undefined) previous.rerankedScore = candidate.rerankedScore;
          }
        }
      }
    } catch (err) {
      failures.push({ filename: query.filename, queryId: query.id, message: errorMessage(err) });
    }
  }

  const candidates = [...byDocument.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATES)
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
  const top = candidates[0];
  const second = candidates[1];
  let reason: RetrievalInspection["reason"];
  if (params.files.length === 0 || (checkedFiles.size === 0 && skips.every((skip) => skip.reason === "no_patch"))) reason = "no_text_patches";
  else if (queries.length === 0) reason = "no_valid_queries";
  else if (failures.length === queries.length) reason = "all_searches_failed";
  else if (!top && invalidCandidateCount > 0) reason = "invalid_memory";
  else if (!top) reason = "no_candidates";
  else if (top.score < threshold) reason = "below_threshold";
  else if (second && top.score - second.score < profile.ambiguityMargin) reason = "ambiguous";
  else reason = "confident_match";

  return {
    containerTag: params.containerTag,
    pullNumber: params.pullNumber,
    checkedFiles: checkedFiles.size,
    skippedFiles: skips.length,
    checkedQueries: queries.length,
    threshold,
    decision: reason === "confident_match" ? "surface" : "silent",
    reason,
    profile,
    timingMs: Date.now() - startedAt,
    candidates,
    failures,
    skips,
    invalidCandidateCount,
  };
}

export async function inspectPullRequestRetrieval(params: {
  owner: string;
  repo: string;
  pullNumber: number;
}): Promise<RetrievalInspection> {
  const [pull, files] = await Promise.all([
    octokit.pulls.get({ owner: params.owner, repo: params.repo, pull_number: params.pullNumber }),
    octokit.paginate(octokit.pulls.listFiles, {
      owner: params.owner,
      repo: params.repo,
      pull_number: params.pullNumber,
      per_page: 100,
    }),
  ]);
  return inspectChangedFilesRetrieval({
    containerTag: `${params.owner}_${params.repo}`,
    pullNumber: params.pullNumber,
    title: pull.data.title,
    files,
  });
}
