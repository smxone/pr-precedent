import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ paginate: vi.fn(), createComment: vi.fn(), inspect: vi.fn() }));
vi.mock("../src/lib/github.js", () => ({
  octokit: {
    paginate: mocks.paginate,
    pulls: { listFiles: vi.fn() },
    issues: { listComments: vi.fn(), createComment: mocks.createComment },
  },
}));
vi.mock("../src/lib/config.js", () => ({
  config: { github: { botLogin: "precedent[bot]" }, confidenceThreshold: 0.78, surfacingMode: "comment" },
}));
vi.mock("../src/surfacing/retrieval.js", () => ({ inspectPullRequestRetrieval: mocks.inspect }));

const candidate = {
  triggeredBy: "src/new.ts",
  triggeringHunk: "src/new.ts#h1",
  triggeringExcerpt: "+ riskyCall()",
  query: "File: src/new.ts",
  score: 0.8123,
  rawScore: 0.8123,
  rank: 1,
  documentId: "doc-1234-abcd",
  storedFilePath: "src/old.ts",
  sourcePrNumber: 2,
  sourceUrl: "https://github.test/pull/2",
  summary: "First line\nSecond line",
  evidence: [],
};

describe("surfacing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.inspect.mockResolvedValue({
      checkedFiles: 1,
      checkedQueries: 1,
      threshold: 0.78,
      decision: "surface",
      reason: "confident_match",
      profile: { id: "test-profile" },
      candidates: [candidate],
      failures: [],
    });
    mocks.createComment.mockResolvedValue({});
  });

  it("parses complete hyphenated document IDs", async () => {
    const { parsePrecedentMarker } = await import("../src/surfacing/index.js");
    expect(parsePrecedentMarker("<!-- precedent-bot:source-pr=2 precedent-bot:source-doc=doc-1234-abcd -->"))
      .toEqual({ sourceDocId: "doc-1234-abcd", sourcePrNumber: 2 });
  });

  it("ignores spoofed markers and posts compact score evidence", async () => {
    mocks.paginate.mockResolvedValue([{ user: { login: "someone" }, body: "<!-- precedent-bot:source-doc=doc-1234-abcd -->" }]);
    const { surfacePullRequest } = await import("../src/surfacing/index.js");
    const response = await surfacePullRequest({ owner: "acme", repo: "api", pullNumber: 3 });
    expect(response.posted).toBe(true);
    const body = mocks.createComment.mock.calls[0][0].body;
    expect(body).toContain("**Supermemory semantic match:** 0.81");
    expect(body).toContain("> First line\n> Second line");
    expect(body).toContain("precedent-bot:match-score=0.8123");
    expect(body).toContain("Current changed code:");
  });

  it("does not repost a document already marked by the bot", async () => {
    mocks.paginate.mockResolvedValue([{ user: { login: "precedent[bot]" }, body: "<!-- precedent-bot:source-doc=doc-1234-abcd -->" }]);
    const { surfacePullRequest } = await import("../src/surfacing/index.js");
    const response = await surfacePullRequest({ owner: "acme", repo: "api", pullNumber: 3 });
    expect(response.posted).toBe(false);
    expect(mocks.createComment).not.toHaveBeenCalled();
  });
});
