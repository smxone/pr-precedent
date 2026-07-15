import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export function unitInterval(name: string, rawValue: string): number {
  const value = Number(rawValue);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name} must be a finite number between 0 and 1 (received "${rawValue}")`);
  }
  return value;
}

function positiveInteger(name: string, rawValue: string): number {
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer (received "${rawValue}")`);
  }
  return value;
}

function nonNegativeNumber(name: string, rawValue: string): number {
  const value = Number(rawValue);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a finite non-negative number (received "${rawValue}")`);
  }
  return value;
}

function booleanValue(name: string, rawValue: string): boolean {
  if (rawValue === "true") return true;
  if (rawValue === "false") return false;
  throw new Error(`${name} must be "true" or "false" (received "${rawValue}")`);
}

function repositoryAllowlist(rawValue: string): Set<string> {
  return new Set(rawValue.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean));
}

export const config = {
  github: {
    appId: required("GITHUB_APP_ID"),
    privateKeyPath: required("GITHUB_APP_PRIVATE_KEY_PATH"),
    installationId: required("GITHUB_INSTALLATION_ID"),
    webhookSecret: required("GITHUB_WEBHOOK_SECRET"),
    botLogin: process.env["GITHUB_APP_BOT_LOGIN"] ?? "pr-precedent-ai[bot]",
  },
  supermemory: {
    baseUrl: process.env["SUPERMEMORY_BASE_URL"] ?? "http://localhost:6767",
    apiKey: process.env["SUPERMEMORY_API_KEY"] ?? "",
  },
  confidenceThreshold: unitInterval("CONFIDENCE_THRESHOLD", process.env["CONFIDENCE_THRESHOLD"] ?? "0.78"),
  retrieval: {
    profileId: process.env["RETRIEVAL_PROFILE_ID"] ?? "raw-file-baseline",
    queryVariant: process.env["RETRIEVAL_QUERY_VARIANT"] === "normalized-hunk" ? "normalized-hunk" as const : "raw-file" as const,
    rerank: booleanValue("RETRIEVAL_RERANK", process.env["RETRIEVAL_RERANK"] ?? "false"),
    rewriteQuery: booleanValue("RETRIEVAL_REWRITE_QUERY", process.env["RETRIEVAL_REWRITE_QUERY"] ?? "false"),
    onlyMatchingChunks: booleanValue("RETRIEVAL_ONLY_MATCHING_CHUNKS", process.env["RETRIEVAL_ONLY_MATCHING_CHUNKS"] ?? "true"),
    chunkThreshold: process.env["RETRIEVAL_CHUNK_THRESHOLD"]
      ? unitInterval("RETRIEVAL_CHUNK_THRESHOLD", process.env["RETRIEVAL_CHUNK_THRESHOLD"])
      : null,
    schemaVersion: process.env["RETRIEVAL_SCHEMA_VERSION"]
      ? positiveInteger("RETRIEVAL_SCHEMA_VERSION", process.env["RETRIEVAL_SCHEMA_VERSION"])
      : null,
    resultLimit: positiveInteger("RETRIEVAL_RESULT_LIMIT", process.env["RETRIEVAL_RESULT_LIMIT"] ?? "5"),
    ambiguityMargin: unitInterval("RETRIEVAL_AMBIGUITY_MARGIN", process.env["RETRIEVAL_AMBIGUITY_MARGIN"] ?? "0.02"),
  },
  surfacingMode: process.env["SURFACING_MODE"] === "observe" ? "observe" as const : "comment" as const,
  dashboardRepositories: repositoryAllowlist(process.env["DASHBOARD_REPOSITORIES"] ?? ""),
  ingestion: {
    finalContextLines: positiveInteger("FINAL_CONTEXT_LINES", process.env["FINAL_CONTEXT_LINES"] ?? "8"),
    processingPollMs: nonNegativeNumber("SUPERMEMORY_PROCESSING_POLL_MS", process.env["SUPERMEMORY_PROCESSING_POLL_MS"] ?? "2000"),
  },
  port: positiveInteger("PORT", process.env["PORT"] ?? "3000"),
};
