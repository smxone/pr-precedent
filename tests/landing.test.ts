import { readFileSync } from "node:fs";
import type { Express } from "express";
import { describe, expect, it, vi } from "vitest";
import { landingAssetsPath, mountLanding } from "../src/landing.js";

describe("landing page static route", () => {
  it("mounts the compiled frontend as root static middleware", () => {
    const use = vi.fn();
    const app = { use } as unknown as Express;

    mountLanding(app);

    expect(landingAssetsPath).toMatch(/frontend\/dist$/);
    expect(use).toHaveBeenCalledOnce();
    expect(typeof use.mock.calls[0]?.[0]).toBe("function");
  });

  it("shows the review-to-memory product loop without foregrounding non-posting behavior", () => {
    const source = readFileSync(new URL("../frontend/src/App.tsx", import.meta.url), "utf8");

    expect(source).toContain("Resolved review");
    expect(source).toContain("Memory captured");
    expect(source).toContain("Stored as repository memory");
    expect(source).toContain("supermemory.add()");
    expect(source).toContain("transactional outbox");
    expect(source).toContain("SubscriptionRenewed");
    expect(source).toContain("automatically posts the relevant decision");
    expect(source).toContain("precedent-ai[bot] commented automatically");
    expect(source).not.toContain("try/catch");
    expect(source).not.toMatch(/silent|silence/i);
  });
});
