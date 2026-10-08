import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  formatScopedLogMessage,
  inspectRequiredServerEnv,
  readServerEnv,
  SERVER_UNAVAILABLE_MESSAGE,
  shouldExposeServerErrorDetail
} from "./server-env.js";

const REGISTER_CODE_TTL_MINUTES = getPositiveInt(process.env.REGISTER_CODE_TTL_MINUTES, 10);
const REGISTER_CODE_RESEND_SECONDS = getPositiveInt(process.env.REGISTER_CODE_RESEND_SECONDS, 60);
const REGISTER_CODE_LENGTH = 6;

logRegisterAuthStartupValidation();

export async function handleSendRegisterCode(req, res) {
  applyJsonHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "method_not_allowed",
      message: "请求方式不支持"
    });
  }

  try {
    const { email } = readBody(req);
    const normalizedEmail = normalizeEmail(email);

    if (!isEmailAddress(normalizedEmail)) {
      throw new KnownRequestError(400, "invalid_email", "请输入正确的邮箱地址");
    }

    const supabase = createServiceSupabaseClient();
    const existingUser = await authEmailExists(supabase, normalizedEmail);
    if (existingUser) {
      throw new KnownRequestError(409, "email_already_registered", "该账号已注册，请登录");
    }

    const now = new Date();
    const pendingCode = await getPendingCodeRecord(supabase, normalizedEmail);
    const retryAfterSeconds = getRetryAfterSeconds(pendingCode?.resend_available_at, now);

    if (retryAfterSeconds > 0) {
      throw new KnownRequestError(
        429,
        "register_code_cooldown",
        `验证码已发送，请 ${retryAfterSeconds} 秒后再试`,
        { retry_after_seconds: retryAfterSeconds }
      );
    }

    const code = generateRegisterCode();
    const expiresAt = new Date(now.getTime() + REGISTER_CODE_TTL_MINUTES * 60 * 1000);
    const resendAvailableAt = new Date(now.getTime() + REGISTER_CODE_RESEND_SECONDS * 1000);

    const upsertPayload = {
      email: normalizedEmail,
      code_hash: hashRegisterCode(code),
      expires_at: expiresAt.toISOString(),
      resend_available_at: resendAvailableAt.toISOString(),
      consumed_at: null,
      send_count: Number(pendingCode?.send_count || 0) + 1,
      last_sent_at: now.toISOString(),
      updated_at: now.toISOString()
    };

    const { error: saveError } = await supabase
      .from("register_email_codes")
      .upsert(upsertPayload, { onConflict: "email" });

    if (saveError) {
      throw coerceSupabaseSetupError(saveError, "保存注册验证码失败");
    }

    try {
      await sendRegisterCodeEmail({
        email: normalizedEmail,
        code,
        expiresInMinutes: REGISTER_CODE_TTL_MINUTES
      });
    } catch (emailError) {
      await invalidateCodeRecord(supabase, normalizedEmail);
      throw emailError;
    }

    return res.status(200).json({
      ok: true,
      message: "验证码已发送，请查收邮箱",
      resend_after_seconds: REGISTER_CODE_RESEND_SECONDS,
      expires_in_minutes: REGISTER_CODE_TTL_MINUTES
    });
  } catch (error) {
    return respondWithError(res, error, "发送注册验证码失败");
  }
}

export async function handleRegisterWithCode(req, res) {
  applyJsonHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "method_not_allowed",
      message: "请求方式不支持"
    });
  }

  try {
    const body = readBody(req);
    const username = normalizeUsername(body.username);
    const email = normalizeEmail(body.email);
    const verificationCode = normalizeVerificationCode(body.verificationCode);
    const password = `${body.password || ""}`;
    const confirmPassword = `${body.confirmPassword || ""}`;

    validateRegisterPayload({
      username,
      email,
      verificationCode,
      password,
      confirmPassword
    });

    const supabase = createServiceSupabaseClient();
    const existingUser = await authEmailExists(supabase, email);
    if (existingUser) {
      throw new KnownRequestError(409, "email_already_registered", "该账号已注册，请登录");
    }

    const now = new Date();
    const codeHash = hashRegisterCode(verificationCode);
    const { data: consumedRows, error: consumeError } = await supabase
      .from("register_email_codes")
      .update({
        consumed_at: now.toISOString(),
        updated_at: now.toISOString()
      })
      .eq("email", email)
      .eq("code_hash", codeHash)
      .is("consumed_at", null)
      .gt("expires_at", now.toISOString())
      .select("email");

    if (consumeError) {
      throw coerceSupabaseSetupError(consumeError, "校验注册验证码失败");
    }

    if (!Array.isArray(consumedRows) || consumedRows.length === 0) {
      throw await resolveCodeValidationError(supabase, email, now);
    }

    const { data: createData, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        username
      }
    });

    if (createError) {
      if (isDuplicateUserError(createError)) {
        throw new KnownRequestError(409, "email_already_registered", "该账号已注册，请登录");
      }
      throw new KnownRequestError(500, "register_create_user_failed", "注册失败，请稍后重试");
    }

    const user = createData?.user || null;
    if (!user?.id) {
      throw new KnownRequestError(500, "register_user_missing", "注册失败，请稍后重试");
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .upsert(
        {
          id: user.id,
          email
        },
        { onConflict: "id" }
      );

    if (profileError) {
      throw new KnownRequestError(500, "profile_sync_failed", "注册成功，但用户资料初始化失败，请联系管理员");
    }

    return res.status(200).json({
      ok: true,
      message: "注册成功",
      data: {
        email
      }
    });
  } catch (error) {
    return respondWithError(res, error, "注册失败");
  }
}

