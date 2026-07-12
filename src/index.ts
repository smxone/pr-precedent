import express from "express";
import { config } from "./lib/config.js";
import { supermemory } from "./lib/supermemory.js";

async function main() {
  try {
    await supermemory.profile({ containerTag: "precedent_startup-check" });
  } catch (err) {
    console.error("[startup] Supermemory Local unreachable, refusing to serve traffic:", err);
    process.exit(1);
  }

  const app = express();
  app.use(express.json());

  app.get("/healthz", (_req, res) => {
    res.status(200).json({ ok: true });
  });

  // Webhook routes (ingestion + surfacing) land here in Phase 2/3 — see docs/TASKS.md.

  app.listen(config.port, () => {
    console.log(`[startup] Precedent webhook receiver listening on :${config.port}`);
  });
}

main();
