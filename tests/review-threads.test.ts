import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ graphql: vi.fn() }));
vi.mock("../src/lib/github.js", () => ({ octokit: { graphql: mocks.graphql } }));

function comment(id: string) {
  return { id, databaseId: 1, body: `Technical decision ${id}`, url: `https://github.test/${id}`, diffHunk: "+ code", author: { __typename: "User", login: "human" } };
}

describe("GitHub review thread pagination", () => {
  beforeEach(() => mocks.graphql.mockReset());

  it("paginates both threads and nested comments", async () => {
    mocks.graphql
      .mockResolvedValueOnce({ repository: { pullRequest: { reviewThreads: {
        nodes: [{ id: "t1", path: "one.ts", line: 2, startLine: null, isResolved: true, isOutdated: true, comments: { nodes: [comment("c1")], pageInfo: { hasNextPage: true, endCursor: "c-next" } } }],
        pageInfo: { hasNextPage: true, endCursor: "t-next" },
      } } } })
      .mockResolvedValueOnce({ node: { comments: { nodes: [comment("c2")], pageInfo: { hasNextPage: false, endCursor: null } } } })
      .mockResolvedValueOnce({ repository: { pullRequest: { reviewThreads: {
        nodes: [{ id: "t2", path: "two.ts", line: 4, startLine: 3, isResolved: false, isOutdated: false, comments: { nodes: [comment("c3")], pageInfo: { hasNextPage: false, endCursor: null } } }],
        pageInfo: { hasNextPage: false, endCursor: null },
      } } } });

    const { fetchResolvedReviewThreads } = await import("../src/ingestion/review-threads.js");
    const threads = await fetchResolvedReviewThreads({ owner: "acme", repo: "api", pullNumber: 7 });
    expect(threads).toHaveLength(2);
    expect(threads[0]?.comments.map((item) => item.id)).toEqual(["c1", "c2"]);
    expect(threads[0]).toMatchObject({ isResolved: true, isOutdated: true });
    expect(mocks.graphql).toHaveBeenCalledTimes(3);
  });
});
