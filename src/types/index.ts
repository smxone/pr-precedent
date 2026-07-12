export type DecisionType = "convention" | "correction" | "bug-pattern" | "style" | "architecture";

// See docs/DATA_MODEL.md for the full spec, including deliberate exclusions (PRD F8/N4).
export interface DecisionMemoryMetadata {
  prNumber: number;
  filePath: string;
  decisionType: DecisionType;
  resolvedAt: string;
  sourceUrl: string;
}
