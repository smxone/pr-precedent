export type DecisionType = "convention" | "correction" | "bug-pattern" | "style" | "architecture";

// See docs/DATA_MODEL.md for the full spec, including deliberate exclusions (PRD F8/N4).
export interface DecisionMemoryMetadata {
  prNumber: number;
  filePath: string;
  decisionType: DecisionType;
  resolvedAt: string;
  sourceUrl: string;
  recordKind?: "review-comment" | "review-thread";
  threadId?: string;
  isResolved?: boolean;
  isOutdated?: boolean;
  benchmarkId?: string;
}

export interface ResolvedReviewThreadComment {
  id: string;
  databaseId: number | null;
  body: string;
  url: string;
  diffHunk: string;
  isBot: boolean;
}

export interface ResolvedReviewThread {
  id: string;
  path: string;
  line: number | null;
  startLine: number | null;
  isResolved: boolean;
  isOutdated: boolean;
  comments: ResolvedReviewThreadComment[];
}

export interface DecisionDocument {
  customId: string;
  content: string;
  containerTag: string;
  entityContext: string;
  metadata: DecisionMemoryMetadata & {
    recordKind: "review-thread";
    threadId: string;
    isResolved: true;
    isOutdated: boolean;
  };
}

export interface DiffHunk {
  id: string;
  filename: string;
  language: string;
  header: string;
  context: string[];
  added: string[];
  removed: string[];
}

export type RetrievalQueryVariant = "raw-file" | "normalized-hunk";

export interface RetrievalQuery {
  id: string;
  filename: string;
  hunkId: string;
  variant: RetrievalQueryVariant;
  text: string;
  excerpt: string;
}

export interface RetrievalEvidence {
  queryId: string;
  hunkId: string;
  filename: string;
  query: string;
  excerpt: string;
  score: number;
}

export type RetrievalDecisionReason =
  | "confident_match"
  | "below_threshold"
  | "ambiguous"
  | "no_text_patches"
  | "no_valid_queries"
  | "all_searches_failed"
  | "no_candidates"
  | "invalid_memory";

export interface RetrievalProfile {
  id: string;
  queryVariant: RetrievalQueryVariant;
  rerank: boolean;
  rewriteQuery: boolean;
  onlyMatchingChunks: boolean;
  chunkThreshold: number | null;
  resultLimit: number;
  ambiguityMargin: number;
}

export interface RetrievalCandidate {
  triggeredBy: string;
  triggeringHunk: string;
  triggeringExcerpt: string;
  query: string;
  score: number;
  rawScore: number;
  rerankedScore?: number;
  rank: number;
  documentId: string;
  storedFilePath: string;
  sourcePrNumber: number;
  sourceUrl: string;
  summary: string;
  benchmarkId?: string;
  evidence: RetrievalEvidence[];
}

export interface RetrievalFailure {
  filename: string;
  queryId?: string;
  message: string;
}

export interface SkippedFile {
  filename: string;
  reason: "no_patch" | "generated" | "dependency_lock" | "vendored" | "snapshot" | "minified" | "no_meaningful_code";
}

export interface RetrievalInspection {
  containerTag: string;
  pullNumber: number;
  checkedFiles: number;
  skippedFiles: number;
  checkedQueries: number;
  threshold: number;
  decision: "surface" | "silent";
  reason: RetrievalDecisionReason;
  profile: RetrievalProfile;
  timingMs: number;
  candidates: RetrievalCandidate[];
  failures: RetrievalFailure[];
  skips: SkippedFile[];
  invalidCandidateCount: number;
}

export interface EvaluationCase {
  id: string;
  split: "calibration" | "holdout";
  relevant: boolean;
  expectedSourceId: string | null;
  title: string;
  files: Array<{ filename: string; patch?: string }>;
  category: string;
}

export interface EvaluationResult {
  caseId: string;
  split: EvaluationCase["split"];
  relevant: boolean;
  expectedSourceId: string | null;
  observedSourceId: string | null;
  topScore: number | null;
  rankOfExpected: number | null;
  decision: "surface" | "silent";
  reason: RetrievalDecisionReason;
  latencyMs: number;
}
