import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { config } from "./lib/config.js";
import { supermemory } from "./lib/supermemory.js";
import { webhookMiddleware } from "./webhooks/index.js";
import { feedbackExport, getDashboardData } from "./dashboard/index.js";
import { inspectPullRequestRetrieval } from "./surfacing/retrieval.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  try {
    await supermemory.profile({ containerTag: "precedent_startup-check" });
  } catch (err) {
    console.error("[startup] Supermemory Local unreachable, refusing to serve traffic:", err);
    process.exit(1);
  }

  const app = express();

  function dashboardRepositoryAllowed(owner: string, repo: string): boolean {
    return config.dashboardRepositories.has(`${owner}/${repo}`.toLowerCase());
  }

  app.get("/healthz", (_req, res) => {
    res.status(200).json({ ok: true });
  });

  // Reads the raw request body itself for signature verification — must not sit
  // behind express.json() (that would consume the stream before verification runs).
  app.use(webhookMiddleware);

  // Debug/demo dashboard — read-only, presentation over existing data only.
  // See CLAUDE.md "Debug dashboard" note for scope. Owner/repo passed as query params
  // rather than hardcoded, since this is a dev tool, not a single-tenant product page.
  app.get("/dashboard/api/data", async (req, res) => {
    const owner = String(req.query["owner"] ?? "");
    const repo = String(req.query["repo"] ?? "");
    if (!owner || !repo) {
      res.status(400).json({ error: "owner and repo query params are required" });
      return;
    }
    if (!dashboardRepositoryAllowed(owner, repo)) {
      res.status(403).json({ error: "Repository is not enabled for the read-only dashboard." });
      return;
    }
    try {
      const data = await getDashboardData(owner, repo);
      res.json(data);
    } catch (err) {
      console.error(`[dashboard] failed to load data for ${owner}/${repo}:`, err);
      res.status(500).json({ error: "Failed to load dashboard data — check server logs." });
    }
  });
  app.get("/dashboard/api/inspect", async (req, res) => {
    const owner = String(req.query["owner"] ?? "");
    const repo = String(req.query["repo"] ?? "");
    const pullNumber = Number(req.query["pullNumber"]);
    if (!owner || !repo || !Number.isInteger(pullNumber) || pullNumber <= 0) {
      res.status(400).json({ error: "owner, repo, and a positive integer pullNumber are required" });
      return;
    }
    if (!dashboardRepositoryAllowed(owner, repo)) {
      res.status(403).json({ error: "Repository is not enabled for the read-only dashboard." });
      return;
    }
    try {
      const inspection = await inspectPullRequestRetrieval({ owner, repo, pullNumber });
      res.json(inspection);
    } catch (err) {
      const status = typeof err === "object" && err !== null && "status" in err ? Number(err.status) : null;
      if (status === 404) {
        res.status(404).json({ error: `Pull request ${owner}/${repo}#${pullNumber} was not found or is inaccessible.` });
        return;
      }
      console.error(`[dashboard] failed to inspect ${owner}/${repo}#${pullNumber}:`, err);
      res.status(500).json({ error: "Failed to inspect retrieval — check server logs." });
    }
  });
  app.get("/dashboard/api/feedback-export", async (req, res) => {
    const owner = String(req.query["owner"] ?? "");
    const repo = String(req.query["repo"] ?? "");
    if (!owner || !repo) {
      res.status(400).json({ error: "owner and repo query params are required" });
      return;
    }
    if (!dashboardRepositoryAllowed(owner, repo)) {
      res.status(403).json({ error: "Repository is not enabled for the read-only dashboard." });
      return;
    }
    try {
      const data = await getDashboardData(owner, repo);
      res.json({ proposedCases: feedbackExport(data) });
    } catch (err) {
      console.error(`[dashboard] failed to export feedback for ${owner}/${repo}:`, err);
      res.status(500).json({ error: "Failed to export reviewed feedback — check server logs." });
    }
  });
  app.use("/dashboard", express.static(path.join(__dirname, "../public/dashboard")));

  app.listen(config.port, () => {
    console.log(`[startup] Precedent webhook receiver listening on :${config.port}`);
    console.log(`[startup] Dashboard available at http://localhost:${config.port}/dashboard`);
  });
}

main();