function readBody(req) {
  return req?.body && typeof req.body === "object" ? req.body : {};
}

function applyJsonHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
}

function createServiceSupabaseClient() {
  const envCheck = inspectRequiredServerEnv(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
  const supabaseUrl = envCheck.values.SUPABASE_URL;
  const serviceRoleKey = envCheck.values.SUPABASE_SERVICE_ROLE_KEY;

  if (!envCheck.ok) {
    throw createSupabaseConfigError(envCheck.missing);
  }

  const serviceRoleKeyIssue = getServiceRoleKeyValidationIssue(serviceRoleKey);
  if (serviceRoleKeyIssue) {
    throw createServerConfigError("service_role_invalid", "服务端 Supabase service role 配置错误", {
      scope: "auth/register",
      logMessage: serviceRoleKeyIssue
    });
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

async function authEmailExists(supabase, email) {
  const { data, error } = await supabase.rpc("auth_email_exists", {
    p_email: email
  });

  if (error) {
    throw coerceSupabaseSetupError(error, "检查邮箱注册状态失败");
  }

  return Boolean(data);
}

async function getPendingCodeRecord(supabase, email) {
  const { data, error } = await supabase
    .from("register_email_codes")
    .select("email, resend_available_at, send_count")
    .eq("email", email)
    .maybeSingle();

  if (error) {
    throw coerceSupabaseSetupError(error, "读取注册验证码状态失败");
  }

  return data || null;
}

async function invalidateCodeRecord(supabase, email) {
  const now = new Date().toISOString();

  await supabase
    .from("register_email_codes")
    .update({
      consumed_at: now,
      expires_at: now,
      resend_available_at: now,
      updated_at: now
    })
    .eq("email", email);
}

async function resolveCodeValidationError(supabase, email, now) {
  const { data, error } = await supabase
    .from("register_email_codes")
    .select("expires_at, consumed_at")
    .eq("email", email)
    .maybeSingle();

  if (error) {
    throw coerceSupabaseSetupError(error, "读取验证码状态失败");
  }

  if (!data) {
    return new KnownRequestError(400, "register_code_invalid", "验证码错误，请重新输入");
  }

  if (data.consumed_at) {
    return new KnownRequestError(400, "register_code_used", "验证码已失效，请重新获取");
  }

  if (data.expires_at && new Date(data.expires_at).getTime() <= now.getTime()) {
    return new KnownRequestError(400, "register_code_expired", "验证码已过期，请重新获取");
  }

  return new KnownRequestError(400, "register_code_invalid", "验证码错误，请重新输入");
}

async function sendRegisterCodeEmail({ email, code, expiresInMinutes }) {
  const envCheck = inspectRegisterEmailEnv();
  const brevoApiKey = envCheck.values.BREVO_API_KEY;
  const fromEmail = envCheck.values.REGISTER_OTP_FROM_EMAIL;
  const fromName = `${readServerEnv("REGISTER_OTP_FROM_NAME") || "开口"}`.trim();

  if (!envCheck.ok) {
    throw createRegisterEmailConfigError(envCheck.missing);
  }

  const html = buildRegisterCodeEmailHtml({ code, expiresInMinutes });
  const textContent = buildRegisterCodeEmailText({ code, expiresInMinutes });

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": brevoApiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      sender: {
        name: fromName,
        email: fromEmail
      },
      to: [{ email }],
      subject: "【开口】邮箱验证码，请完成注册",
      htmlContent: html,
      textContent
    })
  });

  if (!response.ok) {
    let detail = "";
    try {
      const payload = await response.json();
      detail = payload?.message || payload?.code || payload?.error || "";
    } catch {
      detail = "";
    }

    throw new KnownRequestError(
      502,
      "register_email_send_failed",
      detail ? `验证码邮件发送失败：${detail}` : "验证码邮件发送失败，请稍后重试",
      {
        publicMessage: SERVER_UNAVAILABLE_MESSAGE,
        shouldLog: true,
        logMessage: formatScopedLogMessage(
          "auth/send-register-code",
          detail ? `Brevo email request failed: ${detail}` : "Brevo email request failed"
        )
      }
    );
  }
}

