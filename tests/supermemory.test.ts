import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock("../src/lib/config.js", () => ({
  config: { supermemory: { apiKey: "", baseUrl: "http://local" } },
}));

vi.mock("supermemory", () => ({
  default: class {
    add = vi.fn();
    profile = vi.fn();
    search = { documents: vi.fn() };
    documents = { list: mocks.list };
  },
}));

describe("listAllDocuments", () => {
  beforeEach(() => mocks.list.mockReset());

  it("reads every page", async () => {
    mocks.list
      .mockResolvedValueOnce({ memories: [{ id: "a" }], pagination: { totalPages: 2 } })
      .mockResolvedValueOnce({ memories: [{ id: "b" }], pagination: { totalPages: 2 } });
    const { listAllDocuments } = await import("../src/lib/supermemory.js");
    const result = await listAllDocuments({ containerTags: ["org_repo"] });
    expect(result.map((item) => item.id)).toEqual(["a", "b"]);
    expect(mocks.list).toHaveBeenNthCalledWith(1, expect.objectContaining({ page: 1, limit: 100 }));
    expect(mocks.list).toHaveBeenNthCalledWith(2, expect.objectContaining({ page: 2, limit: 100 }));
  });
});
