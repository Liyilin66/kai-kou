const MAX_ANALYTICS_DURATION_SEC = 60 * 60 * 3;

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number.NaN;
}

export function normalizeAnalyticsDurationSec(value, fallback = 0) {
  const numeric = toFiniteNumber(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    const fallbackNumeric = toFiniteNumber(fallback);
    if (!Number.isFinite(fallbackNumeric) || fallbackNumeric <= 0) return 0;
    return Math.max(0, Math.min(MAX_ANALYTICS_DURATION_SEC, Math.round(fallbackNumeric)));
  }
  return Math.max(0, Math.min(MAX_ANALYTICS_DURATION_SEC, Math.round(numeric)));
}

export function buildPracticeAnalytics({
  source = "computed_client_flow",
  breakdown = {},
  totalActiveSec = 0
} = {}) {
  const safeBreakdown = {};

  Object.entries(breakdown && typeof breakdown === "object" ? breakdown : {}).forEach(([key, value]) => {
    const normalized = normalizeAnalyticsDurationSec(value, 0);
    if (!key) return;
    safeBreakdown[key] = normalized;
  });

  const totalFromBreakdown = Object.entries(safeBreakdown).reduce((sum, [key, value]) => {
    if (key === "total_sec") return sum;
    return sum + normalizeAnalyticsDurationSec(value, 0);
  }, 0);
  const normalizedTotal = normalizeAnalyticsDurationSec(totalActiveSec, totalFromBreakdown);

  safeBreakdown.total_sec = normalizedTotal;

  return {
    total_active_sec: normalizedTotal,
    source: `${source || "computed_client_flow"}`.trim() || "computed_client_flow",
    breakdown: safeBreakdown
  };
}
