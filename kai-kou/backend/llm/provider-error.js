const NON_FALLBACK_HTTP_STATUS = new Set([400, 413, 422]);
const NETWORK_ERROR_CODES = new Set([
  "ETIMEDOUT",
  "ECONNRESET",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "UND_ERR_CONNECT_TIMEOUT"
]);

export class ProviderError extends Error {
  constructor(message, details = {}) {
    super(message || "Provider request failed");
    this.name = "ProviderError";
    this.provider = details.provider || "unknown";
    this.status = Number.isFinite(Number(details.status)) ? Number(details.status) : undefined;
    this.raw_error_type = details.raw_error_type || "";
    this.fallback_allowed = Boolean(details.fallback_allowed);
    this.error_stage = "provider_call";
    this.model = `${details.model || ""}`.trim();
    this.timeout_ms = Number.isFinite(Number(details.timeout_ms)) ? Math.round(Number(details.timeout_ms)) : undefined;
    this.sanitized_error_body = details.sanitized_error_body || null;
    if (details.cause) this.cause = details.cause;
  }
}

export function createProviderError(provider, details = {}) {
  const status = Number.isFinite(Number(details.status)) ? Number(details.status) : undefined;
  const resolvedRawType = details.raw_error_type || resolveRawErrorType(provider, details, status);
  const fallbackAllowed =
    typeof details.fallback_allowed === "boolean" ? details.fallback_allowed : resolveFallbackAllowed(status, details);

  return new ProviderError(details.message || `${provider} request failed`, {
    provider,
    status,
    raw_error_type: resolvedRawType,
    fallback_allowed: fallbackAllowed,
    model: details.model,
    timeout_ms: details.timeout_ms,
    sanitized_error_body: details.sanitized_error_body,
    cause: details.cause
  });
}

export function toProviderError(provider, error) {
  if (error instanceof ProviderError) return error;

  const status = Number.isFinite(Number(error?.status)) ? Number(error.status) : undefined;
  const connectTimeout = isConnectTimeoutError(error);
  const timeout = isTimeoutError(error);
  const network = isNetworkError(error);

  if (connectTimeout) {
    return createProviderError(provider, {
      message: `${provider} connect timeout`,
      status,
      raw_error_type: `${provider}_connect_timeout`,
      fallback_allowed: true,
      cause: error
    });
  }

  if (timeout) {
    return createProviderError(provider, {
      message: `${provider} timeout`,
      status,
      raw_error_type: `${provider}_response_timeout`,
      fallback_allowed: true,
      cause: error
    });
  }

  if (network) {
    return createProviderError(provider, {
      message: `${provider} network error`,
      status,
      raw_error_type: `${provider}_network_error`,
      fallback_allowed: true,
      cause: error
    });
  }

  return createProviderError(provider, {
    message: error?.message || `${provider} unknown error`,
    status,
    raw_error_type: status ? `${provider}_http_${status}` : `${provider}_unexpected_error`,
    fallback_allowed: resolveFallbackAllowed(status, {}),
    cause: error
  });
}

export function isFallbackEligible(error) {
  return Boolean(error?.fallback_allowed);
}

function resolveRawErrorType(provider, details, status) {
  if (details.timeout) return `${provider}_timeout`;
  if (details.network) return `${provider}_network_error`;
  if (status) return `${provider}_http_${status}`;
  return `${provider}_unexpected_error`;
}

function resolveFallbackAllowed(status, details) {
  if (details.timeout || details.network) return true;
  if (NON_FALLBACK_HTTP_STATUS.has(status)) return false;
  return true;
}

function isConnectTimeoutError(error) {
  const code = `${error?.code || ""}`.toUpperCase();
  const causeCode = `${error?.cause?.code || ""}`.toUpperCase();
  const message = `${error?.message || ""}`.toLowerCase();
  if (code === "UND_ERR_CONNECT_TIMEOUT" || causeCode === "UND_ERR_CONNECT_TIMEOUT") return true;
  if ((code === "ETIMEDOUT" || causeCode === "ETIMEDOUT") && message.includes("fetch failed")) return true;
  return message.includes("connect timeout") || message.includes("connect timed out");
}

function isTimeoutError(error) {
  const name = `${error?.name || ""}`.toLowerCase();
  const code = `${error?.code || ""}`.toUpperCase();
  const causeCode = `${error?.cause?.code || ""}`.toUpperCase();
  const message = `${error?.message || ""}`.toLowerCase();
  if (name === "aborterror") return true;
  if (code === "ABORT_ERR" || code === "ETIMEDOUT") return true;
  if (causeCode === "ETIMEDOUT") return true;
  return message.includes("timed out") || message.includes("timeout");
}

function isNetworkError(error) {
  const code = `${error?.code || ""}`.toUpperCase();
  const causeCode = `${error?.cause?.code || ""}`.toUpperCase();
  const message = `${error?.message || ""}`.toLowerCase();
  if (NETWORK_ERROR_CODES.has(code)) return true;
  if (NETWORK_ERROR_CODES.has(causeCode)) return true;
  return (
    message.includes("fetch failed")
    || message.includes("network")
    || message.includes("socket hang up")
    || message.includes("connect econnreset")
  );
}
