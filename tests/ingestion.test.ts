import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(), paginate: vi.fn(), getContent: vi.fn(), addMemory: vi.fn(), listAllDocuments: vi.fn(), fetchThreads: vi.fn(),
}));
vi.mock("../src/lib/github.js", () => ({
  octokit: {
    paginate: mocks.paginate,
    pulls: { get: mocks.get, listFiles: vi.fn() },
    repos: { getContent: mocks.getContent },
  },
}));
vi.mock("../src/lib/config.js", () => ({ config: { ingestion: { finalContextLines: 8 } } }));
vi.mock("../src/lib/supermemory.js", () => ({ addMemory: mocks.addMemory, listAllDocuments: mocks.listAllDocuments }));
vi.mock("../src/ingestion/review-threads.js", () => ({ fetchResolvedReviewThreads: mocks.fetchThreads }));

function thread(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id, path: `src/${id}.ts`, line: null, startLine: null, isResolved: true, isOutdated: false,
    comments: [{ id: `comment-${id}`, databaseId: 1, body: "Use the repository error handling convention.", url: `https://github.test/thread/${id}`, diffHunk: "+ riskyCall()", isBot: false }],
    ...overrides,
  };
}

describe("resolved-thread ingestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockResolvedValue({ data: { title: "Test PR", merge_commit_sha: null } });
    mocks.paginate.mockResolvedValue([{ filename: "src/one.ts", patch: "+ safeCall()" }]);
    mocks.fetchThreads.mockResolvedValue([thread("one")]);
    mocks.listAllDocuments.mockResolvedValue([]);
    mocks.addMemory.mockResolvedValue({ id: "memory" });
  });

  it("stores one schema-v2 document per resolved thread with stable identity", async () => {
    const { ingestPullRequest } = await import("../src/ingestion/index.js");
    const result = await ingestPullRequest({ owner: "acme", repo: "api", pullNumber: 1, mergedAt: "2026-07-15T00:00:00Z" });
    expect(result).toEqual({ ingested: 1, eligible: 1, total: 1, dryRun: false });
    expect(mocks.addMemory).toHaveBeenCalledWith(expect.objectContaining({
      customId: "github-review-thread-one",
      entityContext: expect.stringContaining("durable technical guidance"),
      metadata: expect.objectContaining({ schemaVersion: 2, recordKind: "review-thread", threadId: "one" }),
    }));
    const content = mocks.addMemory.mock.calls[0][0].content;
    expect(content).toContain("[Discussion]: Review comment:");
    expect(content).toContain("GitHub reported this thread resolved");
    expect(content).toContain("No specific code change is inferred");
    expect(content).not.toContain("author");
  });

  it("skips unresolved, bot-only, and acknowledgement-only threads while retaining short technical directives", async () => {
    mocks.fetchThreads.mockResolvedValue([
      thread("unresolved", { isResolved: false }),
      thread("bot", { comments: [{ ...thread("x").comments[0], isBot: true }] }),
      thread("thanks", { comments: [{ ...thread("x").comments[0], body: "Thanks!" }] }),
      thread("short", { comments: [{ ...thread("x").comments[0], body: "Use zod." }] }),
    ]);
    const { ingestPullRequest } = await import("../src/ingestion/index.js");
    const result = await ingestPullRequest({ owner: "acme", repo: "api", pullNumber: 1, mergedAt: "2026-07-15T00:00:00Z" });
    expect(result.eligible).toBe(1);
    expect(mocks.addMemory).toHaveBeenCalledTimes(1);
    expect(mocks.addMemory.mock.calls[0][0].customId).toBe("github-review-thread-short");
  });

  it("is idempotent and fails closed when deduplication cannot be established", async () => {
    mocks.listAllDocuments
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ metadata: { threadId: "one" } }]);
    const { ingestPullRequest } = await import("../src/ingestion/index.js");
    const params = { owner: "acme", repo: "api", pullNumber: 1, mergedAt: "2026-07-15T00:00:00Z" };
    await ingestPullRequest(params);
    await ingestPullRequest(params);
    expect(mocks.addMemory).toHaveBeenCalledTimes(1);

    mocks.addMemory.mockClear();
    mocks.listAllDocuments.mockRejectedValue(new Error("offline"));
    const failed = await ingestPullRequest(params);
    expect(failed.ingested).toBe(0);
    expect(mocks.addMemory).not.toHaveBeenCalled();
  });

  it("performs no Supermemory writes in dry-run mode", async () => {
    const { ingestPullRequest } = await import("../src/ingestion/index.js");
    const result = await ingestPullRequest({ owner: "acme", repo: "api", pullNumber: 1, mergedAt: "2026-07-15T00:00:00Z", dryRun: true });
    expect(result).toMatchObject({ ingested: 1, dryRun: true });
    expect(mocks.addMemory).not.toHaveBeenCalled();
  });
});
