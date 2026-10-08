const ALLOWED_SIMULATED_FAILURES = new Set(["timeout", "429", "503"]);

export function getRuntimeStage() {
  const vercelEnv = `${process.env.VERCEL_ENV || ""}`.trim().toLowerCase();
  if (vercelEnv === "production") return "production";
  if (vercelEnv === "preview") return "preview";
  if (vercelEnv === "development") return "development";

  const nodeEnv = `${process.env.NODE_ENV || ""}`.trim().toLowerCase();
  if (nodeEnv === "production") return "production";
  if (nodeEnv === "test") return "test";
  if (nodeEnv === "development") return "development";

  return "development";
}

export function isDebugRuntimeEnabled() {
  const stage = getRuntimeStage();
  return stage === "development" || stage === "preview" || stage === "test";
}

export function getPrimaryFailSimulationMode() {
  if (!isDebugRuntimeEnabled()) return "";
  const raw = `${process.env.LLM_TEST_PRIMARY_FAIL || ""}`.trim().toLowerCase();
  if (!raw) return "";
  if (!ALLOWED_SIMULATED_FAILURES.has(raw)) return "";
  return raw;
}