function buildRegisterCodeEmailHtml({ code, expiresInMinutes }) {
  const safeCode = escapeHtml(code);
  const safeMinutes = escapeHtml(String(expiresInMinutes));

  return [
    '<!DOCTYPE html>',
    '<html lang="zh-CN">',
    '<head>',
    '  <meta charset="UTF-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    '  <title>开口注册验证码</title>',
    '</head>',
    '<body style="margin:0;padding:0;background-color:#eef2f7;">',
    '  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;margin:0;padding:24px 0;background-color:#eef2f7;">',
    '    <tr>',
    '      <td align="center" style="padding:0 16px;">',
    '        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:640px;width:100%;">',
    '          <tr>',
    '            <td align="center" style="padding:0 0 20px 0;font-family:Arial,\'PingFang SC\',\'Microsoft YaHei\',sans-serif;">',
    '              <div style="display:inline-block;padding:8px 18px;border-radius:999px;background-color:#dbeafe;color:#1d4ed8;font-size:13px;font-weight:700;letter-spacing:0.08em;">开口</div>',
    '            </td>',
    '          </tr>',
    '          <tr>',
    '            <td style="background-color:#ffffff;border-radius:24px;padding:40px 36px;box-shadow:0 16px 40px rgba(15,23,42,0.08);font-family:Arial,\'PingFang SC\',\'Microsoft YaHei\',sans-serif;color:#0f172a;">',
    '              <p style="margin:0 0 14px 0;font-size:14px;line-height:22px;color:#1d4ed8;font-weight:700;letter-spacing:0.08em;">KAI KOU</p>',
    '              <h1 style="margin:0 0 14px 0;font-size:28px;line-height:36px;color:#0f172a;">完成注册，输入验证码</h1>',
    '              <p style="margin:0 0 24px 0;font-size:15px;line-height:26px;color:#475569;">欢迎使用开口。我们收到了你的注册请求，请在页面中输入下面的 6 位邮箱验证码，以继续完成注册。</p>',
    '              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px 0;">',
    '                <tr>',
    '                  <td align="center" style="padding:0;">',
    '                    <div style="display:inline-block;min-width:240px;padding:18px 28px;border-radius:18px;background-color:#eff6ff;border:1px solid #bfdbfe;color:#1e3a8a;font-size:36px;line-height:44px;font-weight:700;letter-spacing:0.32em;text-indent:0.32em;">' + safeCode + '</div>',
    '                  </td>',
    '                </tr>',
    '              </table>',
    '              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px 0;background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;">',
    '                <tr>',
    '                  <td style="padding:18px 20px;">',
    '                    <p style="margin:0 0 8px 0;font-size:14px;line-height:22px;color:#0f172a;font-weight:700;">有效期提醒</p>',
    '                    <p style="margin:0;font-size:14px;line-height:24px;color:#475569;">验证码将在 ' + safeMinutes + ' 分钟后失效。为了保障账号安全，请不要将验证码转发或透露给任何人。</p>',
    '                  </td>',
    '                </tr>',
    '              </table>',
    '              <p style="margin:0 0 14px 0;font-size:14px;line-height:24px;color:#475569;">如果这不是你本人发起的操作，请直接忽略这封邮件。未完成验证前，你的账号不会被创建成功。</p>',
    '              <p style="margin:0;font-size:12px;line-height:22px;color:#94a3b8;">这是一封系统邮件，请勿直接回复。如需帮助，请通过开口产品内渠道联系我们。</p>',
    '            </td>',
    '          </tr>',
    '        </table>',
    '      </td>',
    '    </tr>',
    '  </table>',
    '</body>',
    '</html>'
  ].join("");
}

function buildRegisterCodeEmailText({ code, expiresInMinutes }) {
  return [
    "开口",
    "",
    "欢迎使用开口。我们收到了你的注册请求。",
    `你的 6 位邮箱验证码是：${code}`,
    `验证码将在 ${expiresInMinutes} 分钟后失效。`,
    "如果不是你本人操作，请忽略这封邮件。"
  ].join("\n");
}

