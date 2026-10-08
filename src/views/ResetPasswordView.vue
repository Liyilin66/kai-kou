<template>
  <div class="min-h-screen bg-[#f5f5f7] px-4 py-8 md:px-6 md:py-10">
    <div class="flex min-h-screen items-center justify-center">
      <div class="w-full max-w-[680px]">
        <div class="mb-10 text-center md:mb-12">
          <div class="mb-2 inline-flex items-center justify-center gap-3">
            <svg class="h-9 w-9 text-[#273144] md:h-10 md:w-10" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3L1 9L5 11.18V17.18L12 21L19 17.18V11.18L21 10.09V17H23V9L12 3ZM18.82 9L12 12.72L5.18 9L12 5.28L18.82 9ZM17 15.99L12 18.72L7 15.99V12.27L12 15L17 12.27V15.99Z" />
            </svg>
            <span class="text-[34px] font-semibold tracking-tight text-[#1f2d42] md:text-[40px]">开口</span>
          </div>
        </div>

        <div class="rounded-[28px] bg-white px-6 py-7 shadow-[0_18px_42px_rgba(15,23,42,0.10),0_6px_18px_rgba(15,23,42,0.06)] md:px-11 md:py-10">
          <button
            type="button"
            class="group mb-8 flex items-center gap-3 text-[16px] font-medium text-gray-600 transition-colors hover:text-gray-800 md:mb-10 md:text-[18px]"
            @click="router.push('/auth')"
          >
            <svg
              class="h-5 w-5 transition-transform group-hover:-translate-x-1"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="m12 19-7-7 7-7" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 12H5" />
            </svg>
            <span class="text-sm font-medium">返回登录</span>
          </button>

          <div class="mb-10 text-center md:mb-12">
            <h1 class="mb-3 text-[30px] font-bold text-[#1f3150] md:text-[34px]">重置密码</h1>
            <p class="mx-auto max-w-[440px] text-[16px] leading-8 text-[#7b8698] md:text-[17px]">
              {{ pageSubtitle }}
            </p>
          </div>

          <div v-if="viewState === 'success'" class="space-y-6">
            <div class="rounded-[24px] border border-[#e8edf5] bg-[#f8fafc] px-5 py-6 text-center md:px-7 md:py-8">
              <div
                class="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[#1e3a8a]/10 text-[#1e3a8a]"
              >
                <svg class="h-7 w-7" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p class="text-[18px] font-semibold text-[#1f3150]">密码已更新</p>
              <p class="mt-3 text-[15px] leading-7 text-[#52627c]">
                你现在可以使用新密码重新登录。为确保账号状态一致，我们会在
                <strong class="font-semibold text-[#1f3150]">{{ redirectCountdown }}</strong>
                秒后带你返回登录页。
              </p>
              <button
                type="button"
                class="mt-8 flex h-[64px] w-full items-center justify-center gap-2 rounded-[20px] bg-[#1e3a8a] text-[20px] font-medium text-white transition-all duration-200 hover:bg-[#2247ae]"
                @click="handleSuccessPrimaryAction"
              >
                <span>返回登录</span>
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </button>
            </div>

            <div class="rounded-[20px] border border-[#b8d2ff] bg-[#eef5ff] px-5 py-5 md:px-6 md:py-6">
              <div class="flex items-start gap-3">
                <span class="mt-0.5 text-[18px] leading-none">提示</span>
                <p class="text-[16px] leading-8 text-[#1f3150] md:text-[17px]">
                  如果页面没有自动跳转，可以点击上方按钮立即返回登录；返回后请直接使用新密码登录。
                </p>
              </div>
            </div>
          </div>

          <div v-else-if="viewState === 'invalid'" class="space-y-6">
            <div :class="statusCardClass">
              <div class="flex items-start gap-4">
                <div :class="statusIconWrapperClass">
                  <svg class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4" />
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 17h.01" />
                    <path stroke-linecap="round" stroke-linejoin="round" d="M10.29 3.86 1.82 18a2 2 0 0 0 1.72 3h16.92a2 2 0 0 0 1.72-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                  </svg>
                </div>
                <div class="flex-1">
                  <p class="text-[18px] font-bold text-[#1f3150]">这个重置链接已失效</p>
                  <p class="mt-2 text-[15px] leading-7 text-[#52627c] md:text-[16px]">
                    {{ invalidStateMessage }}
                  </p>
                </div>
              </div>
            </div>

            <div class="rounded-[20px] border border-[#e8edf5] bg-[#f8fafc] px-5 py-5 md:px-6 md:py-6">
              <p class="text-[16px] leading-8 text-[#52627c] md:text-[17px]">
                你可以重新申请一封密码重置邮件，收到后请优先使用最新邮件中的链接继续操作。
              </p>
            </div>

            <button
              type="button"
              class="inline-flex h-14 w-full items-center justify-center gap-2 rounded-[18px] bg-[#1e3a8a] px-4 py-2 text-[18px] font-semibold text-white transition-all duration-200 hover:bg-[#1e40af] md:h-16 md:rounded-[20px] md:text-[20px]"
              @click="router.push('/forgot-password')"
            >
              重新申请重置邮件
            </button>

            <button
              type="button"
              class="inline-flex h-14 w-full items-center justify-center gap-2 rounded-[18px] border border-[#d9e2f1] bg-white px-4 py-2 text-[17px] font-semibold text-[#4b586d] transition-all duration-200 hover:border-[#c7d4ea] hover:text-[#243042] md:h-16 md:rounded-[20px] md:text-[18px]"
              @click="router.push('/auth')"
            >
              返回登录
            </button>
          </div>

          <div v-else>
            <div :class="statusCardClass">
              <div class="flex items-start gap-4">
                <div :class="statusIconWrapperClass">
                  <svg
                    v-if="viewState === 'verifying'"
                    class="h-6 w-6 animate-spin"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 3a9 9 0 1 0 9 9" />
                  </svg>
                  <svg
                    v-else
                    class="h-6 w-6"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div class="flex-1">
                  <p class="text-[18px] font-bold text-[#1f3150]">{{ statusCardTitle }}</p>
                  <p class="mt-2 text-[15px] leading-7 text-[#52627c] md:text-[16px]">
                    {{ statusCardDescription }}
                  </p>
                </div>
              </div>
            </div>

            <form v-if="viewState === 'ready'" class="mt-8 space-y-6 md:mt-10 md:space-y-7" @submit.prevent="handleSubmit">
              <div class="space-y-3">
                <label class="block text-[18px] font-bold text-[#1f3150]">新密码</label>
                <div class="relative">
                  <svg
                    class="absolute left-5 top-1/2 h-6 w-6 -translate-y-1/2 text-[#9aa4b5]"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <rect x="5" y="11" width="14" height="10" rx="2" />
                    <path stroke-linecap="round" stroke-linejoin="round" d="M8 11V8a4 4 0 1 1 8 0v3" />
                  </svg>
                  <input
                    v-model="password"
                    :type="showPassword ? 'text' : 'password'"
                    autocomplete="new-password"
                    placeholder="请输入新密码"
                    :class="[basePasswordInputClass, fieldErrors.password ? errorInputClass : '']"
                  />
                  <button
                    type="button"
                    class="absolute right-5 top-1/2 -translate-y-1/2 text-[#9aa4b5] transition-colors hover:text-[#7c8798]"
                    @click="showPassword = !showPassword"
                  >
                    <svg
                      v-if="showPassword"
                      class="h-6 w-6"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path stroke-linecap="round" stroke-linejoin="round" d="m3 3 18 18" />
                      <path stroke-linecap="round" stroke-linejoin="round" d="M10.48 10.48A3 3 0 0 0 13.52 13.52" />
                      <path stroke-linecap="round" stroke-linejoin="round" d="M9.88 5.09A10.94 10.94 0 0 1 12 5c5.52 0 10 7 10 7a17.8 17.8 0 0 1-4.38 5.37" />
                      <path stroke-linecap="round" stroke-linejoin="round" d="M6.61 6.61A17.7 17.7 0 0 0 2 12s4.48 7 10 7a9.76 9.76 0 0 0 5.39-1.61" />
                    </svg>
                    <svg
                      v-else
                      class="h-6 w-6"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path stroke-linecap="round" stroke-linejoin="round" d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  </button>
                </div>
                <p v-if="fieldErrors.password" class="text-sm text-[#ff7f50]">{{ fieldErrors.password }}</p>
              </div>

              <div class="space-y-3">
                <label class="block text-[18px] font-bold text-[#1f3150]">确认新密码</label>
                <div class="relative">
                  <svg
                    class="absolute left-5 top-1/2 h-6 w-6 -translate-y-1/2 text-[#9aa4b5]"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <rect x="5" y="11" width="14" height="10" rx="2" />
                    <path stroke-linecap="round" stroke-linejoin="round" d="M8 11V8a4 4 0 1 1 8 0v3" />
                  </svg>
                  <input
                    v-model="confirmPassword"
                    :type="showConfirmPassword ? 'text' : 'password'"
                    autocomplete="new-password"
                    placeholder="请再次输入新密码"
                    :class="[basePasswordInputClass, fieldErrors.confirmPassword ? errorInputClass : '']"
                  />
                  <button
                    type="button"
                    class="absolute right-5 top-1/2 -translate-y-1/2 text-[#9aa4b5] transition-colors hover:text-[#7c8798]"
                    @click="showConfirmPassword = !showConfirmPassword"
                  >
                    <svg
                      v-if="showConfirmPassword"
                      class="h-6 w-6"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path stroke-linecap="round" stroke-linejoin="round" d="m3 3 18 18" />
                      <path stroke-linecap="round" stroke-linejoin="round" d="M10.48 10.48A3 3 0 0 0 13.52 13.52" />
                      <path stroke-linecap="round" stroke-linejoin="round" d="M9.88 5.09A10.94 10.94 0 0 1 12 5c5.52 0 10 7 10 7a17.8 17.8 0 0 1-4.38 5.37" />
                      <path stroke-linecap="round" stroke-linejoin="round" d="M6.61 6.61A17.7 17.7 0 0 0 2 12s4.48 7 10 7a9.76 9.76 0 0 0 5.39-1.61" />
                    </svg>
                    <svg
                      v-else
                      class="h-6 w-6"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path stroke-linecap="round" stroke-linejoin="round" d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  </button>
                </div>
                <p v-if="fieldErrors.confirmPassword" class="text-sm text-[#ff7f50]">{{ fieldErrors.confirmPassword }}</p>
              </div>

              <div class="rounded-[18px] bg-[#f8fafc] px-5 py-4 text-[15px] leading-7 text-[#52627c]">
                密码至少需要 6 位。为了账号安全，建议使用和旧密码不同的新密码。
              </div>

              <div
                v-if="feedbackMessage"
                class="rounded-[18px] px-5 py-4 text-[15px] leading-7"
                :class="feedbackTone === 'error'
                  ? 'bg-[#fff3ee] text-[#dd6b43]'
                  : 'bg-[#eef4ff] text-[#3658b0]'"
              >
                {{ feedbackMessage }}
              </div>

              <button
                type="submit"
                class="mt-2 flex h-[68px] w-full items-center justify-center gap-2 rounded-[22px] bg-[#1e3a8a] text-[22px] font-medium text-white transition-all duration-200 hover:bg-[#2146ad] disabled:cursor-not-allowed disabled:bg-[#b8c2d8]"
                :disabled="loading || !sessionReady"
              >
                <template v-if="loading">
                  <span class="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>处理中...</span>
                </template>
                <template v-else>
                  <span>确认重置</span>
                  <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </template>
              </button>
            </form>
          </div>
        </div>

        <p class="mt-10 text-center text-[16px] text-[#4b586d] md:mt-12 md:text-[18px]">放弃完美，拥抱流利</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";

