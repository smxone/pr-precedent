type LogLevel = "info" | "warn" | "error";
type LogFields = Record<string, string | number | boolean | null>;

export function logEvent(level: LogLevel, event: string, fields: LogFields, error?: unknown) {
  const payload: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...fields,
  };
  if (error) {
    payload["error"] = error instanceof Error
      ? { name: error.name, message: error.message }
      : { name: "UnknownError", message: String(error) };
  }
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
