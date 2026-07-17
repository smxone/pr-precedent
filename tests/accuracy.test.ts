import { describe, expect, it, vi } from "vitest";
vi.mock("../src/lib/config.js", () => ({ config: {
  confidenceThreshold: 0.78,
  retrieval: { profileId: "test", queryVariant: "normalized-hunk", rerank: false, rewriteQuery: false, onlyMatchingChunks: true, chunkThreshold: null, resultLimit: 5, ambiguityMargin: 0.02 },
} }));
vi.mock("../src/lib/github.js", () => ({ octokit: {} }));
vi.mock("../src/lib/supermemory.js", () => ({ searchDocuments: vi.fn() }));
import { calculateAccuracyMetrics, calibrateThreshold, passesPromotionGate, type ScoredEvaluationCase } from "../src/evaluation/metrics.js";
import { buildRetrievalQueries, parsePatchHunks } from "../src/surfacing/retrieval.js";
import type { RetrievalProfile } from "../src/types/index.js";

const profile: RetrievalProfile = {
  id: "test", queryVariant: "normalized-hunk", rerank: false, rewriteQuery: false,
  onlyMatchingChunks: true, chunkThreshold: null, resultLimit: 5, ambiguityMargin: 0.02,
};

describe("accuracy foundations", () => {
  it("parses multiple hunks and constructs deterministic normalized queries", () => {
    const patch = "@@ first @@\n context\n-oldCall()\n+newCall()\n@@ second @@\n+validate(input)";
    expect(parsePatchHunks("src/example.ts", patch)).toHaveLength(2);
    const queries = buildRetrievalQueries({ title: "Improve handler", filename: "src/example.ts", patch, profile });
    expect(queries).toHaveLength(2);
    expect(queries[0]?.text).toContain("Language: TypeScript");
    expect(queries[0]?.text).toContain("Added code:\nnewCall()");
    expect(queries[0]?.text).not.toContain("@@ first @@");
  });

  it("calibrates only on calibration negatives and enforces the promotion gate", () => {
    const cases: ScoredEvaluationCase[] = [
      { id: "p1", split: "calibration", relevant: true, expectedSourceId: "a", observedSourceId: "a", topScore: 0.9, secondScore: 0.5, rankOfExpected: 1, latencyMs: 10 },
      { id: "n1", split: "calibration", relevant: false, expectedSourceId: null, observedSourceId: "b", topScore: 0.7, secondScore: 0.5, rankOfExpected: null, latencyMs: 10 },
      { id: "p2", split: "holdout", relevant: true, expectedSourceId: "a", observedSourceId: "a", topScore: 0.88, secondScore: 0.4, rankOfExpected: 1, latencyMs: 10 },
      { id: "n2", split: "holdout", relevant: false, expectedSourceId: null, observedSourceId: "b", topScore: 0.71, secondScore: 0.4, rankOfExpected: null, latencyMs: 10 },
    ];
    const threshold = calibrateThreshold(cases);
    expect(threshold).toBe(0.71);
    const metrics = calculateAccuracyMetrics(cases, threshold, 0.02);
    expect(metrics.falsePositiveCount).toBe(1);
    expect(passesPromotionGate(metrics, true)).toBe(false);
  });
});
