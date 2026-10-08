import { getApiUrl } from "@/lib/api-url";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";

export const BILLING_ORDER_NO_STORAGE_KEY = "kai_kou_billing_order_no";
export const BILLING_POLL_INTERVAL_MS = 1800;
export const BILLING_MAX_POLL_ATTEMPTS = 8;
export const BILLING_PAUSED = true;
export const BILLING_PAUSED_MESSAGE = "支付功能已暂停，当前页面仅保留展示，不会发起线上支付请求。";

export const BILLING_PLANS = [
  {
    key: "week",
    name: "周卡",
    price: "6.9",
    unit: "7 天无限",
    hint: "先试试看"
  },
  {
    key: "month",
    name: "月卡",
    price: "19.9",
    unit: "30 天无限",
    hint: "最划算"
  },
  {
    key: "lifetime",
    name: "永久卡",
    price: "49.9",
    unit: "永久无限",
    hint: "一次开通"
  }
];

const BILLING_PLAN_ALIASES = {
  forever: "lifetime"
};

export function normalizeBillingPlan(value) {
  const normalized = normalizeTextValue(unwrapQueryValue(value)).toLowerCase();
  if (!normalized) return "";
  return BILLING_PLAN_ALIASES[normalized] || normalized;
}

export function getBillingPlan(planKey) {
  const normalizedPlan = normalizeBillingPlan(planKey);
  return BILLING_PLANS.find((plan) => plan.key === normalizedPlan) || null;
}

export function normalizeBillingStatus(value) {
  const normalized = normalizeTextValue(value).toLowerCase();
  if (!normalized) return "";
  if (normalized === "success") return "paid";
  if (normalized === "cancelled" || normalized === "closed") return "closed_or_cancelled";
  return normalized;
}

export function readBillingOrderNo() {
  if (typeof sessionStorage === "undefined") return "";
  try {
    return normalizeTextValue(sessionStorage.getItem(BILLING_ORDER_NO_STORAGE_KEY));
  } catch {
    return "";
  }
}

export function writeBillingOrderNo(orderNo) {
  const normalizedOrderNo = normalizeTextValue(orderNo);
  if (!normalizedOrderNo || typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(BILLING_ORDER_NO_STORAGE_KEY, normalizedOrderNo);
  } catch {
    // no-op
  }
}

export function clearBillingOrderNo() {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(BILLING_ORDER_NO_STORAGE_KEY);
  } catch {
    // no-op
  }
}

export function getBillingOrderNoFromRoute(query = {}) {
  const candidates = [query?.out_trade_no, query?.outTradeNo, query?.orderNo];

  for (const candidate of candidates) {
    const normalized = normalizeTextValue(unwrapQueryValue(candidate));
    if (normalized) return normalized;
  }

  return "";
}

export async function createBillingOrder(plan) {
  const normalizedPlan = normalizeBillingPlan(plan);
  if (!getBillingPlan(normalizedPlan)) {
    throw createBillingError("billing_plan_invalid", "请选择有效的会员套餐");
  }

  if (BILLING_PAUSED) {
    throw createBillingError("billing_paused", BILLING_PAUSED_MESSAGE);
  }

  const token = await getBillingAuthToken();
  const response = await fetch(getApiUrl("/api/billing/alipay/create-order"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      plan: normalizedPlan
    })
  });

  const payload = await readBillingJsonResponse(response);
  if (response.status === 401) {
    throw createBillingError("billing_auth_required", "登录状态已失效，请重新登录", payload);
  }
  if (!response.ok) {
    throw createBillingError(
      normalizeTextValue(payload?.error) || "billing_create_order_failed",
      normalizeTextValue(payload?.message) || "创建订单失败，请稍后重试",
      payload
    );
  }

  return toObjectValue(payload?.data) || {};
}

export async function fetchBillingOrderStatus(orderNo, { sync = true } = {}) {
  const normalizedOrderNo = normalizeTextValue(orderNo);
  if (!normalizedOrderNo) {
    throw createBillingError("billing_order_missing", "缺少订单号");
  }

  if (BILLING_PAUSED) {
    throw createBillingError("billing_paused", BILLING_PAUSED_MESSAGE);
  }

  const token = await getBillingAuthToken();
  const searchParams = new URLSearchParams({
    orderNo: normalizedOrderNo
  });

  if (sync) {
    searchParams.set("sync", "1");
  }

  const response = await fetch(getApiUrl(`/api/billing/order-status?${searchParams.toString()}`), {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const payload = await readBillingJsonResponse(response);
  if (response.status === 401) {
    throw createBillingError("billing_auth_required", "登录状态已失效，请重新登录", payload);
  }
  if (response.status === 404) {
    throw createBillingError("billing_order_not_found", "订单不存在或已失效", payload);
  }
  if (!response.ok) {
    throw createBillingError(
      normalizeTextValue(payload?.error) || "billing_status_failed",
      normalizeTextValue(payload?.message) || "查询订单状态失败，请稍后重试",
      payload
    );
  }

  return toObjectValue(payload?.data) || {};
}

export function getBillingErrorMessage(error, fallbackMessage = "操作失败，请稍后重试") {
  return normalizeTextValue(error?.message) || fallbackMessage;
}

function unwrapQueryValue(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

async function getBillingAuthToken() {
  const authStore = useAuthStore();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    throw createBillingError("billing_auth_session_error", "无法读取登录状态，请重新登录");
  }

  const token = normalizeTextValue(sessionData?.session?.access_token || authStore.session?.access_token);
  if (!token) {
    throw createBillingError("billing_auth_session_missing", "请先登录后再购买");
  }

  return token;
}

async function readBillingJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function createBillingError(code, message, payload = null) {
  const error = new Error(message);
  error.code = code;
  error.payload = payload;
  return error;
}

function normalizeTextValue(value) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return `${value}`.trim();
}

function toObjectValue(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}
