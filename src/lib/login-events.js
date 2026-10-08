import { supabase } from "@/lib/supabase";

export const LOGIN_EVENT_LIMIT = 5;

const MISSING_LOGIN_EVENTS_TABLE_CODES = new Set(["42P01", "PGRST205"]);

export function createEmptyLoginEventsSnapshot() {
  return {
    loading: true,
    events: [],
    rows: [],
    source: "loading",
    error: null
  };
}

export async function recordLoginEventForUser(userId) {
  const normalizedUserId = normalizeText(userId);
  if (!normalizedUserId) return null;

  const device = parseCurrentDevice();
  const payload = {
    user_id: normalizedUserId,
    device_label: device.device_label,
    browser: device.browser,
    os: device.os
  };

  const { data, error } = await supabase
    .from("user_login_events")
    .insert(payload)
    .select("id, user_id, logged_in_at, device_label, browser, os, created_at")
    .maybeSingle();

  if (error) {
    if (isMissingLoginEventsTableError(error)) return null;
    throw error;
  }
  return normalizeLoginEventRow(data);
}

export async function loadLoginEventsForAuth(authStore) {
  const userId = await resolveCurrentUserId(authStore);
  if (!userId) {
    return {
      ...createEmptyLoginEventsSnapshot(),
      loading: false,
      source: "auth_missing"
    };
  }

  try {
    const { data, error } = await supabase
      .from("user_login_events")
      .select("id, user_id, logged_in_at, device_label, browser, os, created_at")
      .eq("user_id", userId)
      .order("logged_in_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(LOGIN_EVENT_LIMIT);

    if (error) {
      if (isMissingLoginEventsTableError(error)) {
        return {
          ...createEmptyLoginEventsSnapshot(),
          loading: false,
          source: "missing_table"
        };
      }
      throw error;
    }

    const events = normalizeLoginEventRows(data);

    return {
      loading: false,
      events,
      rows: events,
      source: "remote",
      error: null
    };
  } catch (error) {
    console.warn("Login events load failed:", error);
    return {
      ...createEmptyLoginEventsSnapshot(),
      loading: false,
      source: "error",
      error
    };
  }
}

export function parseCurrentDevice(navigatorLike = getNavigatorLike()) {
  if (!navigatorLike) {
    return {
      device_label: "当前浏览器设备",
      browser: "浏览器",
      os: "未知系统"
    };
  }

  return parseUserAgent(navigatorLike.userAgent || "", navigatorLike);
}

export function parseUserAgent(userAgent, navigatorLike = {}) {
  const ua = normalizeText(userAgent);
  const os = detectOS(ua, navigatorLike);
  const browser = detectBrowser(ua);
  const device_label = detectDeviceLabel(ua, os, navigatorLike);

  return {
    device_label,
    browser,
    os
  };
}

export function formatLoginEventDevice(event) {
  const deviceLabel = normalizeText(event?.device_label);
  if (deviceLabel) return deviceLabel;

  const os = normalizeText(event?.os);
  if (os === "Windows") return "Windows PC";
  if (os === "macOS") return "Mac";
  if (os === "iOS") return "iPhone";
  if (os === "iPadOS") return "iPad";
  if (os === "Android") return "Android Device";
  return "当前浏览器设备";
}

export function formatLoginEventMeta(event) {
  const os = normalizeText(event?.os);
  const browser = normalizeText(event?.browser);
  return [os, browser].filter(Boolean).join(" · ") || "设备信息未记录";
}

function detectOS(ua, navigatorLike = {}) {
  if (!ua) return "Unknown OS";
  if (isIPadOSDevice(ua, navigatorLike)) return "iPadOS";
  if (/iphone|ipod/i.test(ua)) return "iOS";
  if (/android/i.test(ua)) return "Android";
  if (/windows nt/i.test(ua)) return "Windows";
  if (/mac os x|macintosh/i.test(ua)) return "macOS";
  return "Unknown OS";
}

function detectBrowser(ua) {
  if (!ua) return "Unknown Browser";
  if (/edg\/|edgios|edga/i.test(ua)) return "Edge";
  if (/chrome|crios/i.test(ua) && !/edg\/|edgios|edga/i.test(ua)) return "Chrome";
  if (/firefox|fxios/i.test(ua)) return "Firefox";
  if (/safari/i.test(ua) && !/chrome|crios|android|edgios|edga|fxios/i.test(ua)) return "Safari";
  return "Unknown Browser";
}

function detectDeviceLabel(ua, os, navigatorLike = {}) {
  if (isIPadOSDevice(ua, navigatorLike)) return "iPad";
  if (/iphone|ipod/i.test(ua)) return "iPhone";
  if (/android/i.test(ua)) return /mobile/i.test(ua) ? "Android Phone" : "Android Tablet";
  if (os === "Windows") return "Windows PC";
  if (os === "macOS") return "Mac";
  return "Unknown Device";
}

async function resolveCurrentUserId(authStore) {
  const authUserId = normalizeText(authStore?.user?.id);
  if (authUserId) return authUserId;
  const { data } = await supabase.auth.getSession();
  return normalizeText(data?.session?.user?.id);
}

function normalizeLoginEventRow(row) {
  if (!row || typeof row !== "object") return null;
  return {
    id: normalizeText(row.id),
    user_id: normalizeText(row.user_id),
    logged_in_at: normalizeText(row.logged_in_at),
    device_label: normalizePayloadText(row.device_label, "当前浏览器设备"),
    browser: normalizePayloadText(row.browser, "浏览器"),
    os: normalizePayloadText(row.os, "未知系统"),
    created_at: normalizeText(row.created_at)
  };
}

function normalizeLoginEventRows(rows) {
  return (Array.isArray(rows) ? rows : []).map(normalizeLoginEventRow).filter(Boolean);
}

function isMissingLoginEventsTableError(error) {
  const code = normalizeText(error?.code).toUpperCase();
  const message = normalizeText(error?.message);
  return MISSING_LOGIN_EVENTS_TABLE_CODES.has(code) || /user_login_events/i.test(message) && /schema cache|does not exist|not find/i.test(message);
}

function normalizeText(value) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return `${value}`.trim();
}

function normalizePayloadText(value, fallback) {
  return (normalizeText(value) || fallback).slice(0, 80);
}

function getNavigatorLike() {
  return typeof navigator === "undefined" ? null : navigator;
}

function isIPadOSDevice(ua, navigatorLike = {}) {
  if (/ipad/i.test(ua)) return true;
  const platform = normalizeText(navigatorLike?.platform);
  const maxTouchPoints = Number(navigatorLike?.maxTouchPoints || 0);
  return platform === "MacIntel" && maxTouchPoints > 1;
}
