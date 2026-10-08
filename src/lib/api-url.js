const rawApiBase = `${import.meta.env?.VITE_API_BASE || ""}`.trim();

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function normalizePath(path) {
  const text = `${path || ""}`.trim();
  if (!text) return "/";
  return text.startsWith("/") ? text : `/${text}`;
}

function isAbsoluteHttpUrl(value) {
  return /^https?:\/\//i.test(value);
}

function parseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isLocalHostname(hostname) {
  const normalized = `${hostname || ""}`.trim().toLowerCase();
  return (
    normalized === "localhost"
    || normalized === "127.0.0.1"
    || normalized === "0.0.0.0"
    || normalized === "::1"
  );
}

function isRuntimeLocalOrigin() {
  if (typeof window === "undefined" || !window.location?.origin) return false;
  const runtimeOrigin = parseUrl(window.location.origin);
  if (!runtimeOrigin) return false;
  return isLocalHostname(runtimeOrigin.hostname);
}

function shouldIgnoreApiBase(apiBase) {
  if (!isAbsoluteHttpUrl(apiBase)) return false;
  const parsedApiBase = parseUrl(apiBase);
  if (!parsedApiBase) return false;
  if (!isLocalHostname(parsedApiBase.hostname)) return false;
  return !isRuntimeLocalOrigin();
}

export function getApiUrl(path) {
  const normalizedPath = normalizePath(path);
  if (!rawApiBase) return normalizedPath;
  if (!isAbsoluteHttpUrl(rawApiBase)) return normalizedPath;
  if (shouldIgnoreApiBase(rawApiBase)) return normalizedPath;
  return `${trimTrailingSlash(rawApiBase)}${normalizedPath}`;
}
