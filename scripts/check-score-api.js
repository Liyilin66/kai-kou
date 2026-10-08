import path from "node:path";
import dotenv from "dotenv";

const DEFAULT_PORT = 3000;

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const apiPort = Number(process.env.API_PORT || process.env.PORT || DEFAULT_PORT);
const fallbackBase = `http://localhost:${Number.isFinite(apiPort) && apiPort > 0 ? Math.floor(apiPort) : DEFAULT_PORT}`;
const baseSelection = resolveBaseUrl({
  checkScoreApiBase: process.env.CHECK_SCORE_API_BASE,
  viteApiBase: process.env.VITE_API_BASE,
  viteDevApiTarget: process.env.VITE_DEV_API_TARGET,
  fallbackBase,
  fallbackSource: resolveFallbackSource()
});
const baseUrl = baseSelection.baseUrl;
const baseSource = baseSelection.source;
const scoreApiUrl = `${baseUrl}/api/score`;

async function main() {
  console.log(`[check-score-api] target: ${scoreApiUrl}`);
  console.log(`[check-score-api] source: ${baseSource}`);

  const optionsResult = await requestWithBody(scoreApiUrl, {
    method: "OPTIONS"
  });
  console.log(`[check-score-api] OPTIONS /api/score -> ${optionsResult.status}`);

  const postResult = await requestWithBody(scoreApiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      taskType: "WE",
      transcript: "healthcheck essay sample text",
      questionContent: "healthcheck question"
    })
  });

  console.log(`[check-score-api] POST /api/score -> ${postResult.status}`);
  if (postResult.status === 404 && postResult.isHtml) {
    console.error("[check-score-api] Failed: route returned 404 HTML. API traffic is likely hitting the wrong service.");
    return 1;
  }

  if (postResult.isHtml) {
    console.error("[check-score-api] Failed: HTML response detected. API traffic is likely not routed to this project API.");
    return 1;
  }

  if (postResult.status > 0 && !postResult.isHtml) {
    if (postResult.status === 401 && postResult.isJson) {
      console.log("[check-score-api] Healthy route confirmed (401 JSON without token is expected).");
    } else if (postResult.status >= 500 && postResult.isJson) {
      console.log("[check-score-api] Route is reachable but backend dependencies are not ready yet (expected in partial local setup).");
    } else {
      console.log("[check-score-api] Route is reachable.");
    }
    return 0;
  }

  console.error("[check-score-api] Failed: unexpected response shape.", {
    status: postResult.status,
    contentType: postResult.contentType,
    sample: postResult.sample
  });
  return 1;
}

async function requestWithBody(url, init) {
  try {
    const response = await fetch(url, init);
    const contentType = `${response.headers.get("content-type") || ""}`.toLowerCase();
    const text = await response.text();
    const trimmed = `${text || ""}`.trim();
    const isJson = tryParseJson(trimmed) !== null;
    const isHtml =
      contentType.includes("text/html")
      || /^<!doctype html/i.test(trimmed)
      || /^<html/i.test(trimmed)
      || trimmed.includes("<html");

    return {
      status: Number(response.status || 0),
      contentType,
      isJson,
      isHtml,
      sample: trimmed.slice(0, 200)
    };
  } catch (error) {
    throw new Error(error?.message || "request_failed");
  }
}

function tryParseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeBaseUrl(rawValue) {
  const text = `${rawValue || ""}`.trim().replace(/\/+$/, "");
  if (!text) return fallbackBase;
  if (/^https?:\/\//i.test(text)) return text;
  return fallbackBase;
}

function resolveFallbackSource() {
  if (`${process.env.API_PORT || ""}`.trim()) return "API_PORT";
  if (`${process.env.PORT || ""}`.trim()) return "PORT";
  return "DEFAULT_PORT";
}

function resolveBaseUrl({
  checkScoreApiBase,
  viteApiBase,
  viteDevApiTarget,
  fallbackBase: nextFallbackBase,
  fallbackSource
} = {}) {
  const candidates = [
    { source: "CHECK_SCORE_API_BASE", value: checkScoreApiBase },
    { source: "VITE_API_BASE", value: viteApiBase },
    { source: "VITE_DEV_API_TARGET", value: viteDevApiTarget }
  ];

  for (const item of candidates) {
    const rawValue = `${item.value || ""}`.trim();
    if (!rawValue) continue;
    const normalized = normalizeBaseUrl(rawValue);
    return {
      baseUrl: normalized,
      source: item.source
    };
  }

  return {
    baseUrl: normalizeBaseUrl(nextFallbackBase),
    source: fallbackSource
  };
}

void main()
  .then((exitCode) => {
    process.exitCode = Number(exitCode || 0);
  })
  .catch((error) => {
    console.error("[check-score-api] request failed:", error?.message || error);
    process.exitCode = 1;
  });
