export interface ScoredEvaluationCase {
  id: string;
  split: "calibration" | "holdout";
  relevant: boolean;
  expectedSourceId: string | null;
  observedSourceId: string | null;
  topScore: number | null;
  secondScore: number | null;
  rankOfExpected: number | null;
  latencyMs: number;
}

export interface AccuracyMetrics {
  threshold: number;
  surfacedPrecision: number;
  relevantRecall: number;
  top1SourceAccuracy: number;
  meanReciprocalRank: number;
  negativeSilenceRate: number;
  falsePositiveCount: number;
  averageLatencyMs: number;
}

export function calibrateThreshold(cases: ScoredEvaluationCase[]): number {
  const negativeScores = cases
    .filter((item) => item.split === "calibration" && !item.relevant && item.topScore !== null)
    .map((item) => item.topScore as number);
  const highestNegative = negativeScores.length ? Math.max(...negativeScores) : 0;
  return Math.min(1, Number((highestNegative + 0.01).toFixed(4)));
}

export function wouldSurface(item: ScoredEvaluationCase, threshold: number, ambiguityMargin: number): boolean {
  if (item.topScore === null || item.topScore < threshold) return false;
  if (item.secondScore !== null && item.topScore - item.secondScore < ambiguityMargin) return false;
  return true;
}

export function calculateAccuracyMetrics(
  cases: ScoredEvaluationCase[],
  threshold: number,
  ambiguityMargin: number,
): AccuracyMetrics {
  const surfaced = cases.filter((item) => wouldSurface(item, threshold, ambiguityMargin));
  const relevant = cases.filter((item) => item.relevant);
  const negatives = cases.filter((item) => !item.relevant);
  const truePositiveSurfaces = surfaced.filter((item) => item.relevant).length;
  const falsePositiveCount = surfaced.filter((item) => !item.relevant).length;
  const correctTopOne = relevant.filter((item) => item.observedSourceId === item.expectedSourceId).length;
  const reciprocalRank = relevant.reduce((sum, item) => sum + (item.rankOfExpected ? 1 / item.rankOfExpected : 0), 0);
  return {
    threshold,
    surfacedPrecision: surfaced.length ? truePositiveSurfaces / surfaced.length : 1,
    relevantRecall: relevant.length ? truePositiveSurfaces / relevant.length : 1,
    top1SourceAccuracy: relevant.length ? correctTopOne / relevant.length : 1,
    meanReciprocalRank: relevant.length ? reciprocalRank / relevant.length : 1,
    negativeSilenceRate: negatives.length ? (negatives.length - falsePositiveCount) / negatives.length : 1,
    falsePositiveCount,
    averageLatencyMs: cases.length ? cases.reduce((sum, item) => sum + item.latencyMs, 0) / cases.length : 0,
  };
}

export function passesPromotionGate(metrics: AccuracyMetrics, crossRepositoryIsolated: boolean): boolean {
  return metrics.falsePositiveCount === 0 &&
    metrics.relevantRecall >= 0.9 &&
    metrics.top1SourceAccuracy >= 0.9 &&
    crossRepositoryIsolated;
}
