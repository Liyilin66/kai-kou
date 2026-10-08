import { assertNotifyMatchesConfig, verifyNotifySignature } from "../../../backend/billing/alipay.js";
import { confirmVipOrderPayment, loadVipOrderByOrderNo, markVipOrderClosed } from "../../../backend/billing/order-service.js";
import {
  BillingRequestError,
  handleOptions,
  parseFormUrlEncodedRequest,
  respondText
} from "../../../backend/billing/http.js";

const SUCCESS_STATUSES = new Set(["TRADE_SUCCESS", "TRADE_FINISHED"]);

export default async function handler(req, res) {
  if (handleOptions(req, res, { text: true })) return;

  if (req.method !== "POST") {
    return respondText(res, 405, "fail");
  }

  try {
    const payload = await parseFormUrlEncodedRequest(req);
    verifyNotifySignature(payload);
    assertNotifyMatchesConfig(payload);

    const orderNo = `${payload.out_trade_no || ""}`.trim();
    const order = await loadVipOrderByOrderNo(orderNo);
    if (!order?.order_no) {
      throw new BillingRequestError(404, "order_not_found", "VIP order not found.");
    }

    const totalAmount = `${payload.total_amount || ""}`.trim();
    const paidAmount = Number(totalAmount || 0);
    if (!Number.isFinite(paidAmount) || paidAmount <= 0) {
      throw new BillingRequestError(400, "notify_amount_invalid", "Alipay notify total_amount is invalid.");
    }

    const tradeStatus = `${payload.trade_status || ""}`.trim();
    if (SUCCESS_STATUSES.has(tradeStatus)) {
      await confirmVipOrderPayment({
        orderNo,
        tradeStatus,
        paidAmount,
        alipayTradeNo: `${payload.trade_no || ""}`.trim(),
        buyerId: `${payload.buyer_id || payload.buyer_user_id || ""}`.trim(),
        paidAt: `${payload.gmt_payment || ""}`.trim(),
        payload,
        source: "notify"
      });
      return respondText(res, 200, "success");
    }

    if (tradeStatus === "TRADE_CLOSED") {
      await markVipOrderClosed(orderNo, "TRADE_CLOSED");
      return respondText(res, 200, "success");
    }

    return respondText(res, 200, "success");
  } catch (error) {
    console.error("[billing:notify] failed", {
      code: error?.code,
      message: error?.message
    });
    return respondText(res, 400, "fail");
  }
}
