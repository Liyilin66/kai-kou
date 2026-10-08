import crypto from "node:crypto";
import { BillingRequestError } from "./http.js";
import { formatAmount, getAlipayEnvConfig, getBillingUrls } from "./config.js";

const OPEN_API_VERSION = "1.0";
const OPEN_API_FORMAT = "JSON";
const OPEN_API_CHARSET = "utf-8";
const OPEN_API_SIGN_TYPE = "RSA2";
const OPEN_API_PRODUCT_CODE = "QUICK_WAP_PAY";

export function buildWapPayUrl({ orderNo, amount, subject }) {
  const config = getAlipayEnvConfig();
  const urls = getBillingUrls();
  const params = buildCommonOpenApiParams({
    appId: config.appId,
    method: "alipay.trade.wap.pay",
    notifyUrl: urls.notifyUrl,
    returnUrl: urls.returnUrl,
    bizContent: {
      out_trade_no: orderNo,
      total_amount: formatAmount(amount),
      subject,
      seller_id: config.sellerId,
      product_code: OPEN_API_PRODUCT_CODE,
      timeout_express: config.timeoutExpress,
      quit_url: urls.quitUrl
    }
  });

  params.sign = signParams(params, config.appPrivateKey);
  return `${config.gatewayUrl}?${new URLSearchParams(params).toString()}`;
}

export async function queryTradeByOrderNo(orderNo) {
  const config = getAlipayEnvConfig();
  const params = buildCommonOpenApiParams({
    appId: config.appId,
    method: "alipay.trade.query",
    bizContent: {
      out_trade_no: orderNo
    }
  });
  params.sign = signParams(params, config.appPrivateKey);

  const response = await fetch(config.gatewayUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8"
    },
    body: new URLSearchParams(params).toString()
  });

  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BillingRequestError(502, "alipay_query_invalid_json", "Alipay trade query returned invalid JSON.");
  }

  const envelope = parsed?.alipay_trade_query_response || null;
  if (!envelope) {
    throw new BillingRequestError(502, "alipay_query_invalid_response", "Alipay trade query response is missing.");
  }

  const code = `${envelope.code || ""}`.trim();
  if (code === "10000") {
    return {
      ok: true,
      code,
      tradeStatus: `${envelope.trade_status || ""}`.trim(),
      tradeNo: `${envelope.trade_no || ""}`.trim(),
      outTradeNo: `${envelope.out_trade_no || ""}`.trim(),
      totalAmount: `${envelope.total_amount || envelope.total_fee || ""}`.trim(),
      buyerId: `${envelope.buyer_user_id || ""}`.trim(),
      sellerId: `${envelope.seller_id || ""}`.trim(),
      paidAt: `${envelope.send_pay_date || envelope.gmt_payment || ""}`.trim(),
      raw: envelope
    };
  }

  return {
    ok: false,
    code,
    subCode: `${envelope.sub_code || ""}`.trim(),
    message: `${envelope.sub_msg || envelope.msg || "Alipay query failed."}`.trim(),
    raw: envelope
  };
}

export function verifyNotifySignature(payload) {
  const config = getAlipayEnvConfig();
  const sign = `${payload?.sign || ""}`.trim();
  const signType = `${payload?.sign_type || OPEN_API_SIGN_TYPE}`.trim().toUpperCase() || OPEN_API_SIGN_TYPE;
  if (!sign) {
    throw new BillingRequestError(400, "notify_sign_missing", "Alipay notify sign is missing.");
  }

  const signedContents = [
    buildSignedContent(payload, { excludeSignType: false }),
    buildSignedContent(payload, { excludeSignType: true })
  ].filter(Boolean);

  const verified = signedContents.some((content) => verifySignature(content, sign, config.alipayPublicKey, signType));
  if (!verified) {
    throw new BillingRequestError(400, "notify_sign_invalid", "Alipay notify sign verification failed.");
  }

  return true;
}

export function assertNotifyMatchesConfig(payload) {
  const config = getAlipayEnvConfig();
  const appId = `${payload?.app_id || ""}`.trim();
  const sellerId = `${payload?.seller_id || ""}`.trim();
  if (!appId || appId !== config.appId) {
    throw new BillingRequestError(400, "notify_app_id_mismatch", "Alipay notify app_id does not match.");
  }
  if (!sellerId || sellerId !== config.sellerId) {
    throw new BillingRequestError(400, "notify_seller_id_mismatch", "Alipay notify seller_id does not match.");
  }
}

function buildCommonOpenApiParams({ appId, method, notifyUrl, returnUrl, bizContent }) {
  const params = {
    app_id: appId,
    method,
    format: OPEN_API_FORMAT,
    charset: OPEN_API_CHARSET,
    sign_type: OPEN_API_SIGN_TYPE,
    timestamp: formatOpenApiTimestamp(new Date()),
    version: OPEN_API_VERSION,
    biz_content: JSON.stringify(bizContent || {})
  };

  if (notifyUrl) params.notify_url = notifyUrl;
  if (returnUrl) params.return_url = returnUrl;

  return params;
}

function signParams(params, privateKey) {
  const content = buildSignedContent(params, { excludeSignType: false });
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(content, OPEN_API_CHARSET);
  signer.end();
  return signer.sign(privateKey, "base64");
}

function verifySignature(content, signature, publicKey, signType) {
  const algorithm = signType === "RSA" ? "RSA-SHA1" : "RSA-SHA256";
  const verifier = crypto.createVerify(algorithm);
  verifier.update(content, OPEN_API_CHARSET);
  verifier.end();
  return verifier.verify(publicKey, signature, "base64");
}

function buildSignedContent(params, { excludeSignType = false } = {}) {
  return Object.keys(params || {})
    .filter((key) => key && key !== "sign" && (!excludeSignType || key !== "sign_type"))
    .sort()
    .map((key) => [key, params[key]])
    .filter(([, value]) => value !== undefined && value !== null && `${value}` !== "")
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

function formatOpenApiTimestamp(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  const seconds = `${date.getSeconds()}`.padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}
