// Option A (local webhook replay, see conversation with user 2026-07-12): feeds a saved
// GitHub payload directly into the registered handlers via webhooks.receive(), bypassing
// HTTP + signature verification. Lets ingestion/surfacing logic be iterated on without
// live PR/webhook coordination against the demo repo (reviseflow-ai).
//
// The ingestion handler re-fetches the PR and its review comments live via REST once
// triggered — only owner/repo/pull_number/merged/merged_at from the payload matter;
// the rest can be a minimal fixture.
//
// Usage: npx tsx scripts/replay-webhook.ts <path-to-payload.json> [event-name]
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { EmitterWebhookEventName } from "@octokit/webhooks";
import { webhooks } from "../src/webhooks/index.js";

async function main() {
  const [payloadPath, eventNameArg] = process.argv.slice(2);
  if (!payloadPath) {
    console.error("Usage: npx tsx scripts/replay-webhook.ts <path-to-payload.json> [event-name]");
    process.exit(1);
  }

  const payload = JSON.parse(readFileSync(payloadPath, "utf8"));
  const name = (eventNameArg ?? "pull_request.closed") as EmitterWebhookEventName;

  await webhooks.receive({ id: randomUUID(), name, payload } as Parameters<typeof webhooks.receive>[0]);
  console.log(`OK — replayed "${name}" event from ${payloadPath}`);
}

main().catch((err) => {
  console.error("Replay failed:", err);
  process.exit(1);
});
