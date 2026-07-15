import Supermemory from "supermemory";
import { config } from "./config.js";

export const supermemory = new Supermemory({
  apiKey: config.supermemory.apiKey,
  baseURL: config.supermemory.baseUrl,
});

// Verified against node_modules/supermemory@4.24.12: add() and profile() are
// top-level client methods, NOT client.memories.add() — client.memories only
// exposes forget()/updateMemory(). See docs/DATA_MODEL.md.
export function addMemory(params: Parameters<typeof supermemory.add>[0]) {
  return supermemory.add(params);
}

export function searchDocuments(params: Parameters<typeof supermemory.search.documents>[0]) {
  return supermemory.search.documents(params);
}

export function getProfile(params: Parameters<typeof supermemory.profile>[0]) {
  return supermemory.profile(params);
}

type DocumentListParams = Parameters<typeof supermemory.documents.list>[0];
type DocumentListMemory = Awaited<ReturnType<typeof supermemory.documents.list>>["memories"][number];

// The SDK exposes page-based listing rather than an async paginator. Keep the loop
// here so ingestion and the dashboard cannot silently operate on only the first page.
export async function listAllDocuments(params: Omit<DocumentListParams, "page" | "limit"> = {}): Promise<DocumentListMemory[]> {
  const memories: DocumentListMemory[] = [];
  const limit = 100;
  let page = 1;

  while (true) {
    const response = await supermemory.documents.list({ ...params, page, limit });
    memories.push(...response.memories);
    if (page >= response.pagination.totalPages) return memories;
    page++;
  }
}
