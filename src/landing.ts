import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import type { Express } from "express";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const landingAssetsPath = path.resolve(__dirname, "../frontend/dist");

export function mountLanding(app: Express, assetsPath = landingAssetsPath): void {
  app.use(express.static(assetsPath));
}
