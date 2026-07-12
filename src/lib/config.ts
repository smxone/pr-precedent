import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const config = {
  github: {
    appId: required("GITHUB_APP_ID"),
    privateKeyPath: required("GITHUB_APP_PRIVATE_KEY_PATH"),
    installationId: required("GITHUB_INSTALLATION_ID"),
    webhookSecret: required("GITHUB_WEBHOOK_SECRET"),
  },
  supermemory: {
    baseUrl: process.env["SUPERMEMORY_BASE_URL"] ?? "http://localhost:6767",
    apiKey: process.env["SUPERMEMORY_API_KEY"] ?? "",
  },
  confidenceThreshold: Number(process.env["CONFIDENCE_THRESHOLD"] ?? "0.75"),
  port: Number(process.env["PORT"] ?? "3000"),
};
