import { handleSendRegisterCode } from "../../backend/auth/register-code-service.js";

export default async function handler(req, res) {
  return handleSendRegisterCode(req, res);
}
