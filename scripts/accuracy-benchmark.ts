import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import Supermemory from "supermemory";
import { config } from "../src/lib/config.js";
import { addMemory, listAllDocuments } from "../src/lib/supermemory.js";
import { calculateAccuracyMetrics, calibrateThreshold, passesPromotionGate, type ScoredEvaluationCase } from "../src/evaluation/metrics.js";
import { inspectChangedFilesRetrieval } from "../src/surfacing/retrieval.js";
import type { EvaluationCase, RetrievalProfile } from "../src/types/index.js";

interface BenchmarkMemory {
  id: string;
  filePath: string;
  discussion: string;
  context: string;
}

const CONTAINER = "precedent_accuracy_benchmark";
const ENTITY_CONTEXT = "Benchmark repository review decisions. Extract durable technical guidance and rationale only; exclude identity and performance attribution.";
const root = new URL("../", import.meta.url);
const memories = JSON.parse(readFileSync(new URL("benchmarks/accuracy/memories.json", root), "utf8")) as BenchmarkMemory[];
const cases = JSON.parse(readFileSync(new URL("benchmarks/accuracy/cases.json", root), "utf8")) as EvaluationCase[];

const baseProfile: Omit<RetrievalProfile, "id" | "queryVariant" | "rerank" | "rewriteQuery"> = {
  onlyMatchingChunks: true,
  chunkThreshold: null,
  resultLimit: 5,
  ambiguityMargin: 0.02,
};
const profiles: RetrievalProfile[] = [
  { ...baseProfile, id: "raw-file-baseline", queryVariant: "raw-file", rerank: false, rewriteQuery: false },
  { ...baseProfile, id: "normalized-hunk", queryVariant: "normalized-hunk", rerank: false, rewriteQuery: false },
  { ...baseProfile, id: "normalized-hunk-rerank", queryVariant: "normalized-hunk", rerank: true, rewriteQuery: false },
  { ...baseProfile, id: "normalized-hunk-rewrite", queryVariant: "normalized-hunk", rerank: false, rewriteQuery: true },
  { ...baseProfile, id: "normalized-hunk-rerank-rewrite", queryVariant: "normalized-hunk", rerank: true, rewriteQuery: true },
];

async function seed() {
  for (const memory of memories) {
    await addMemory({
      customId: `benchmark-${memory.id}`,
      containerTag: CONTAINER,
      entityContext: ENTITY_CONTEXT,
      content: [
        "[Record kind]: resolved review thread",
        "[Decision type]: convention",
        `[File]: ${memory.filePath}`,
        `[Original context]: ${memory.context}`,
        `[Discussion]: Review comment: ${memory.discussion}`,
        "[Resolution]: Thread was resolved before the benchmark PR merged.",
      ].join("\n"),
      metadata: {
        prNumber: 1000 + memories.indexOf(memory),
        filePath: memory.filePath,
        decisionType: "convention",
        resolvedAt: "2026-07-15T00:00:00.000Z",
        sourceUrl: `https://github.com/example/benchmark/pull/${1000 + memories.indexOf(memory)}`,
        recordKind: "review-thread",
        threadId: `benchmark-thread-${memory.id}`,
        isResolved: true,
        isOutdated: false,
        benchmarkId: memory.id,
      },
    });
  }
}

async function waitUntilSearchable(timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const documents = await listAllDocuments({ containerTags: [CONTAINER] });
    const benchmarkDocs = documents.filter((document) => {
      const metadata = document.metadata as { benchmarkId?: string } | null;
      return !!metadata?.benchmarkId;
    });
    const ready = benchmarkDocs.length >= memories.length && benchmarkDocs.every((document) => document.status.toLowerCase() === "done");
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, config.ingestion.processingPollMs));
  }
  throw new Error(`Timed out waiting for ${memories.length} benchmark memories to become searchable`);
}

async function scoreProfile(profile: RetrievalProfile): Promise<ScoredEvaluationCase[]> {
  const scored: ScoredEvaluationCase[] = [];
  for (const item of cases) {
    const inspection = await inspectChangedFilesRetrieval({
      containerTag: CONTAINER,
      pullNumber: 1,
      title: item.title,
      files: item.files,
      profile,
      threshold: 0,
    });
    const expectedRank = item.expectedSourceId
      ? inspection.candidates.findIndex((candidate) => candidate.benchmarkId === item.expectedSourceId)
      : -1;
    scored.push({
      id: item.id,
      split: item.split,
      relevant: item.relevant,
      expectedSourceId: item.expectedSourceId,
      observedSourceId: inspection.candidates[0]?.benchmarkId ?? null,
      topScore: inspection.candidates[0]?.score ?? null,
      secondScore: inspection.candidates[1]?.score ?? null,
      rankOfExpected: expectedRank >= 0 ? expectedRank + 1 : null,
      latencyMs: inspection.timingMs,
    });
  }
  return scored;
}

