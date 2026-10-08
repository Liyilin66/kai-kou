export default function handler(req, res) {
  const body = req.method === "POST" ? req.body || {} : {};

  res.status(200).json({
    code: 0,
    data: {
      orderId: "mock-order-10001",
      amount: body.amount || 99,
      currency: "CNY",
      status: "created",
      payUrl: "https://example.com/mock-pay"
    }
  });
}
