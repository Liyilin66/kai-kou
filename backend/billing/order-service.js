import { getAccessStatus } from "../auth/access-status.js";
import {
  formatAmount,
  getAlipayEnvConfig,
  generateOrderNo,
  getPlanSpec,
  getTimeoutExpress,
  resolveTimeoutExpiry
} from "./config.js";
import { queryTradeByOrderNo } from "./alipay.js";
import { BillingRequestError } from "./http.js";
import { ensureProfileForUser, getBillingAdminClient } from "./supabase-admin.js";

const BILLING_CHANNEL = "alipay_wap";
const QUERY_THROTTLE_SECONDS = 8;

export async function ensureBillingProfile(user, supabase = getBillingAdminClient()) {
  return ensureProfileForUser(user, supabase);
}

export async function createOrReuseVipOrder({ user, profile, plan }) {
  const supabase = getBillingAdminClient();
  const planSpec = getPlanSpec(plan);
  const access = getAccessStatus(user, profile);

  if (access.isLegacyLifetime || access.vipPlan === "lifetime") {
    throw new BillingRequestError(409, "already_lifetime", "You are already a lifetime VIP member.");
  }

  const userId = `${user?.id || ""}`.trim();
  if (!userId) {
    throw new BillingRequestError(400, "user_id_required", "Authenticated user id is required.");
  }

  const now = new Date();
  await closeExpiredCreatedOrdersForUser(userId, supabase, now);

  const { data: reusableOrder, error: reusableError } = await supabase
    .from("vip_orders")
    .select("*")
    .eq("user_id", userId)
    .eq("channel", BILLING_CHANNEL)
    .eq("plan_code", planSpec.plan)
    .eq("status", "created")
    .gt("expire_at", now.toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (reusableError) {
    throw new BillingRequestError(500, "order_lookup_failed", "Failed to look up reusable VIP order.");
  }

  if (reusableOrder?.order_no) {
    return {
      order: reusableOrder,
      reused: true
    };
  }

  const timeoutExpress = getTimeoutExpress();
  const expireAt = resolveTimeoutExpiry(timeoutExpress, now);
  const orderNo = generateOrderNo(now);

  const { data: insertedOrder, error: insertError } = await supabase
    .from("vip_orders")
    .insert({
      order_no: orderNo,
      user_id: userId,
      channel: BILLING_CHANNEL,
      plan_code: planSpec.plan,
      subject: planSpec.subject,
      amount: Number(formatAmount(planSpec.amount)),
      currency: "CNY",
      status: "created",
      expire_at: expireAt.toISOString()
    })
    .select("*")
    .single();

  if (insertError || !insertedOrder) {
    throw new BillingRequestError(500, "create_order_failed", "Failed to create VIP order.");
  }

  return {
    order: insertedOrder,
    reused: false
  };
}

export async function loadVipOrderForUser(userId, orderNo) {
  const supabase = getBillingAdminClient();
  const normalizedUserId = `${userId || ""}`.trim();
  const normalizedOrderNo = `${orderNo || ""}`.trim();
  if (!normalizedUserId || !normalizedOrderNo) {
    throw new BillingRequestError(400, "order_lookup_invalid", "userId and orderNo are required.");
  }

  const { data, error } = await supabase
    .from("vip_orders")
    .select("*")
    .eq("user_id", normalizedUserId)
    .eq("order_no", normalizedOrderNo)
    .maybeSingle();

  if (error) {
    throw new BillingRequestError(500, "order_lookup_failed", "Failed to load VIP order.");
  }

  return data || null;
}

export async function loadVipOrderByOrderNo(orderNo) {
  const supabase = getBillingAdminClient();
  const normalizedOrderNo = `${orderNo || ""}`.trim();
  if (!normalizedOrderNo) {
    throw new BillingRequestError(400, "order_no_required", "orderNo is required.");
  }

  const { data, error } = await supabase
    .from("vip_orders")
    .select("*")
    .eq("order_no", normalizedOrderNo)
    .maybeSingle();

  if (error) {
    throw new BillingRequestError(500, "order_lookup_failed", "Failed to load VIP order.");
  }

  return data || null;
}

export async function loadBillingProfileByUserId(userId) {
  const supabase = getBillingAdminClient();
  const normalizedUserId = `${userId || ""}`.trim();
  if (!normalizedUserId) {
    throw new BillingRequestError(400, "user_id_required", "userId is required.");
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", normalizedUserId)
    .maybeSingle();

  if (error) {
    throw new BillingRequestError(500, "profile_load_failed", "Failed to load billing profile.");
  }

  return data || null;
}

export async function confirmVipOrderPayment({
  orderNo,
  tradeStatus,
  paidAmount,
  alipayTradeNo = "",
  buyerId = "",
  paidAt = "",
  payload = null,
  source = "notify"
}) {
  const supabase = getBillingAdminClient();
  const { data, error } = await supabase.rpc("confirm_vip_order_payment", {
    p_order_no: `${orderNo || ""}`.trim(),
    p_trade_status: `${tradeStatus || ""}`.trim(),
    p_paid_amount: Number(formatAmount(paidAmount)),
    p_alipay_trade_no: `${alipayTradeNo || ""}`.trim() || null,
    p_buyer_id: `${buyerId || ""}`.trim() || null,
    p_paid_at: `${paidAt || ""}`.trim() || null,
    p_notify_payload: payload && typeof payload === "object" ? payload : null,
    p_source: `${source || "notify"}`.trim()
  });

  if (error) {
    throw new BillingRequestError(500, "confirm_payment_failed", error.message || "Failed to confirm paid VIP order.");
  }

  return data || null;
}

export async function markVipOrderClosed(orderNo, reason = "TRADE_CLOSED") {
  const supabase = getBillingAdminClient();
  const normalizedOrderNo = `${orderNo || ""}`.trim();
  if (!normalizedOrderNo) {
    throw new BillingRequestError(400, "order_no_required", "orderNo is required.");
  }

  const { data, error } = await supabase
    .from("vip_orders")
    .update({
      status: "closed",
      trade_status: reason,
      last_error: reason
    })
    .eq("order_no", normalizedOrderNo)
    .neq("status", "paid")
    .select("*")
    .maybeSingle();

  if (error) {
    throw new BillingRequestError(500, "close_order_failed", "Failed to update closed VIP order.");
  }

  return data || null;
}

export async function maybeSyncOrderFromAlipay(order) {
  const normalizedOrder = order && typeof order === "object" ? order : null;
  if (!normalizedOrder?.order_no) {
    throw new BillingRequestError(400, "order_required", "Valid order is required for sync.");
  }

  if (`${normalizedOrder.status || ""}` === "paid" && normalizedOrder.entitlement_granted) {
    return {
      synced: false,
      reason: "already_paid",
      result: null
    };
  }

  if (isExpiredOrder(normalizedOrder)) {
    await markVipOrderClosed(normalizedOrder.order_no, "LOCAL_EXPIRED");
    return {
      synced: false,
      reason: "expired_locally",
      result: null
    };
  }

  const slot = await acquireQuerySlot(normalizedOrder.order_no);
  if (!slot.allowed) {
    return {
      synced: false,
      reason: "throttled",
      result: null,
      slot
    };
  }

  const queryResult = await queryTradeByOrderNo(normalizedOrder.order_no);
  if (!queryResult.ok) {
    if (queryResult.code === "40004" && queryResult.subCode === "ACQ.TRADE_NOT_EXIST") {
      return {
        synced: false,
        reason: "trade_not_exist_yet",
        result: queryResult,
        slot
      };
    }

    throw new BillingRequestError(
      502,
      "alipay_query_failed",
      queryResult.message || "Alipay order query failed.",
      {
        code: queryResult.code,
        sub_code: queryResult.subCode
      }
    );
  }

  const alipayConfig = getAlipayEnvConfig();
  if (queryResult.outTradeNo && queryResult.outTradeNo !== normalizedOrder.order_no) {
    throw new BillingRequestError(502, "alipay_query_order_mismatch", "Alipay query out_trade_no does not match.");
  }
  if (queryResult.sellerId && queryResult.sellerId !== alipayConfig.sellerId) {
    throw new BillingRequestError(502, "alipay_query_seller_mismatch", "Alipay query seller_id does not match.");
  }

  if (queryResult.tradeStatus === "TRADE_SUCCESS" || queryResult.tradeStatus === "TRADE_FINISHED") {
    const confirmed = await confirmVipOrderPayment({
      orderNo: normalizedOrder.order_no,
      tradeStatus: queryResult.tradeStatus,
      paidAmount: queryResult.totalAmount,
      alipayTradeNo: queryResult.tradeNo,
      buyerId: queryResult.buyerId,
      paidAt: queryResult.paidAt,
      payload: queryResult.raw,
      source: "query"
    });

    return {
      synced: true,
      reason: "paid",
      result: confirmed,
      queryResult,
      slot
    };
  }

  if (queryResult.tradeStatus === "TRADE_CLOSED") {
    await markVipOrderClosed(normalizedOrder.order_no, "TRADE_CLOSED");
    return {
      synced: true,
      reason: "closed",
      result: queryResult,
      slot
    };
  }

  return {
    synced: true,
    reason: "pending",
    result: queryResult,
    slot
  };
}

function isExpiredOrder(order, now = new Date()) {
  const expireAt = new Date(order?.expire_at || "");
  if (!Number.isFinite(expireAt.getTime())) return false;
  return expireAt.getTime() <= now.getTime();
}

async function closeExpiredCreatedOrdersForUser(userId, supabase, now = new Date()) {
  await supabase
    .from("vip_orders")
    .update({
      status: "closed",
      trade_status: "LOCAL_EXPIRED",
      last_error: "LOCAL_EXPIRED"
    })
    .eq("user_id", userId)
    .eq("status", "created")
    .lte("expire_at", now.toISOString());
}

async function acquireQuerySlot(orderNo) {
  const supabase = getBillingAdminClient();
  const { data, error } = await supabase.rpc("acquire_vip_order_query_slot", {
    p_order_no: `${orderNo || ""}`.trim(),
    p_min_interval_seconds: QUERY_THROTTLE_SECONDS
  });

  if (error) {
    throw new BillingRequestError(500, "query_slot_failed", error.message || "Failed to acquire VIP order query slot.");
  }

  return data || {
    allowed: false
  };
}