const router = useRouter();
const authStore = useAuthStore();

const password = ref("");
const confirmPassword = ref("");
const showPassword = ref(false);
const showConfirmPassword = ref(false);
const loading = ref(false);
const success = ref(false);
const sessionReady = ref(false);
const verifyingLink = ref(true);
const redirectCountdown = ref(3);
const linkErrorMessage = ref("");
const feedbackMessage = ref("");
const feedbackTone = ref("info");

const fieldErrors = reactive({
  password: "",
  confirmPassword: ""
});

const basePasswordInputClass = "h-[70px] w-full rounded-[20px] border-0 bg-[#f5f7fb] pl-14 pr-14 text-[18px] text-[#23324a] placeholder:text-[#95a0b5] transition-all duration-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#ff7f50]/45";
const errorInputClass = "ring-2 ring-[#ff7f50]/55";

let authSubscription = null;
let verificationTimer = null;
let successRedirectTimer = null;
let successCountdownTimer = null;

const viewState = computed(() => {
  if (success.value) return "success";
  if (sessionReady.value) return "ready";
  if (verifyingLink.value) return "verifying";
  return "invalid";
});

const pageSubtitle = computed(() => {
  if (viewState.value === "success") {
    return "你的账号密码已经更新完成，返回登录页后即可使用新密码继续登录。";
  }

  if (viewState.value === "invalid") {
    return "当前链接无法继续使用，我们已经为你准备好了重新申请重置邮件的入口。";
  }

  if (viewState.value === "verifying") {
    return "我们正在确认邮件中的重置链接是否仍然有效，请稍候片刻。";
  }

  return "请输入并确认新的登录密码，提交后即可完成本次密码重置。";
});

