import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ paginate: vi.fn(), get: vi.fn(), search: vi.fn() }));
vi.mock("../src/lib/github.js", () => ({
  octokit: { paginate: mocks.paginate, pulls: { listFiles: vi.fn(), get: mocks.get } },
}));
vi.mock("../src/lib/config.js", () => ({ config: {
  confidenceThreshold: 0.78,
  retrieval: { profileId: "test", queryVariant: "normalized-hunk", rerank: false, rewriteQuery: false, onlyMatchingChunks: true, chunkThreshold: null, schemaVersion: 2, resultLimit: 5, ambiguityMargin: 0.02 },
} }));
vi.mock("../src/lib/supermemory.js", () => ({ searchDocuments: mocks.search }));

function result(id: string, score: number, overrides: Record<string, unknown> = {}) {
  return {
    documentId: id,
    score,
    content: `[Decision type]: convention\n[Context]: old.ts\n[Discussion]: Keep this technical decision.\n[Outcome]: merged`,
    metadata: { prNumber: 2, sourceUrl: "https://github.test/pull/2", filePath: "old.ts", schemaVersion: 2 },
    ...overrides,
  };
}

describe("inspectPullRequestRetrieval", () => {
  beforeEach(() => vi.clearAllMocks());

  it("paginates files, ranks globally, and surfaces at the threshold", async () => {
    mocks.paginate.mockResolvedValue([
      ...Array.from({ length: 100 }, (_, i) => ({ filename: `no-patch-${i}.bin` })),
      { filename: "one.ts", patch: "+ one" },
      { filename: "two.ts", patch: "+ two" },
    ]);
    mocks.get.mockResolvedValue({ data: { title: "Test PR" } });
    mocks.search
      .mockResolvedValueOnce({ results: [result("lower", 0.78)] })
      .mockResolvedValueOnce({ results: [result("winner", 0.91), result("bad", 0.99, { metadata: null })] });
    const { inspectPullRequestRetrieval } = await import("../src/surfacing/retrieval.js");
    const inspection = await inspectPullRequestRetrieval({ owner: "acme", repo: "api", pullNumber: 3 });
    expect(inspection.decision).toBe("surface");
    expect(inspection.checkedFiles).toBe(2);
    expect(inspection.checkedQueries).toBe(2);
    expect(inspection.skippedFiles).toBe(100);
    expect(inspection.candidates.map((candidate) => candidate.documentId)).toEqual(["winner", "lower"]);
    expect(mocks.paginate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ per_page: 100 }));
  });

  it("stays silent below threshold and reports partial failures", async () => {
    mocks.paginate.mockResolvedValue([
      { filename: "broken.ts", patch: "+ broken" },
      { filename: "quiet.ts", patch: "+ quiet" },
    ]);
    mocks.get.mockResolvedValue({ data: { title: "Test PR" } });
    mocks.search
      .mockRejectedValueOnce(new Error("search unavailable"))
      .mockResolvedValueOnce({ results: [result("quiet", 0.77)] });
    const { inspectPullRequestRetrieval } = await import("../src/surfacing/retrieval.js");
    const inspection = await inspectPullRequestRetrieval({ owner: "acme", repo: "api", pullNumber: 4 });
    expect(inspection.decision).toBe("silent");
    expect(inspection.failures).toEqual([{ filename: "broken.ts", queryId: "broken.ts#h1", message: "search unavailable" }]);
  });
});

describe("candidate-aware public evidence", () => {
  it("shows the matched profile filter instead of the first six changed lines", async () => {
    const { selectCandidateAwareExcerpt } = await import("../src/surfacing/retrieval.js");
    const patch = `@@ -0,0 +1,22 @@
+// GET /api/concept-summary?subjectId=gate_os&concept=paging
+// Returns a concept summary scoped to the requested subject.
+import { NextRequest, NextResponse } from "next/server";
+import { sm, containerTagFor } from "@/lib/supermemory";
+export async function GET(req: NextRequest) {
+  const subjectId = req.nextUrl.searchParams.get("subjectId");
+  const concept = req.nextUrl.searchParams.get("concept");
+  if (!subjectId || !concept) return NextResponse.json({ error: "required" }, { status: 400 });
+  try {
+    const profile = await sm.profile({
+      containerTag: containerTagFor(subjectId),
+      q: concept,
+      filters: { AND: [{ key: "subjectId", value: subjectId, filterType: "metadata" }] },
+    });
+    return NextResponse.json({ static: profile.profile.static, dynamic: profile.profile.dynamic });`;
    const excerpt = selectCandidateAwareExcerpt({
      id: "app/api/concept-summary/route.ts#raw",
      filename: "app/api/concept-summary/route.ts",
      hunkId: "app/api/concept-summary/route.ts#raw",
      variant: "raw-file",
      text: `app/api/concept-summary/route.ts\n${patch}`,
      excerpt: patch.split("\n").filter((line) => /^\+[^+]/.test(line)).slice(0, 6).join("\n"),
    }, "This calls sm.profile with containerTag and q without filters. profile.static and profile.dynamic can reflect unrelated memories.");

    expect(excerpt).toContain("sm.profile");
    expect(excerpt).toContain("filters:");
    expect(excerpt).toContain("profile.profile.static");
    expect(excerpt).not.toContain("GET /api/concept-summary");
  });

  it("keeps the original excerpt when no technical terms overlap", async () => {
    const { selectCandidateAwareExcerpt } = await import("../src/surfacing/retrieval.js");
    expect(selectCandidateAwareExcerpt({
      id: "file.ts#raw",
      filename: "file.ts",
      hunkId: "file.ts#raw",
      variant: "raw-file",
      text: "file.ts\n+const count = 1;\n+return count;",
      excerpt: "+const count = 1;\n+return count;",
    }, "Prefer explicit transaction boundaries.")).toBe("+const count = 1;\n+return count;");
  });
});
