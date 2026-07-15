import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env["GITHUB_APP_ID"] = "1";
  process.env["GITHUB_APP_PRIVATE_KEY_PATH"] = "/tmp/key.pem";
  process.env["GITHUB_INSTALLATION_ID"] = "2";
  process.env["GITHUB_WEBHOOK_SECRET"] = "secret";
});

describe("unitInterval", () => {
  it("accepts threshold boundaries", async () => {
    const { unitInterval } = await import("../src/lib/config.js");
    expect(unitInterval("TEST", "0")).toBe(0);
    expect(unitInterval("TEST", "0.78")).toBe(0.78);
    expect(unitInterval("TEST", "1")).toBe(1);
  });

  it.each(["NaN", "Infinity", "-0.1", "1.1"])("rejects %s", async (raw) => {
    const { unitInterval } = await import("../src/lib/config.js");
    expect(() => unitInterval("TEST", raw)).toThrow("between 0 and 1");
  });
});