const invalidStateMessage = computed(() => {
  return linkErrorMessage.value || "链接可能已过期、已被使用，或不是最新邮件中的链接，请重新申请一封新的重置邮件。";
});

const statusCardTitle = computed(() => {
  return viewState.value === "verifying" ? "链接验证中" : "链接验证成功";
});

const statusCardDescription = computed(() => {
  if (viewState.value === "verifying") {
    return "请稍候，我们正在检查这封邮件中的重置凭证。验证完成后，你就可以在这里设置新的登录密码。";
  }

  return "现在可以设置新的登录密码。重置完成后，我们会自动带你返回登录页，你也可以手动返回继续登录。";
});

const statusCardClass = computed(() => {
  if (viewState.value === "invalid") {
    return "rounded-[20px] border border-[#ffd8c7] bg-[#fff6f1] px-5 py-5 md:px-6 md:py-6";
  }

  return "rounded-[20px] border border-[#b8d2ff] bg-[#eef5ff] px-5 py-5 md:px-6 md:py-6";
});

const statusIconWrapperClass = computed(() => {
  if (viewState.value === "invalid") {
    return "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#ffe7db] text-[#dd6b43]";
  }

  return "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/80 text-[#3658b0]";
});

onMounted(async () => {
  const callbackState = readRecoveryCallbackState();
  const callbackErrorMessage = getRecoveryLinkErrorMessage(callbackState);

  if (callbackErrorMessage) {
    linkErrorMessage.value = callbackErrorMessage;
    verifyingLink.value = false;
    return;
  }

  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData?.session) {
    sessionReady.value = true;
    verifyingLink.value = false;
    clearAuthCallbackUrl();
    return;
  }

  if (!callbackState.hasRecoveryParams) {
    verifyingLink.value = false;
    linkErrorMessage.value = "当前页面缺少有效的重置凭证，请从邮件里的重置链接重新进入。";
    return;
  }

  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") && session) {
      sessionReady.value = true;
      verifyingLink.value = false;
      linkErrorMessage.value = "";
      feedbackMessage.value = "";
      clearAuthCallbackUrl();
    }
  });

  authSubscription = data?.subscription || null;
  verificationTimer = window.setTimeout(() => {
    if (sessionReady.value || linkErrorMessage.value) return;
    verifyingLink.value = false;
    linkErrorMessage.value = "重置链接已失效、已过期，或已经被使用。请重新申请一封新的密码重置邮件。";
  }, 3000);
});

