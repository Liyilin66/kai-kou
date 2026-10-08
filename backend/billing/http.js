export class BillingRequestError extends Error {
  constructor(status, code, message, details = {}) {
    super(message || code || "billing_request_failed");
    this.name = "BillingRequestError";
    this.status = Number.isFinite(Number(status)) ? Number(status) : 500;
    this.code = `${code || "billing_request_failed"}`.trim() || "billing_request_failed";
    this.details = details && typeof details === "object" ? details : {};
  }
}

export function setJsonResponseHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
}

export function setTextResponseHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
}

export function handleOptions(req, res, { text = false } = {}) {
  if (text) setTextResponseHeaders(res);
  else setJsonResponseHeaders(res);
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return true;
  }
  return false;
}

export function respondJson(res, status, payload) {
  setJsonResponseHeaders(res);
  return res.status(status).json(payload);
}

export function respondText(res, status, body) {
  setTextResponseHeaders(res);
  return res.status(status).send(`${body || ""}`);
}

export function respondError(res, error, fallbackMessage = "Request failed") {
  const status = Number(error?.status || 500);
  const code = `${error?.code || "billing_request_failed"}`.trim() || "billing_request_failed";
  const message = `${error?.message || fallbackMessage}`.trim() || fallbackMessage;
  const payload = {
    code: -1,
    error: code,
    message
  };

  if (error?.details && typeof error.details === "object" && Object.keys(error.details).length > 0) {
    payload.details = error.details;
  }

  return respondJson(res, status, payload);
}

export function readJsonBody(req) {
  const rawBody = req?.body;
  if (rawBody === null || rawBody === undefined || rawBody === "") {
    return {};
  }
  if (typeof rawBody === "object" && !Buffer.isBuffer(rawBody)) {
    return rawBody;
  }

  const text = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : `${rawBody}`;
  const trimmed = text.trim();
  if (!trimmed) return {};

  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    throw new BillingRequestError(400, "invalid_json_body", "Request body must be valid JSON.");
  }
}

export function getQueryParam(req, name) {
  const value = req?.query?.[name];
  if (Array.isArray(value)) return `${value[0] || ""}`.trim();
  return `${value || ""}`.trim();
}

export async function parseFormUrlEncodedRequest(req) {
  const rawBody = req?.body;

  if (rawBody && typeof rawBody === "object" && !Buffer.isBuffer(rawBody) && !Array.isArray(rawBody)) {
    return normalizeFormPayload(rawBody);
  }

  const text = await readRawBodyAsText(req, rawBody);
  return normalizeUrlEncodedText(text);
}

async function readRawBodyAsText(req, existingBody) {
  if (typeof existingBody === "string") return existingBody;
  if (Buffer.isBuffer(existingBody)) return existingBody.toString("utf8");
  if (!req || typeof req.on !== "function") return "";

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function normalizeUrlEncodedText(text) {
  const params = new URLSearchParams(`${text || ""}`);
  const payload = {};

  for (const [key, value] of params.entries()) {
    if (!key) continue;
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      payload[key] = `${payload[key]},${value}`;
    } else {
      payload[key] = value;
    }
  }

  return payload;
}

function normalizeFormPayload(payload) {
  const output = {};
  for (const [key, value] of Object.entries(payload || {})) {
    if (!key) continue;
    if (Array.isArray(value)) {
      output[key] = value.map((item) => `${item || ""}`).join(",");
      continue;
    }
    output[key] = `${value ?? ""}`;
  }
  return output;
}
