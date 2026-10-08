import { questions } from "../src/data/questions.js";

export default function handler(req, res) {
  const type = (req.params?.type || req.query?.type || "RA").toUpperCase();
  const list = questions[type] || [];

  if (!list.length) {
    return res.status(404).json({
      code: 1,
      error: "unsupported_task_type",
      message: `Unsupported task type: ${type}`
    });
  }

  const random = list[Math.floor(Math.random() * list.length)];

  return res.status(200).json({
    code: 0,
    data: {
      type,
      total: list.length,
      question: random,
      questions: list
    }
  });
}
