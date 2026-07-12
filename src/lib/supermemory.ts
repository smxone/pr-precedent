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
