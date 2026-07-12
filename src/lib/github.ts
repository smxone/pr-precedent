import { readFileSync } from "node:fs";
import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";
import { config } from "./config.js";

export const octokit = new Octokit({
  authStrategy: createAppAuth,
  auth: {
    appId: config.github.appId,
    privateKey: readFileSync(config.github.privateKeyPath, "utf8"),
    installationId: config.github.installationId,
  },
});
