export default function handler(req, res) {
  const payload = req.method === "POST" ? req.body || {} : {};

  res.status(200).json({
    code: 0,
    data: {
      received: true,
      event: payload.event || "payment.succeeded"
    }
  });
}