function escapeHtml(value) {
  return `${value || ""}`
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function validateRegisterPayload({ username, email, verificationCode, password, confirmPassword }) {
  if (!username) {
    throw new KnownRequestError(400, "username_required", "请输入用户名");
  }

  if (!isEmailAddress(email)) {
    throw new KnownRequestError(400, "invalid_email", "请输入正确的邮箱地址");
  }

  if (!/^\d{6}$/.test(verificationCode)) {
    throw new KnownRequestError(400, "invalid_verification_code", "请输入 6 位邮箱验证码");
  }

  if (!password) {
    throw new KnownRequestError(400, "password_required", "请输入密码");
  }

  if (password.length < 6) {
    throw new KnownRequestError(400, "password_too_short", "密码至少需要 6 位");
  }

  if (!confirmPassword) {
    throw new KnownRequestError(400, "confirm_password_required", "请再次输入密码");
  }

  if (password !== confirmPassword) {
    throw new KnownRequestError(400, "password_mismatch", "两次输入的密码不一致");
  }
}

function normalizeUsername(value) {
  return `${value || ""}`.trim();
}

function normalizeEmail(value) {
  return `${value || ""}`.trim().toLowerCase();
}

function normalizeVerificationCode(value) {
  return `${value || ""}`.replace(/\D+/g, "").slice(0, REGISTER_CODE_LENGTH);
}

function isEmailAddress(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(`${value || ""}`);
}

function generateRegisterCode() {
  return `${crypto.randomInt(0, 10 ** REGISTER_CODE_LENGTH)}`.padStart(REGISTER_CODE_LENGTH, "0");
}

function hashRegisterCode(code) {
  return crypto.createHash("sha256").update(`${code}`).digest("hex");
}

function formatFromAddress(name, email) {
  if (!name) return email;
  return `${name} <${email}>`;
}

function getRetryAfterSeconds(isoText, now) {
  if (!isoText) return 0;
  const nextAt = new Date(isoText).getTime();
  if (!Number.isFinite(nextAt)) return 0;
  const diff = nextAt - now.getTime();
  if (diff <= 0) return 0;
  return Math.ceil(diff / 1000);
}

function getPositiveInt(rawValue, fallbackValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value) || value <= 0) return fallbackValue;
  return Math.floor(value);
}

function isDuplicateUserError(error) {
  const message = `${error?.message || ""}`.toLowerCase();
  return message.includes("already been registered") || message.includes("already registered");
}

function coerceSupabaseSetupError(error, fallbackMessage) {
  const message = `${error?.message || fallbackMessage || ""}`;
  if (message.includes("Could not find the function")) {
    return createServerConfigError("register_setup_missing_function", "缺少 auth_email_exists 函数，请先执行注册验证码 SQL", {
      scope: "auth/register",
      logMessage: `Supabase setup is incomplete: ${message}`
    });
  }
  if (message.includes("relation") && message.includes("register_email_codes")) {
    return createServerConfigError("register_setup_missing_table", "缺少 register_email_codes 表，请先执行注册验证码 SQL", {
      scope: "auth/register",
      logMessage: `Supabase setup is incomplete: ${message}`
    });
  }
  return createServerConfigError("register_setup_failed", fallbackMessage || "注册服务配置不完整", {
    scope: "auth/register",
    logMessage: `Supabase request failed: ${message}`
  });
}

function respondWithError(res, error, fallbackMessage) {
  if (error instanceof KnownRequestError) {
    if (error.shouldLog) {
      console.error(error.logMessage || error.message);
    }

    const payload = {
      error: error.code,
      message: shouldExposeServerErrorDetail() ? error.message : error.publicMessage
    };

    if (error.meta && typeof error.meta === "object") {
      Object.assign(payload, error.meta);
    }

    return res.status(error.status).json(payload);
  }

  console.error(fallbackMessage || "register auth error:", error);
  return res.status(500).json({
    error: "internal_error",
    message: fallbackMessage || "操作失败，请稍后重试"
  });
}

class KnownRequestError extends Error {
  constructor(status, code, message, options = {}) {
    super(message);
    const normalizedOptions = isKnownRequestErrorOptions(options) ? options : { meta: options };
    this.name = "KnownRequestError";
    this.status = status;
    this.code = code;
    this.meta = normalizedOptions.meta || null;
    this.publicMessage = normalizedOptions.publicMessage || message;
    this.logMessage = normalizedOptions.logMessage || "";
    this.shouldLog = Boolean(normalizedOptions.shouldLog);
  }
}

