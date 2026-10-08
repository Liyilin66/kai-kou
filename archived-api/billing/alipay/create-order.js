import { buildWapPayUrl } from "../../../backend/billing/alipay.js";
import { createOrReuseVipOrder, ensureBillingProfile } from "../../../backend/billing/order-service.js";
import { BillingRequestError, handleOptions, readJsonBody, respondError, respondJson } from "../../../backend/billing/http.js";
import { requireAuthenticatedUser } from "../../../backend/billing/supabase-admin.js";
import { formatAmount, getPlanSpec } from "../../../backend/billing/config.js";

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  if (req.method !== "POST") {
    return respondError(res, new BillingRequestError(405, "method_not_allowed", "Method not allowed."));
  }

  try {
    const { user } = await requireAuthenticatedUser(req);
    const profile = await ensureBillingProfile(user);
    const body = readJsonBody(req);
    const planSpec = getPlanSpec(body?.plan);
    const { order, reused } = await createOrReuseVipOrder({
      user,
      profile,
      plan: planSpec.plan
    });
    const payUrl = buildWapPayUrl({
      orderNo: order.order_no,
      amount: order.amount,
      subject: order.subject
    });

    return respondJson(res, 200, {
      code: 0,
      data: {
        orderNo: order.order_no,
        plan: order.plan_code,
        amount: formatAmount(order.amount),
        status: order.status,
        expiresAt: order.expire_at,
        payUrl,
        reused
      }
    });
  } catch (error) {
    return respondError(res, error, "Failed to create VIP order.");
  }
}
