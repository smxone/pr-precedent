// Debug/demo dashboard data source — read-only, presentation only. Reuses the same
// github.ts/supermemory.ts clients as the product; adds no new capture or surfacing
// logic. See CLAUDE.md "Debug dashboard (exception to no-UI rule)" for scope notes.
import { octokit } from "../lib/github.js";
import { config } from "../lib/config.js";
import { listAllDocuments } from "../lib/supermemory.js";
import type { DecisionMemoryMetadata } from "../types/index.js";

export interface CapturedEvent {
  kind: "captured";
  id: string;
  status: string;
  prNumber: number | null;
  filePath: string | null;
  decisionType: string | null;
  sourceUrl: string | null;
  excerpt: string;
  timestamp: string;
}

export interface SurfacedEvent {
  kind: "surfaced";
  id: string;
  triggerPrNumber: number;
  triggerPrUrl: string;
  triggerPrTitle: string;
  triggeredBy: string | null;
  sourcePrNumber: number | null;
  // Matches a CapturedEvent's `id` exactly. A single PR can have multiple review
  // comments captured as separate memories (see src/surfacing/index.ts's marker
  // comment) — sourcePrNumber alone can't tell them apart, sourceDocId can.
  sourceDocId: string | null;
  commentUrl: string;
  matchScore: number | null;
  threshold: number | null;
  helpfulReactions: number;
  unhelpfulReactions: number;
  timestamp: string;
}

export type DashboardEvent = CapturedEvent | SurfacedEvent;

function extractDiscussion(content: string | undefined): string {
  if (!content) return "";
  const match = content.match(/\[Discussion\]:\s*([\s\S]*?)(?:\n\[Outcome\]:|$)/);
  const text = (match?.[1] ?? content).trim();
  return text.length > 200 ? `${text.slice(0, 200).trim()}…` : text;
}

async function getCapturedEvents(containerTag: string): Promise<CapturedEvent[]> {
  const memories = await listAllDocuments({
    containerTags: [containerTag],
    includeContent: true,
  });

  return memories.map((m) => {
    const meta = m.metadata as Partial<DecisionMemoryMetadata> | null;
    return {
      kind: "captured",
      id: m.id,
      status: m.status,
      prNumber: meta?.prNumber ?? null,
      filePath: meta?.filePath ?? null,
      decisionType: meta?.decisionType ?? null,
      sourceUrl: meta?.sourceUrl ?? null,
      excerpt: extractDiscussion(m.content) || m.title || "(no content)",
      timestamp: m.createdAt,
    };
  });
}

async function getSurfacedEvents(owner: string, repo: string): Promise<SurfacedEvent[]> {
  const prs = await octokit.paginate(octokit.pulls.list, { owner, repo, state: "all", per_page: 50 });
  const events: SurfacedEvent[] = [];

  for (const pr of prs) {
    const comments = await octokit.paginate(octokit.issues.listComments, {
      owner,
      repo,
      issue_number: pr.number,
      per_page: 50,
    });
    for (const c of comments) {
      if (c.user?.login !== config.github.botLogin) continue;
      const prMarker = c.body?.match(/precedent-bot:source-pr=(\d+)/);
      const docMarker = c.body?.match(/precedent-bot:source-doc=([^\s>]+)/);
      const scoreMarker = c.body?.match(/precedent-bot:match-score=([0-9.]+)/);
      const thresholdMarker = c.body?.match(/precedent-bot:threshold=([0-9.]+)/);
      const triggeredByMatch = c.body?.match(/Your change to `([^`]+)`/);
      events.push({
        kind: "surfaced",
        id: String(c.id),
        triggerPrNumber: pr.number,
        triggerPrUrl: pr.html_url,
        triggerPrTitle: pr.title,
        triggeredBy: triggeredByMatch?.[1] ?? null,
        sourcePrNumber: prMarker?.[1] ? Number(prMarker[1]) : null,
        sourceDocId: docMarker?.[1] ?? null,
        commentUrl: c.html_url,
        matchScore: scoreMarker?.[1] ? Number(scoreMarker[1]) : null,
        threshold: thresholdMarker?.[1] ? Number(thresholdMarker[1]) : null,
        helpfulReactions: c.reactions?.["+1"] ?? 0,
        unhelpfulReactions: c.reactions?.["-1"] ?? 0,
        timestamp: c.created_at,
      });
    }
  }

  return events;
}

export function feedbackExport(data: Awaited<ReturnType<typeof getDashboardData>>) {
  return data.surfaced
    .filter((event) => event.helpfulReactions > 0 || event.unhelpfulReactions > 0)
    .map((event) => ({
      id: `feedback-pr-${event.triggerPrNumber}-comment-${event.id}`,
      status: "proposed",
      requiresHumanApproval: true,
      relevant: event.helpfulReactions > event.unhelpfulReactions,
      triggerPrNumber: event.triggerPrNumber,
      triggeringFile: event.triggeredBy,
      sourceDocumentId: event.sourceDocId,
      sourcePrNumber: event.sourcePrNumber,
      helpfulReactions: event.helpfulReactions,
      unhelpfulReactions: event.unhelpfulReactions,
      commentUrl: event.commentUrl,
    }));
}

export async function getDashboardData(owner: string, repo: string) {
  const containerTag = `${owner}_${repo}`;
  const [captured, surfaced] = await Promise.all([
    getCapturedEvents(containerTag),
    getSurfacedEvents(owner, repo),
  ]);

  const events: DashboardEvent[] = [...captured, ...surfaced].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return { containerTag, captured, surfaced, events };
}