async function serverVersion(): Promise<string> {
  try {
    const response = await fetch(config.supermemory.baseUrl);
    const body = await response.text();
    const match = body.match(/(?:version|serverVersion)["'\s:]+([\w.-]+)/i);
    return match?.[1] ?? `HTTP ${response.status}`;
  } catch {
    return "unknown";
  }
}

function percent(value: number) { return `${(value * 100).toFixed(1)}%`; }

async function main() {
  if (cases.length !== 25 || cases.filter((item) => item.relevant).length !== 10 || cases.filter((item) => !item.relevant).length !== 15) {
    throw new Error("Benchmark contract requires exactly 25 cases: 10 relevant and 15 negative");
  }
  await seed();
  await waitUntilSearchable();

  const profileReports = [];
  for (const profile of profiles) {
    try {
      const scored = await scoreProfile(profile);
      const threshold = calibrateThreshold(scored);
      const metrics = calculateAccuracyMetrics(scored, threshold, profile.ambiguityMargin);
      profileReports.push({ profile, supported: true, threshold, metrics, cases: scored });
    } catch (err) {
      profileReports.push({ profile, supported: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const supported = profileReports.filter((report): report is Extract<typeof profileReports[number], { supported: true }> => report.supported);
  supported.sort((a, b) =>
    a.metrics.falsePositiveCount - b.metrics.falsePositiveCount ||
    b.metrics.top1SourceAccuracy - a.metrics.top1SourceAccuracy ||
    b.metrics.relevantRecall - a.metrics.relevantRecall ||
    a.metrics.averageLatencyMs - b.metrics.averageLatencyMs
  );
  const winner = supported[0];
  if (!winner) throw new Error("No retrieval profile was supported by the current Supermemory Local server");

  const isolation = await inspectChangedFilesRetrieval({
    containerTag: `${CONTAINER}_wrong_repository`,
    pullNumber: 1,
    title: cases[0]!.title,
    files: cases[0]!.files,
    profile: winner.profile,
    threshold: winner.threshold,
  });
  const crossRepositoryIsolated = isolation.candidates.length === 0;
  const promotionPassed = passesPromotionGate(winner.metrics, crossRepositoryIsolated);
  const sdkPackage = JSON.parse(readFileSync(new URL("node_modules/supermemory/package.json", root), "utf8")) as { version: string };
  const report = {
    generatedAt: new Date().toISOString(),
    supermemorySdkVersion: sdkPackage.version,
    supermemoryLocalVersion: await serverVersion(),
    containerTag: CONTAINER,
    selectedProfile: winner.profile,
    selectedThreshold: winner.threshold,
    crossRepositoryIsolated,
    promotionPassed,
    promotionDecision: promotionPassed ? "eligible-for-comment-mode" : "observe-only",
    profiles: profileReports,
  };

  const outputDir = new URL("benchmarks/results/", root);
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(new URL("accuracy-latest.json", outputDir), `${JSON.stringify(report, null, 2)}\n`);
  const markdown = [
    "# Precedent accuracy report",
    "",
    `Generated: ${report.generatedAt}`,
    `Supermemory SDK: ${report.supermemorySdkVersion}`,
    `Supermemory Local: ${report.supermemoryLocalVersion}`,
    `Selected profile: ${winner.profile.id}`,
    `Calibrated threshold: ${winner.threshold.toFixed(4)}`,
    `Promotion decision: **${report.promotionDecision}**`,
    "",
    "| Metric | Result | Gate |",
    "|---|---:|---:|",
    `| Surfaced precision | ${percent(winner.metrics.surfacedPrecision)} | 100% |`,
    `| Relevant recall | ${percent(winner.metrics.relevantRecall)} | >= 90% |`,
    `| Top-1 source accuracy | ${percent(winner.metrics.top1SourceAccuracy)} | >= 90% |`,
    `| Mean reciprocal rank | ${winner.metrics.meanReciprocalRank.toFixed(3)} | recorded |`,
    `| Negative silence | ${percent(winner.metrics.negativeSilenceRate)} | 100% |`,
    `| Average latency | ${winner.metrics.averageLatencyMs.toFixed(1)} ms | recorded |`,
    `| Cross-repository isolation | ${crossRepositoryIsolated ? "pass" : "fail"} | pass |`,
    "",
    "The score is a Supermemory semantic-match score, not a probability or correctness verdict.",
  ].join("\n");
  writeFileSync(new URL("accuracy-latest.md", outputDir), `${markdown}\n`);
  console.log(markdown);
  if (!promotionPassed) process.exitCode = 2;
}

main().catch((err) => {
  console.error("Accuracy benchmark failed:", err);
  process.exit(1);
});
