import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("dashboard retrieval inspector", () => {
  const html = readFileSync(new URL("../public/dashboard/index.html", import.meta.url), "utf8");

  it("contains positive, silent, empty, and partial-failure states", () => {
    expect(html).toContain("Retrieval inspector");
    expect(html).toContain("Would surface");
    expect(html).toContain("Stayed silent");
    expect(html).toContain("No ranked memories to display");
    expect(html).toContain("remaining results are shown");
    expect(html).toContain("Why this matched");
    expect(html).toContain("Skipped safely");
  });
});
