import { inspectRequiredServerEnv, readServerEnv } from "../auth/server-env.js";
import { BillingRequestError } from "./http.js";

const PLAN_SPECS = {
  week: {
    plan: "week",
    amount: 6.9,
    label: "VIP Week",
    subject: "Kai-Kou VIP Week"
  },
  month: {
    plan: "month",
    amount: 19.9,
    label: "VIP Month",
    subject: "Kai-Kou VIP Month"
  },
  lifetime: {
    plan: "lifetime",
    amount: 49.9,
    label: "VIP Lifetime",
    subject: "Kai-Kou VIP Lifetime"
  }
};

export function getPlanSpec(plan) {
  const normalizedPlan = `${plan || ""}`.trim().toLowerCase();
  const spec = PLAN_SPECS[normalizedPlan];
  if (!spec) {
    throw new BillingRequestError(400, "invalid_plan", "Unsupported VIP plan.");
  }
  return spec;
}

export function formatAmount(amount) {
  const number = Number(amount);
  if (!Number.isFinite(number)) return "0.00";
  return number.toFixed(2);
}

export function getTimeoutExpress() {
  const value = readServerEnv("ALIPAY_TIMEOUT_EXPRESS");
  return value || "15m";
}

export function getSiteUrl() {
  const siteUrl = normalizeAbsoluteUrl(readServerEnv("SITE_URL"));
  if (!siteUrl) {
    throw new BillingRequestError(500, "site_url_missing", "SITE_URL is required for billing callbacks.");
  }
  return siteUrl;
}

export function getBillingUrls() {
  const siteUrl = getSiteUrl();
  return {
    siteUrl,
    notifyUrl: `${siteUrl}/api/billing/alipay/notify`,
    returnUrl: `${siteUrl}/billing/result`,
    quitUrl: `${siteUrl}/billing/result`
  };
}

export function getAlipayEnvConfig() {
  const env = inspectRequiredServerEnv([
    "ALIPAY_APP_ID",
    "ALIPAY_GATEWAY_URL",
    "ALIPAY_APP_PRIVATE_KEY",
    "ALIPAY_PUBLIC_KEY",
    "ALIPAY_SELLER_ID"
  ]);

  if (!env.ok) {
    throw new BillingRequestError(
      500,
      "alipay_not_configured",
      `Missing required Alipay env: ${env.missing.join(", ")}.`
    );
  }

  const gatewayUrl = normalizeAbsoluteUrl(env.values.ALIPAY_GATEWAY_URL);
  if (!gatewayUrl) {
    throw new BillingRequestError(500, "alipay_gateway_invalid", "ALIPAY_GATEWAY_URL is invalid.");
  }

  return {
    appId: env.values.ALIPAY_APP_ID,
    gatewayUrl,
    appPrivateKey: normalizePem(env.values.ALIPAY_APP_PRIVATE_KEY),
    alipayPublicKey: normalizePem(env.values.ALIPAY_PUBLIC_KEY),
    sellerId: env.values.ALIPAY_SELLER_ID,
    timeoutExpress: getTimeoutExpress()
  };
}

export function resolveTimeoutExpiry(timeoutExpress, now = new Date()) {
  const text = `${timeoutExpress || ""}`.trim().toLowerCase();
  const baseTime = new Date(now);
  if (!text) {
    baseTime.setMinutes(baseTime.getMinutes() + 15);
    return baseTime;
  }

  const matched = text.match(/^(\d+)([mhd])$/);
  if (matched) {
    const amount = Math.max(1, Number(matched[1] || 0));
    const unit = matched[2];
    if (unit === "m") baseTime.setMinutes(baseTime.getMinutes() + amount);
    if (unit === "h") baseTime.setHours(baseTime.getHours() + amount);
    if (unit === "d") baseTime.setDate(baseTime.getDate() + amount);
    return baseTime;
  }

  if (text === "1c") {
    baseTime.setHours(24, 0, 0, 0);
    return baseTime;
  }

  baseTime.setMinutes(baseTime.getMinutes() + 15);
  return baseTime;
}

export function generateOrderNo(now = new Date()) {
  const timestamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds())
  ].join("");
  const randomSuffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `KKVIP${timestamp}${randomSuffix}`;
}

function pad(value) {
  return `${value}`.padStart(2, "0");
}

function normalizeAbsoluteUrl(value) {
  const normalized = `${value || ""}`.trim().replace(/\/+$/, "");
  if (!normalized) return "";

  try {
    return new URL(normalized).toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function normalizePem(value) {
  return `${value || ""}`.trim().replace(/\\n/g, "\n");
}