function createSupabaseConfigError(missingEnv) {
  if (missingEnv.length === 1 && missingEnv[0] === "SUPABASE_URL") {
    return createServerConfigError("supabase_url_missing", "服务端缺少 Supabase 地址配置", {
      scope: "auth/register",
      missingEnv
    });
  }

  if (missingEnv.length === 1 && missingEnv[0] === "SUPABASE_SERVICE_ROLE_KEY") {
    return createServerConfigError("service_role_missing", "服务端缺少 Supabase service role 配置", {
      scope: "auth/register",
      missingEnv
    });
  }

  return createServerConfigError(
    "supabase_server_env_missing",
    `服务端缺少 Supabase 服务配置：${missingEnv.join(", ")}`,
    {
      scope: "auth/register",
      missingEnv
    }
  );
}

function createRegisterEmailConfigError(missingEnv) {
  if (missingEnv.length === 1 && missingEnv[0] === "BREVO_API_KEY") {
    return createServerConfigError("brevo_api_key_missing", "服务端缺少 Brevo 邮件发送配置", {
      scope: "auth/send-register-code",
      missingEnv
    });
  }

  if (missingEnv.length === 1 && missingEnv[0] === "REGISTER_OTP_FROM_EMAIL") {
    return createServerConfigError("register_otp_from_email_missing", "服务端缺少验证码发件邮箱配置", {
      scope: "auth/send-register-code",
      missingEnv
    });
  }

  return createServerConfigError(
    "register_email_env_missing",
    `服务端缺少验证码邮件配置：${missingEnv.join(", ")}`,
    {
      scope: "auth/send-register-code",
      missingEnv
    }
  );
}

function createServerConfigError(code, message, options = {}) {
  return new KnownRequestError(500, code, message, {
    publicMessage: options.publicMessage || SERVER_UNAVAILABLE_MESSAGE,
    meta: options.meta || null,
    shouldLog: true,
    logMessage: formatScopedLogMessage(
      options.scope || "auth/register",
      options.logMessage || message,
      options.missingEnv || []
    )
  });
}

function logRegisterAuthStartupValidation() {
  const supabaseEnv = inspectRequiredServerEnv(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
  if (!supabaseEnv.ok) {
    console.error(
      formatScopedLogMessage(
        "auth/register",
        "Startup env validation failed for register auth.",
        supabaseEnv.missing
      )
    );
  }

  const registerEmailEnv = inspectRegisterEmailEnv();
  if (!registerEmailEnv.ok) {
    console.error(
      formatScopedLogMessage(
        "auth/send-register-code",
        "Startup env validation failed for Brevo register email delivery.",
        registerEmailEnv.missing
      )
    );
  }
}

function getServiceRoleKeyValidationIssue(keyValue) {
  const token = `${keyValue || ""}`.trim();
  if (!token) return "SUPABASE_SERVICE_ROLE_KEY is empty.";

  if (token.startsWith("sb_publishable_")) {
    return "SUPABASE_SERVICE_ROLE_KEY looks like a publishable/anon key (sb_publishable_*).";
  }

  const payload = tryParseJwtPayload(token);
  const role = `${payload?.role || payload?.user_role || ""}`.trim();
  if (role && role !== "service_role" && role !== "supabase_admin") {
    return `SUPABASE_SERVICE_ROLE_KEY JWT role is \"${role}\", not \"service_role\".`;
  }

  return "";
}

function tryParseJwtPayload(token) {
  const parts = `${token || ""}`.split(".");
  if (parts.length !== 3) return null;

  try {
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const paddingLength = (4 - (payload.length % 4)) % 4;
    const padded = payload.padEnd(payload.length + paddingLength, "=");
    const decoded = Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function isKnownRequestErrorOptions(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return (
    Object.prototype.hasOwnProperty.call(value, "meta")
    || Object.prototype.hasOwnProperty.call(value, "publicMessage")
    || Object.prototype.hasOwnProperty.call(value, "logMessage")
    || Object.prototype.hasOwnProperty.call(value, "shouldLog")
  );
}

function inspectRegisterEmailEnv() {
  const brevoApiKey = readServerEnv("BREVO_API_KEY");
  const fromEmail = readServerEnv("REGISTER_OTP_FROM_EMAIL");
  const missing = [];

  if (!brevoApiKey) {
    missing.push("BREVO_API_KEY");
  }

  if (!fromEmail) {
    missing.push("REGISTER_OTP_FROM_EMAIL");
  }

  return {
    ok: missing.length === 0,
    values: {
      BREVO_API_KEY: brevoApiKey,
      REGISTER_OTP_FROM_EMAIL: fromEmail
    },
    missing
  };
}
