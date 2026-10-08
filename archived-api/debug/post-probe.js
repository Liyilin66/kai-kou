export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-request-id");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") return res.status(200).end();

  const requestId = resolveRequestId(req);
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "method_not_allowed",
      request_id: requestId
    });
  }

  const contentType = `${req.headers?.["content-type"] || req.headers?.["Content-Type"] || ""}`.trim().toLowerCase();
  const authorizationHeader = `${req.headers?.authorization || req.headers?.Authorization || ""}`.trim();
  const hasAuthorization = Boolean(authorizationHeader);
  const parsedBody = normalizeBody(req.body);
  if (!parsedBody.ok) {
    return res.status(400).json({
      ok: false,
      error: "invalid_json_body",
      request_id: requestId
    });
  }

  const normalizedBody = parsedBody.value;
  const bodyKeys = isPlainObject(normalizedBody) ? Object.keys(normalizedBody) : [];
  const bodySize = resolveBodySize(req.body, normalizedBody);

  return res.status(200).json({
    ok: true,
    route: "post-probe",
    method: "POST",
    request_id: requestId,
    content_type: contentType,
    has_authorization: hasAuthorization,
    body_keys: bodyKeys,
    body_size: bodySize,
    timestamp: new Date().toISOString()
  });
}

function resolveRequestId(req) {
  const incoming = `${req.headers?.["x-request-id"] || ""}`.trim();
  if (incoming) return incoming;
  return `post_probe_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeBody(rawBody) {
  if (rawBody === null || rawBody === undefined) {
    return { ok: true, value: {} };
  }
  if (typeof rawBody === "string") {
    const text = rawBody.trim();
    if (!text) return { ok: true, value: {} };
    try {
      return { ok: true, value: JSON.parse(text) };
    } catch {
      return { ok: false, value: {} };
    }
  }
  if (Buffer.isBuffer(rawBody)) {
    const text = rawBody.toString("utf8").trim();
    if (!text) return { ok: true, value: {} };
    try {
      return { ok: true, value: JSON.parse(text) };
    } catch {
      return { ok: false, value: {} };
    }
  }
  if (typeof rawBody === "object") {
    return { ok: true, value: rawBody };
  }
  return { ok: true, value: {} };
}

function resolveBodySize(rawBody, normalizedBody) {
  if (typeof rawBody === "string") return Buffer.byteLength(rawBody, "utf8");
  if (Buffer.isBuffer(rawBody)) return rawBody.length;
  try {
    return Buffer.byteLength(JSON.stringify(normalizedBody ?? {}), "utf8");
  } catch {
    return 0;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
