import { defineStore } from "pinia";
import { getApiUrl } from "@/lib/api-url";
import { ACCESS_STATUS, getAccessStatus } from "@/lib/access-status";
import { recordLoginEventForUser } from "@/lib/login-events";
import { supabase } from "@/lib/supabase";

let initPromise = null;
let authSubscription = null;
const RESET_PASSWORD_PATH = "/reset-password";
const AGENT_WORKSPACE_SESSION_PREFIXES = [
  "agent-workspace-booted:",
  "agent-workspace-snapshot-v1:"
];

export const useAuthStore = defineStore("auth", {
  state: () => ({
    user: null,
    session: null,
    profile: null,
    isPremium: false,
    isInTrial: false,
    trialDaysLeft: 0,
    accessStatus: ACCESS_STATUS.NOT_OPENED,
    canPractice: false,
    canUseAiScoring: false,
    loaded: false,
    initialized: false
  }),

  getters: {
    isLoggedIn: (state) => Boolean(state.session && state.user),
    displayName(state) {
      return resolveUserDisplayName(state.user, state.profile);
    },
    avatarUrl(state) {
      return resolveAvatarUrl(state.user, state.profile);
    },
    statusText(state) {
      if (state.accessStatus === ACCESS_STATUS.VIP) return "✅ VIP · 无限练习";
      if (state.accessStatus === ACCESS_STATUS.TRIAL) return `试用中 · 剩余 ${state.trialDaysLeft} 天`;
      if (state.accessStatus === ACCESS_STATUS.TRIAL_EXPIRED) return "试用已结束";
      return "未开通";
    },
    isLimited(state) {
      return !state.canUseAiScoring;
    }
  },

  actions: {
    async init() {
      if (this.initialized) return;
      if (initPromise) {
        await initPromise;
        return;
      }

      initPromise = (async () => {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.error("getSession error:", error);
        }

        this.session = data?.session || null;
        this.user = data?.session?.user || null;

        if (this.user) {
          await this.loadStatus();
        } else {
          this.resetUsageState();
          this.loaded = true;
        }

        if (!authSubscription) {
          const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
            this.session = session || null;
            this.user = session?.user || null;

            if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
              setTimeout(() => {
                this.loadStatus();
              }, 0);
            }

            if (event === "SIGNED_OUT") {
              clearAgentWorkspaceSessionArtifacts();
              this.resetUsageState();
              this.loaded = false;
            }

            if (event === "PASSWORD_RECOVERY") {
              redirectToResetPassword();
            }
          });

          authSubscription = authListener?.subscription || null;
        }

        this.initialized = true;
      })();

      try {
        await initPromise;
      } finally {
        initPromise = null;
      }
    },

    resetUsageState() {
      this.profile = null;
      this.isPremium = false;
      this.isInTrial = false;
      this.trialDaysLeft = 0;
      this.accessStatus = ACCESS_STATUS.NOT_OPENED;
      this.canUseAiScoring = false;
      this.canPractice = false;
    },

    async sendRegisterCode(email) {
      const response = await fetch(getApiUrl("/api/auth/send-register-code"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email
        })
      });

      const payload = await readJsonPayload(response);
      if (!response.ok) {
        throw createApiError(payload, "发送验证码失败，请稍后重试");
      }

      return payload;
    },

    async registerWithCode({ username, email, verificationCode, password, confirmPassword }) {
      const response = await fetch(getApiUrl("/api/auth/register-with-code"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          username,
          email,
          verificationCode,
          password,
          confirmPassword
        })
      });

      const payload = await readJsonPayload(response);
      if (!response.ok) {
        throw createApiError(payload, "注册失败，请稍后重试");
      }

      try {
        await this.login(email, password);
        return {
          ...payload,
          autoLoggedIn: true
        };
      } catch (loginError) {
        return {
          ...payload,
          autoLoggedIn: false,
          loginError
        };
      }
    },

    async login(email, password) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      this.session = data?.session || null;
      this.user = data?.user || null;

      if (this.user) {
        await this.loadStatus();
        await this.recordLoginEvent();
      }

      return data;
    },

    async recordLoginEvent() {
      const userId = normalizeDisplayValue(this.user?.id);
      if (!userId) return null;

      try {
        return await recordLoginEventForUser(userId);
      } catch (error) {
        console.warn("recordLoginEvent error:", error);
        return null;
      }
    },

    async logout() {
      await supabase.auth.signOut();
      clearAgentWorkspaceSessionArtifacts();
      this.session = null;
      this.user = null;
      this.resetUsageState();
      this.loaded = true;
    },

    async forgotPassword(email) {
      const redirectBase = getAuthRedirectBase();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${redirectBase}${RESET_PASSWORD_PATH}`
      });

      if (error) throw error;
    },

    async resetPassword(newPassword) {
      const update = async () => {
        const { error } = await supabase.auth.updateUser({
          password: newPassword
        });
        if (error) throw error;
      };

      try {
        await update();
      } catch (error) {
        if (isAuthLockRaceError(error)) {
          await new Promise((resolve) => setTimeout(resolve, 120));
          await update();
          return;
        }
        throw error;
      }
    },

    async updateAvatarDataUrl(dataUrl) {
      const normalizedAvatar = normalizeAvatarUrl(dataUrl);
      if (!normalizedAvatar) {
        throw new Error("头像数据无效，请重新选择图片");
      }

      const currentMeta =
        this.user?.user_metadata && typeof this.user.user_metadata === "object"
          ? this.user.user_metadata
          : {};

      const { data, error } = await supabase.auth.updateUser({
        data: {
          ...currentMeta,
          avatar_url: normalizedAvatar,
          avatar_updated_at: new Date().toISOString()
        }
      });

      if (error) throw error;

      if (data?.user) {
        this.user = data.user;
        if (this.session) {
          this.session = {
            ...this.session,
            user: data.user
          };
        }
      }

      return normalizedAvatar;
    },

    async updateProfileDetails({ displayName, targetScore, examDate, currentStage, avatarDataUrl } = {}) {
      const userId = normalizeDisplayValue(this.user?.id);
      if (!userId) {
        throw new Error("请先登录后再编辑个人资料");
      }

      const normalizedDisplayName = normalizeProfileText(displayName, 32);
      if (!normalizedDisplayName) {
        throw new Error("请输入昵称/用户名");
      }

      const profilePatch = {
        display_name: normalizedDisplayName,
        username: normalizedDisplayName
      };

      if (targetScore !== undefined) {
        profilePatch.target_score = normalizeTargetScoreValue(targetScore);
      }
      if (examDate !== undefined) {
        const normalizedExamDate = normalizeDateFieldValue(examDate);
        profilePatch.exam_date = normalizedExamDate || null;
      }
      if (currentStage !== undefined) {
        profilePatch.current_stage = normalizeProfileText(currentStage, 20) || null;
      }

      const { updatedProfile, skippedColumns } = await updateOwnProfileWithKnownColumns(userId, profilePatch);

      if (!updatedProfile) {
        throw new Error("没有找到当前用户资料，请重新登录后再试");
      }

      this.profile = {
        ...(this.profile || {}),
        ...updatedProfile,
        ...pickSkippedProfileValues(profilePatch, skippedColumns)
      };

      const metadataPatch = {
        display_name: normalizedDisplayName,
        username: normalizedDisplayName,
        ...pickSkippedProfileValues(profilePatch, skippedColumns)
      };
      if (avatarDataUrl || Object.keys(metadataPatch).length > 0) {
        await this.updateUserMetadata({
          ...metadataPatch,
          ...(avatarDataUrl ? { avatar_url: avatarDataUrl } : {})
        });
      }

      const access = getAccessStatus(this.user, this.profile);
      applyAccessState(this, access);
      this.loaded = true;

      return {
        profile: this.profile,
        skippedColumns
      };
    },

    async loadStatus() {
      if (!this.user) {
        this.resetUsageState();
        this.loaded = true;
        return;
      }

      try {
        let { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", this.user.id)
          .single();

        if (profileError || !profile) {
          console.warn("Profile not found, retrying in 1s...");
          await new Promise((resolve) => setTimeout(resolve, 1000));
          const retry = await supabase
            .from("profiles")
            .select("*")
            .eq("id", this.user.id)
            .single();
          profile = retry.data;
          profileError = retry.error;
        }

        if (profileError && profileError.code !== "PGRST116") throw profileError;

        this.profile = profile || null;
        const access = getAccessStatus(this.user, profile);
        applyAccessState(this, access);
        this.loaded = true;
      } catch (error) {
        console.error("loadStatus error:", error);
        this.resetUsageState();
        this.loaded = true;
      }
    },

    decrementRemaining() {
      // Compatibility no-op: permission is no longer based on daily counters.
      this.canPractice = this.canUseAiScoring;
    },

    async updateUserMetadata(metadataPatch = {}) {
      const sanitizedPatch = normalizeMetadataPatch(metadataPatch);
      if (Object.keys(sanitizedPatch).length === 0) return this.user;

      const currentMeta =
        this.user?.user_metadata && typeof this.user.user_metadata === "object"
          ? this.user.user_metadata
          : {};

      const { data, error } = await supabase.auth.updateUser({
        data: {
          ...currentMeta,
          ...sanitizedPatch,
          profile_updated_at: new Date().toISOString()
        }
      });

      if (error) throw toChineseProfileError(error);

      if (data?.user) {
        this.user = data.user;
        if (this.session) {
          this.session = {
            ...this.session,
            user: data.user
          };
        }
      }

      return this.user;
    }
  }
});

function applyAccessState(store, access) {
  store.isPremium = access.isPremium;
  store.isInTrial = access.isInTrial;
  store.trialDaysLeft = access.trialDaysLeft;
  store.accessStatus = access.accessStatus;
  store.canUseAiScoring = access.canUseAiScoring;
  store.canPractice = access.canUseAiScoring;
}

function clearAgentWorkspaceSessionArtifacts() {
  if (typeof window === "undefined") return;
  try {
    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = window.sessionStorage.key(index);
      if (key && AGENT_WORKSPACE_SESSION_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        window.sessionStorage.removeItem(key);
      }
    }
  } catch {
    // Best-effort AI Tutor boot-cache cleanup.
  }
}

function isAuthLockRaceError(error) {
  const message = String(error?.message || "");
  return message.includes("was released because another request stole it");
}

function getAuthRedirectBase() {
  const envUrl = normalizeAbsoluteUrl(import.meta.env.VITE_APP_URL);

  if (typeof window === "undefined") {
    return envUrl || "";
  }

  const currentOrigin = normalizeAbsoluteUrl(window.location.origin);
  if (!envUrl) return currentOrigin;

  const envHost = getHostname(envUrl);
  const currentHost = getHostname(currentOrigin);

  if (isLocalHostname(envHost) && currentHost && !isLocalHostname(currentHost)) {
    return currentOrigin;
  }

  return envUrl;
}

function redirectToResetPassword() {
  if (typeof window === "undefined" || !window.__vue_router__) return;
  if (window.__vue_router__.currentRoute?.value?.path === RESET_PASSWORD_PATH) return;
  window.__vue_router__.replace(RESET_PASSWORD_PATH).catch(() => {});
}

function normalizeAbsoluteUrl(value) {
  const normalized = `${value || ""}`.trim().replace(/\/+$/, "");
  if (!normalized) return "";

  try {
    return new URL(normalized).toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function getHostname(value) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isLocalHostname(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0";
}

function resolveUserDisplayName(user, profile) {
  const candidates = [
    profile?.display_name,
    profile?.username,
    profile?.name,
    profile?.full_name,
    user?.user_metadata?.display_name,
    user?.user_metadata?.username,
    user?.user_metadata?.name,
    getEmailLocalPart(user?.email)
  ];

  for (const candidate of candidates) {
    const normalized = normalizeDisplayValue(candidate);
    if (normalized) return normalized;
  }

  return "同学";
}

function getEmailLocalPart(email) {
  const normalizedEmail = normalizeDisplayValue(email);
  if (!normalizedEmail) return "";

  const atIndex = normalizedEmail.indexOf("@");
  if (atIndex <= 0) return normalizedEmail;
  return normalizedEmail.slice(0, atIndex).trim();
}

function normalizeDisplayValue(value) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return `${value}`.trim();
}

function resolveAvatarUrl(user, profile) {
  const candidates = [
    user?.user_metadata?.avatar_url,
    user?.user_metadata?.avatarUrl,
    user?.user_metadata?.photo_url,
    user?.user_metadata?.photoUrl,
    user?.user_metadata?.picture,
    profile?.avatar_url,
    profile?.avatarUrl,
    profile?.photo_url,
    profile?.photoUrl
  ];

  for (const candidate of candidates) {
    const normalized = normalizeAvatarUrl(candidate);
    if (normalized) return normalized;
  }

  return "";
}

function normalizeAvatarUrl(value) {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  if (!normalized) return "";
  if (normalized.startsWith("data:image/")) return normalized;
  if (/^https?:\/\//i.test(normalized)) return normalized;
  return "";
}

function normalizeProfileText(value, maxLength) {
  const normalized = normalizeDisplayValue(value)
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!Number.isFinite(Number(maxLength)) || Number(maxLength) <= 0) return normalized;
  return normalized.slice(0, Number(maxLength));
}

function normalizeTargetScoreValue(value) {
  const normalized = normalizeDisplayValue(value);
  if (!normalized) return null;
  const numeric = Number(normalized.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(numeric)) return null;
  return Math.max(10, Math.min(90, Math.round(numeric)));
}

function normalizeDateFieldValue(value) {
  const normalized = normalizeDisplayValue(value);
  if (!normalized) return "";
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return normalized.slice(0, 32);

  const date = new Date(`${normalized}T00:00:00`);
  if (!Number.isFinite(date.getTime())) return "";

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeMetadataPatch(metadataPatch) {
  const allowedKeys = new Set([
    "avatar_url",
    "display_name",
    "username",
    "target_score",
    "exam_date",
    "current_stage"
  ]);
  const normalized = {};

  for (const [key, value] of Object.entries(metadataPatch || {})) {
    if (!allowedKeys.has(key)) continue;
    if (key === "avatar_url") {
      const avatar = normalizeAvatarUrl(value);
      if (avatar) normalized.avatar_url = avatar;
      continue;
    }
    if (key === "display_name" || key === "username") {
      const text = normalizeProfileText(value, 32);
      if (text) normalized[key] = text;
      continue;
    }
    if (key === "target_score") {
      normalized.target_score = normalizeTargetScoreValue(value);
      continue;
    }
    if (key === "exam_date") {
      normalized.exam_date = normalizeDateFieldValue(value);
      continue;
    }
    if (key === "current_stage") {
      normalized.current_stage = normalizeProfileText(value, 20);
    }
  }

  return normalized;
}

function pickSkippedProfileValues(patch, skippedColumns = []) {
  const allowedFallbackColumns = new Set(["display_name", "username", "target_score", "exam_date", "current_stage"]);
  return skippedColumns.reduce((values, column) => {
    if (allowedFallbackColumns.has(column) && Object.prototype.hasOwnProperty.call(patch, column)) {
      values[column] = patch[column];
    }
    return values;
  }, {});
}

async function updateOwnProfileWithKnownColumns(userId, patch) {
  let activePatch = { ...patch };
  const skippedColumns = [];

  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (Object.keys(activePatch).length === 0) {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      if (error) throw toChineseProfileError(error);
      return {
        updatedProfile: data || null,
        skippedColumns
      };
    }

    const { data, error } = await supabase
      .from("profiles")
      .update(activePatch)
      .eq("id", userId)
      .select("*")
      .maybeSingle();

    if (!error) {
      return {
        updatedProfile: data || null,
        skippedColumns
      };
    }

    const missingColumn = getMissingProfileColumn(error);
    if (missingColumn && Object.prototype.hasOwnProperty.call(activePatch, missingColumn)) {
      const { [missingColumn]: _removed, ...nextPatch } = activePatch;
      activePatch = nextPatch;
      skippedColumns.push(missingColumn);
      continue;
    }

    throw toChineseProfileError(error);
  }

  throw new Error("资料字段校验失败，请稍后重试。");
}

function getMissingProfileColumn(error) {
  const code = normalizeDisplayValue(error?.code).toUpperCase();
  const message = normalizeDisplayValue(error?.message);
  const details = normalizeDisplayValue(error?.details);
  const combined = `${message} ${details}`;
  if (code !== "PGRST204" && !/schema cache|column/i.test(combined)) return "";

  const quotedColumn = combined.match(/'([^']+)'\s+column/i)?.[1];
  if (quotedColumn) return quotedColumn;

  const missingColumn = combined.match(/column\s+"?([a-zA-Z0-9_]+)"?\s+(?:does not exist|not found)/i)?.[1];
  return missingColumn || "";
}

function toChineseProfileError(error) {
  const message = normalizeDisplayValue(error?.message);
  if (/jwt|token|session|auth/i.test(message)) {
    return new Error("登录状态已过期，请重新登录后再试。");
  }
  if (/permission|policy|rls|row-level|not authorized|401|403/i.test(message)) {
    return new Error("当前账号暂时没有更新权限，请重新登录后再试。");
  }
  if (/schema cache|column .* does not exist|could not find .* column/i.test(message)) {
    return new Error("当前资料字段还未在数据库启用，已保留其它可保存内容。");
  }
  return new Error("保存失败，请稍后重试。");
}

async function readJsonPayload(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function createApiError(payload, fallbackMessage) {
  const error = new Error(payload?.message || fallbackMessage);
  error.code = payload?.error || "api_error";
  error.payload = payload;
  return error;
}