onUnmounted(() => {
  authSubscription?.unsubscribe();
  if (verificationTimer) {
    window.clearTimeout(verificationTimer);
  }
  clearSuccessRedirect();
});

function clearFieldErrors() {
  fieldErrors.password = "";
  fieldErrors.confirmPassword = "";
}

function clearFeedback() {
  feedbackMessage.value = "";
  feedbackTone.value = "info";
}

function validateForm() {
  clearFieldErrors();

  if (!password.value) {
    fieldErrors.password = "请输入新密码";
  } else if (password.value.length < 6) {
    fieldErrors.password = "密码至少需要 6 位";
  }

  if (!confirmPassword.value) {
    fieldErrors.confirmPassword = "请再次输入新密码";
  } else if (confirmPassword.value !== password.value) {
    fieldErrors.confirmPassword = "两次输入的密码不一致";
  }

  return !fieldErrors.password && !fieldErrors.confirmPassword;
}

function clearSuccessRedirect() {
  if (successRedirectTimer) {
    window.clearTimeout(successRedirectTimer);
    successRedirectTimer = null;
  }

  if (successCountdownTimer) {
    window.clearInterval(successCountdownTimer);
    successCountdownTimer = null;
  }
}

function scheduleSuccessRedirect(seconds = 3) {
  clearSuccessRedirect();
  redirectCountdown.value = seconds;

  successCountdownTimer = window.setInterval(() => {
    redirectCountdown.value = Math.max(0, redirectCountdown.value - 1);
    if (redirectCountdown.value <= 0 && successCountdownTimer) {
      window.clearInterval(successCountdownTimer);
      successCountdownTimer = null;
    }
  }, 1000);

  successRedirectTimer = window.setTimeout(async () => {
    await navigateToAuth(true);
  }, seconds * 1000);
}

