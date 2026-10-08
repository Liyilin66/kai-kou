import { callGemini } from "../../backend/llm/providers/gemini.js";
import { callGroq, getGroqApiKeyFromEnv } from "../../backend/llm/providers/groq.js";
import { getRuntimeStage, isDebugRuntimeEnabled } from "../../backend/llm/runtime-env.js";

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite";
const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";
const HEALTHCHECK_PROMPT = 'Return JSON only: {"ok":true}';

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!isDebugRuntimeEnabled()) return res.status(404).json({ error: "not_found" });

  const geminiModel = `${process.env.LLM_GEMINI_MODEL || DEFAULT_GEMINI_MODEL}`.trim() || DEFAULT_GEMINI_MODEL;
  const groqModel = `${process.env.LLM_GROQ_MODEL || DEFAULT_GROQ_MODEL}`.trim() || DEFAULT_GROQ_MODEL;
  const geminiApiKey = `${process.env.GEMINI_API_KEY || ""}`.trim();
  const groqApiKey = getGroqApiKeyFromEnv();

  const geminiConfigured = Boolean(geminiApiKey && geminiApiKey !== "YOUR_GEMINI_API_KEY");
  const groqConfigured = Boolean(groqApiKey);
  const geminiKeySuffix = resolveKeySuffix(geminiApiKey);
  const groqKeySuffix = resolveKeySuffix(groqApiKey);

  let geminiOk = false;
  let groqOk = false;
  let geminiError = null;
  let groqError = null;

  if (geminiConfigured) {
    try {
      await callGemini({
        prompt: HEALTHCHECK_PROMPT,
        apiKey: geminiApiKey,
        model: geminiModel,
        timeoutMs: 5000,
        disablePrimaryFailSimulation: true
      });
      geminiOk = true;
    } catch (error) {
      geminiError = summarizeError(error);
    }
  } else {
    geminiError = { message: "GEMINI_API_KEY missing" };
  }

  if (groqConfigured) {
    try {
      await callGroq({
        prompt: HEALTHCHECK_PROMPT,
        apiKey: groqApiKey,
        model: groqModel,
        timeoutMs: 5000
      });
      groqOk = true;
    } catch (error) {
      groqError = summarizeError(error);
    }
  } else {
    groqError = { message: "GROQ_API_KEY (or legacy GROP_API_KEY) missing" };
  }

  return res.status(200).json({
    runtime_stage: getRuntimeStage(),
    gemini_configured: geminiConfigured,
    groq_configured: groqConfigured,
    gemini_key_suffix: geminiKeySuffix,
    groq_key_suffix: groqKeySuffix,
    gemini_ok: geminiOk,
    groq_ok: groqOk,
    gemini_model: geminiModel,
    groq_model: groqModel,
    error_summary: {
      gemini: geminiError,
      groq: groqError
    }
  });
}

function summarizeError(error) {
  const status = Number(error?.status);
  const payload = {
    raw_error_type: `${error?.raw_error_type || ""}` || undefined,
    status: Number.isFinite(status) ? status : undefined,
    message: safeErrorMessage(error?.message || "provider_error")
  };
  return payload;
}

function resolveKeySuffix(apiKey) {
  const normalized = `${apiKey || ""}`.trim();
  if (!normalized) return "";
  const suffixLength = Math.min(6, Math.max(4, normalized.length));
  return normalized.slice(-suffixLength);
}

function safeErrorMessage(message) {
  const clean = `${message || ""}`.trim();
  if (!clean) return "provider_error";
  return clean.length > 200 ? `${clean.slice(0, 200)}...` : clean;
}
