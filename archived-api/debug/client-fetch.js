export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-request-id");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") {
    return res.status(405).json({
      ok: false,
      error: "method_not_allowed",
      request_id: resolveRequestId(req)
    });
  }

  const requestId = resolveRequestId(req);
  const userAgent = `${req.headers?.["user-agent"] || req.headers?.["User-Agent"] || ""}`.trim();

  return res.status(200).json({
    ok: true,
    route: "client-fetch",
    request_id: requestId,
    timestamp: new Date().toISOString(),
    user_agent: userAgent
  });
}

function resolveRequestId(req) {
  const incoming = `${req.headers?.["x-request-id"] || ""}`.trim();
  if (incoming) return incoming;
  return `diag_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