async function navigateToAuth(clearSession = false) {
  clearSuccessRedirect();

  if (clearSession) {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.warn("Failed to sign out after password reset:", error);
    }
  }

  router.replace("/auth");
}

async function handleSuccessPrimaryAction() {
  await navigateToAuth(true);
}

async function handleSubmit() {
  clearFeedback();

  if (!validateForm()) return;

  if (!sessionReady.value) {
    feedbackTone.value = "error";
    feedbackMessage.value = "重置链接已失效，请重新申请密码重置邮件。";
    return;
  }

  loading.value = true;

  try {
    await authStore.resetPassword(password.value);
    success.value = true;
    password.value = "";
    confirmPassword.value = "";
    showPassword.value = false;
    showConfirmPassword.value = false;
    scheduleSuccessRedirect();
  } catch (error) {
    feedbackTone.value = "error";
    feedbackMessage.value = getResetPasswordErrorMessage(error);
  } finally {
    loading.value = false;
  }
}

function readRecoveryCallbackState() {
  if (typeof window === "undefined") {
    return {
      hasRecoveryParams: false,
      error: "",
      errorCode: "",
      errorDescription: "",
      type: ""
    };
  }

  const searchParams = new URLSearchParams(window.location.search);
  const hashValue = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  const hashParams = new URLSearchParams(hashValue);
  const getParam = (key) => hashParams.get(key) || searchParams.get(key) || "";
  const type = getParam("type");
  const error = getParam("error");
  const errorCode = getParam("error_code");
  const errorDescription = getParam("error_description");
  const accessToken = getParam("access_token");
  const refreshToken = getParam("refresh_token");
  const code = getParam("code");

  return {
    hasRecoveryParams: Boolean(type === "recovery" || accessToken || refreshToken || code || error || errorCode),
    error,
    errorCode,
    errorDescription,
    type
  };
}

function getRecoveryLinkErrorMessage({ error, errorCode, errorDescription }) {
  const normalizedCode = `${errorCode || ""}`.toLowerCase();
  const normalizedError = `${error || ""}`.toLowerCase();
  const description = `${errorDescription || ""}`.replace(/\+/g, " ").trim().toLowerCase();

  if (normalizedCode === "otp_expired" || description.includes("expired")) {
    return "重置链接已过期或已被使用，请重新申请密码重置邮件。";
  }

  if (
    normalizedError === "access_denied"
    || normalizedCode === "access_denied"
    || description.includes("invalid")
    || description.includes("access denied")
  ) {
    return "当前重置链接无效，请重新申请密码重置邮件。";
  }

  if (description) {
    return "当前重置链接暂时无法使用，请重新申请密码重置邮件。";
  }

  return "";
}

function getResetPasswordErrorMessage(error) {
  const message = `${error?.message || ""}`;
  const normalizedMessage = message.toLowerCase();

  if (message.includes("Auth session missing")) {
    return "重置链接已失效，请重新申请密码重置邮件。";
  }

  if (message.includes("was released because another request stole it")) {
    return "系统正在处理认证状态，请稍后再试一次。";
  }

  if (normalizedMessage.includes("same password")) {
    return "新密码不能与当前密码相同，请换一个密码。";
  }

  if (normalizedMessage.includes("password should be")) {
    return "密码至少需要 6 位，请重新设置。";
  }

  return "重置失败，请稍后重试；如果仍然失败，请重新申请新的重置链接。";
}

function clearAuthCallbackUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.hash = "";
  url.searchParams.delete("code");
  url.searchParams.delete("type");
  url.searchParams.delete("error");
  url.searchParams.delete("error_code");
  url.searchParams.delete("error_description");
  window.history.replaceState(window.history.state, "", url.toString());
}
</script>
