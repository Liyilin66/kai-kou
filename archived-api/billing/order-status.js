import { getAccessStatus } from "../../backend/auth/access-status.js";
import {
  ensureBillingProfile,
  loadBillingProfileByUserId,
  loadVipOrderForUser,
  maybeSyncOrderFromAlipay
} from "../../backend/billing/order-service.js";
import { BillingRequestError, getQueryParam, handleOptions, respondError, respondJson } from "../../backend/billing/http.js";
import { requireAuthenticatedUser } from "../../backend/billing/supabase-admin.js";
import { formatAmount } from "../../backend/billing/config.js";

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  if (req.method !== "GET") {
    return respondError(res, new BillingRequestError(405, "method_not_allowed", "Method not allowed."));
  }

  try {
    const { user } = await requireAuthenticatedUser(req);

    const orderNo = getQueryParam(req, "orderNo") || getQueryParam(req, "order_no");
    if (!orderNo) {
      throw new BillingRequestError(400, "order_no_required", "orderNo is required.");
    }

    let order = await loadVipOrderForUser(user.id, orderNo);
    if (!order) {
      throw new BillingRequestError(404, "order_not_found", "VIP order not found.");
    }

    const sync = getQueryParam(req, "sync") === "1";
    let reconciledBy = "";

    if (sync && order.status === "created") {
      const syncResult = await maybeSyncOrderFromAlipay(order);
      if (syncResult.reason === "paid" || syncResult.reason === "closed" || syncResult.reason === "expired_locally") {
        reconciledBy = "query";
      }
      order = await loadVipOrderForUser(user.id, orderNo) || order;
    }

    let profile = await loadBillingProfileByUserId(user.id);
    if (!profile) {
      profile = await ensureBillingProfile(user);
    }
    const access = getAccessStatus(user, profile);
    const shouldPoll = order.status === "created" && !order.entitlement_granted && !isOrderExpired(order);

    return respondJson(res, 200, {
      code: 0,
      data: {
        orderNo: order.order_no,
        plan: order.plan_code,
        amount: formatAmount(order.amount),
        status: normalizeClientOrderStatus(order),
        rawStatus: order.status,
        tradeStatus: `${order.trade_status || ""}`.trim(),
        entitlementGranted: Boolean(order.entitlement_granted),
        paidAt: order.paid_at,
        expiresAt: order.expire_at,
        shouldPoll,
        reconciledBy: reconciledBy || (order.entitlement_granted ? "notify_or_prior_sync" : ""),
        vip: {
          accessStatus: access.accessStatus,
          isPremium: access.isPremium,
          vipPlan: access.vipPlan || null,
          vipExpiresAt: access.vipExpiresAt
        }
      }
    });
  } catch (error) {
    return respondError(res, error, "Failed to load order status.");
  }
}

function isOrderExpired(order) {
  const expireAt = new Date(order?.expire_at || "");
  if (!Number.isFinite(expireAt.getTime())) return false;
  return expireAt.getTime() <= Date.now();
}

function normalizeClientOrderStatus(order) {
  if (`${order?.status || ""}` === "paid" && order?.entitlement_granted) {
    return "paid";
  }
  if (`${order?.status || ""}` === "closed" || isOrderExpired(order)) {
    return "closed";
  }
  return "created";
}
