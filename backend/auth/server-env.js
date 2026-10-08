import { getRuntimeStage } from "../llm/runtime-env.js";

export const SERVER_UNAVAILABLE_MESSAGE = "服务暂时不可用，请稍后再试";

export function readServerEnv(name) {
  return `${process.env[name] || ""}`.trim();
}

export function inspectRequiredServerEnv(envNames) {
  const values = {};
  const missing = [];

  for (const envName of envNames) {
    const value = readServerEnv(envName);
    values[envName] = value;

    if (!value) {
      missing.push(envName);
    }
  }

  return {
    ok: missing.length === 0,
    values,
    missing
  };
}

export function shouldExposeServerErrorDetail() {
  const stage = getRuntimeStage();
  return stage === "development" || stage === "test";
}

export function formatScopedLogMessage(scope, message, missingEnv = []) {
  const suffix = Array.isArray(missingEnv) && missingEnv.length > 0
    ? ` Missing env: ${missingEnv.join(", ")}.`
    : "";

  return `[${scope}] ${message}${suffix}`;
}
