import express from "express";
import { config } from "./lib/config.js";
import { supermemory } from "./lib/supermemory.js";
import { webhookMiddleware } from "./webhooks/index.js";

async function main() {
  try {
    await supermemory.profile({ containerTag: "precedent_startup-check" });
  } catch (err) {
    console.error("[startup] Supermemory Local unreachable, refusing to serve traffic:", err);
    process.exit(1);
  }

  const app = express();

  app.get("/healthz", (_req, res) => {
    res.status(200).json({ ok: true });
  });

  // Reads the raw request body itself for signature verification — must not sit
  // behind express.json() (that would consume the stream before verification runs).
  app.use(webhookMiddleware);

  // Surfacing route (opened/synchronize) lands here in Phase 3 — see docs/TASKS.md.

  app.listen(config.port, () => {
    console.log(`[startup] Precedent webhook receiver listening on :${config.port}`);
  });
}

main();
