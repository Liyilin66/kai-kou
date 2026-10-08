<template>
  <div class="min-h-screen bg-[#f5f5f7] px-4 py-10 md:py-16">
    <div class="mx-auto w-full max-w-[680px]">
      <div class="text-center">
        <div class="inline-flex items-center justify-center gap-3 md:gap-4">
          <svg
            class="h-8 w-8 text-[#273144] md:h-10 md:w-10"
            fill="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M12 3L1 9L5 11.18V17.18L12 21L19 17.18V11.18L21 10.09V17H23V9L12 3ZM18.82 9L12 12.72L5.18 9L12 5.28L18.82 9ZM17 15.99L12 18.72L7 15.99V12.27L12 15L17 12.27V15.99Z" />
          </svg>
          <span class="text-[34px] font-semibold tracking-tight text-[#1f2d42] md:text-[48px]">开口</span>
        </div>
      </div>

      <div
        class="mt-10 rounded-[30px] bg-white px-5 py-6 shadow-[0_18px_45px_rgba(15,23,42,0.10),0_4px_12px_rgba(15,23,42,0.05)] md:mt-14 md:px-12 md:py-10"
      >
        <div class="grid grid-cols-2 gap-4 md:gap-6">
          <button
            type="button"
            class="h-[60px] rounded-[18px] text-[20px] font-medium transition-all duration-200 md:h-[72px] md:text-[24px]"
            :class="mode === 'login'
              ? 'bg-white text-[#243042] shadow-[0_10px_25px_rgba(15,23,42,0.12),0_2px_8px_rgba(15,23,42,0.06)]'
              : 'text-[#6c7a90]'"
            @click="switchMode('login')"
          >
            登录
          </button>
          <button
            type="button"
            class="h-[60px] rounded-[18px] text-[20px] font-medium transition-all duration-200 md:h-[72px] md:text-[24px]"
            :class="mode === 'register'
              ? 'bg-white text-[#243042] shadow-[0_10px_25px_rgba(15,23,42,0.12),0_2px_8px_rgba(15,23,42,0.06)]'
              : 'text-[#6c7a90]'"
            @click="switchMode('register')"
          >
            注册
          </button>
        </div>

        <div class="mt-10 text-center md:mt-14">
          <h2 class="text-[30px] font-bold text-[#1f3150] md:text-[42px]">{{ panelTitle }}</h2>
          <p class="mt-3 text-[18px] text-[#7f8aa1] md:text-[19px]">{{ panelSubtitle }}</p>
        </div>

        <div v-if="registerSuccess" class="mt-10 md:mt-14">
          <div class="rounded-[24px] border border-[#e8edf5] bg-[#f8fafc] px-5 py-6 text-center md:px-7 md:py-8">
            <div
              class="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[#1e3a8a]/10 text-[#1e3a8a]"
            >
              <svg class="h-7 w-7" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p class="text-[18px] font-semibold text-[#1f3150]">{{ registerSuccessMessage }}</p>
            <p class="mt-3 text-[15px] leading-7 text-[#52627c]">
              新账号：
              <strong class="font-semibold text-[#1f3150]">{{ registeredEmail }}</strong>
            </p>
            <button
              type="button"
              class="mt-8 flex h-[64px] w-full items-center justify-center gap-2 rounded-[20px] bg-[#1e3a8a] text-[20px] font-medium text-white transition-all duration-200 hover:bg-[#2247ae]"
              @click="handleSuccessPrimaryAction"
            >
              <span>{{ successPrimaryActionLabel }}</span>
              <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>
          </div>
        </div>

        <form v-else class="mt-10 space-y-6 md:mt-14 md:space-y-7" @submit.prevent="handleSubmit">
          <div v-if="mode === 'register'" class="space-y-3">
            <label class="block text-[18px] font-bold text-[#1f3150]">用户名</label>
            <div class="relative">
              <svg
                class="absolute left-5 top-1/2 h-6 w-6 -translate-y-1/2 text-[#9aa4b5]"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 20a8 8 0 0 1 16 0" />
              </svg>
              <input
                v-model="username"
                type="text"
                autocomplete="nickname"
                placeholder="设置你的用户名"
                :class="[baseInputClass, fieldErrors.username ? errorInputClass : '']"
              />
            </div>
            <p v-if="fieldErrors.username" class="text-sm text-[#ff7f50]">{{ fieldErrors.username }}</p>
          </div>

          <div class="space-y-3">
            <label class="block text-[18px] font-bold text-[#1f3150]">邮箱</label>
            <div class="relative">
              <svg
                class="absolute left-5 top-1/2 h-6 w-6 -translate-y-1/2 text-[#9aa4b5]"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16v12H4z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="m4 7 8 6 8-6" />
              </svg>
              <input
                v-model="email"
                type="email"
                autocomplete="email"
                placeholder="输入你的邮箱"
                :class="[baseInputClass, fieldErrors.email ? errorInputClass : '']"
              />
            </div>
            <p v-if="fieldErrors.email" class="text-sm text-[#ff7f50]">{{ fieldErrors.email }}</p>
          </div>

          <div v-if="mode === 'register'" class="space-y-3">
            <label class="block text-[18px] font-bold text-[#1f3150]">邮箱验证码</label>
            <div class="flex items-center gap-3">
              <div class="relative flex-1">
                <svg
                  class="absolute left-5 top-1/2 h-6 w-6 -translate-y-1/2 text-[#9aa4b5]"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 3 6 6v5c0 4.2 2.55 8.13 6 10 3.45-1.87 6-5.8 6-10V6l-6-3Z" />
                </svg>
                <input
                  v-model="verificationCode"
                  type="text"
                  inputmode="numeric"
                  maxlength="6"
                  placeholder="输入 6 位验证码"
                  :class="[baseInputClass, fieldErrors.verificationCode ? errorInputClass : '']"
                  @input="sanitizeVerificationCode"
                />
              </div>
              <button
                type="button"
                class="shrink-0 px-2 text-[18px] font-medium text-[#ff7f50] transition-colors hover:text-[#ff6a35] disabled:cursor-not-allowed disabled:text-[#b8c0cc]"
                :disabled="codeSending || codeCountdown > 0 || loading"
                @click="handleSendCode"
              >
                {{ codeButtonLabel }}
              </button>
            </div>
            <p v-if="fieldErrors.verificationCode" class="text-sm text-[#ff7f50]">{{ fieldErrors.verificationCode }}</p>
          </div>

          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <label class="block text-[18px] font-bold text-[#1f3150]">密码</label>
              <button
                v-if="mode === 'login'"
                type="button"
                class="text-[16px] font-medium text-[#ff7f50] transition-colors hover:text-[#ff6a35]"
                @click="router.push('/forgot-password')"
              >
                忘记密码？
              </button>
            </div>
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
                :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
                placeholder="输入你的密码"
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

          <div v-if="mode === 'register'" class="space-y-3">
            <label class="block text-[18px] font-bold text-[#1f3150]">确认密码</label>
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
                placeholder="请再次输入密码"
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
            :disabled="loading"
          >
            <template v-if="loading">
              <span class="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              <span>处理中...</span>
            </template>
            <template v-else>
              <span>{{ mode === "login" ? "登录" : "注册" }}</span>
              <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </template>
          </button>
        </form>
      </div>

      <div class="mt-10 text-center md:mt-12">
        <p class="text-[18px] text-[#7b8597] italic">放弃完美，拥抱流利</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onUnmounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";

const router = useRouter();
const authStore = useAuthStore();

const mode = ref("login");
const username = ref("");
const email = ref("");
const verificationCode = ref("");
const password = ref("");
const confirmPassword = ref("");
const showPassword = ref(false);
const showConfirmPassword = ref(false);
const loading = ref(false);
const codeSending = ref(false);
const codeCountdown = ref(0);
const registerSuccess = ref(false);
const registeredEmail = ref("");
const registerSuccessMessage = ref("注册成功");
const feedbackMessage = ref("");
const feedbackTone = ref("info");
const successPrimaryActionLabel = ref("进入首页");

const fieldErrors = reactive({
  username: "",
  email: "",
  verificationCode: "",
  password: "",
  confirmPassword: ""
});

const baseInputClass = "h-[70px] w-full rounded-[20px] border-0 bg-[#f5f7fb] pl-14 pr-4 text-[18px] text-[#23324a] placeholder:text-[#95a0b5] transition-all duration-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#ff7f50]/45";
const basePasswordInputClass = "h-[70px] w-full rounded-[20px] border-0 bg-[#f5f7fb] pl-14 pr-14 text-[18px] text-[#23324a] placeholder:text-[#95a0b5] transition-all duration-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#ff7f50]/45";
const errorInputClass = "ring-2 ring-[#ff7f50]/55";

let countdownTimer = null;
let successRedirectTimer = null;

const panelTitle = computed(() => {
  if (registerSuccess.value) return "注册成功";
  return mode.value === "login" ? "欢迎回来" : "创建你的账号";
});

const panelSubtitle = computed(() => {
  if (registerSuccess.value) return registerSuccessMessage.value;
  return mode.value === "login" ? "请输入你的邮箱和密码登录" : "请先发送邮箱验证码，再完成注册";
});

const codeButtonLabel = computed(() => {
  if (codeSending.value) return "发送中...";
  if (codeCountdown.value > 0) return `${codeCountdown.value}s`;
  return "发送验证码";
});

function clearFieldErrors() {
  Object.keys(fieldErrors).forEach((key) => {
    fieldErrors[key] = "";
  });
}

function clearFeedback() {
  feedbackMessage.value = "";
  feedbackTone.value = "info";
}

function resetFormFeedback() {
  clearFieldErrors();
  clearFeedback();
}

function switchMode(nextMode) {
  mode.value = nextMode;
  registerSuccess.value = false;
  registerSuccessMessage.value = "注册成功";
  successPrimaryActionLabel.value = "进入首页";
  clearVerificationCountdown();
  clearSuccessRedirect();
  verificationCode.value = "";
  confirmPassword.value = "";
  showPassword.value = false;
  showConfirmPassword.value = false;
  resetFormFeedback();
}

function switchToLogin() {
  switchMode("login");
  password.value = "";
  confirmPassword.value = "";
  verificationCode.value = "";
}

function clearVerificationCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  codeCountdown.value = 0;
  codeSending.value = false;
}

function startVerificationCountdown(seconds = 60) {
  clearVerificationCountdown();
  codeCountdown.value = seconds;
  countdownTimer = setInterval(() => {
    if (codeCountdown.value <= 1) {
      clearVerificationCountdown();
      return;
    }
    codeCountdown.value -= 1;
  }, 1000);
}

function clearSuccessRedirect() {
  if (successRedirectTimer) {
    clearTimeout(successRedirectTimer);
    successRedirectTimer = null;
  }
}

function scheduleSuccessRedirect(path) {
  clearSuccessRedirect();
  successRedirectTimer = setTimeout(() => {
    router.replace(path);
  }, 1200);
}

function sanitizeVerificationCode() {
  verificationCode.value = `${verificationCode.value || ""}`.replace(/\D+/g, "").slice(0, 6);
}

function isEmailAddress(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validateLoginFields() {
  const normalizedEmail = email.value.trim().toLowerCase();

  if (!normalizedEmail) {
    fieldErrors.email = "请输入登录邮箱";
  } else if (!isEmailAddress(normalizedEmail)) {
    fieldErrors.email = "请输入正确的邮箱地址";
  }

  if (!password.value) {
    fieldErrors.password = "请输入密码";
  }
}

function validateRegisterFields() {
  const normalizedEmail = email.value.trim().toLowerCase();

  if (!username.value.trim()) {
    fieldErrors.username = "请输入用户名";
  }

  if (!normalizedEmail) {
    fieldErrors.email = "请输入注册邮箱";
  } else if (!isEmailAddress(normalizedEmail)) {
    fieldErrors.email = "请输入正确的邮箱地址";
  }

  if (!verificationCode.value) {
    fieldErrors.verificationCode = "请输入邮箱验证码";
  } else if (!/^\d{6}$/.test(verificationCode.value)) {
    fieldErrors.verificationCode = "请输入 6 位邮箱验证码";
  }

  if (!password.value) {
    fieldErrors.password = "请输入密码";
  } else if (password.value.length < 6) {
    fieldErrors.password = "密码至少需要 6 位";
  }

  if (!confirmPassword.value) {
    fieldErrors.confirmPassword = "请再次输入密码";
  } else if (confirmPassword.value !== password.value) {
    fieldErrors.confirmPassword = "两次输入的密码不一致";
  }
}

function hasFieldErrors() {
  return Object.values(fieldErrors).some(Boolean);
}

async function handleSendCode() {
  clearFeedback();
  fieldErrors.email = "";
  fieldErrors.verificationCode = "";

  const normalizedEmail = email.value.trim().toLowerCase();
  if (!normalizedEmail) {
    fieldErrors.email = "请输入注册邮箱";
    return;
  }

  if (!isEmailAddress(normalizedEmail)) {
    fieldErrors.email = "请输入正确的邮箱地址";
    return;
  }

  codeSending.value = true;

  try {
    const payload = await authStore.sendRegisterCode(normalizedEmail);
    email.value = normalizedEmail;
    startVerificationCountdown(Number(payload?.resend_after_seconds || 60));
    feedbackTone.value = "info";
    feedbackMessage.value = payload?.message || "验证码已发送，请查收邮箱";
  } catch (error) {
    feedbackTone.value = "error";
    feedbackMessage.value = mapAuthError(error);
  } finally {
    codeSending.value = false;
  }
}

async function handleSubmit() {
  resetFormFeedback();
  sanitizeVerificationCode();

  if (mode.value === "login") {
    validateLoginFields();
  } else {
    validateRegisterFields();
  }

  if (hasFieldErrors()) return;

  loading.value = true;

  try {
    const normalizedEmail = email.value.trim().toLowerCase();

    if (mode.value === "register") {
      const result = await authStore.registerWithCode({
        username: username.value.trim(),
        email: normalizedEmail,
        verificationCode: verificationCode.value,
        password: password.value,
        confirmPassword: confirmPassword.value
      });

      registeredEmail.value = normalizedEmail;
      registerSuccess.value = true;
      username.value = "";
      password.value = "";
      confirmPassword.value = "";
      verificationCode.value = "";
      showPassword.value = false;
      showConfirmPassword.value = false;
      clearVerificationCountdown();

      if (result?.autoLoggedIn) {
        registerSuccessMessage.value = "注册成功，正在进入首页...";
        successPrimaryActionLabel.value = "立即进入首页";
        scheduleSuccessRedirect("/home");
      } else {
        registerSuccessMessage.value = "注册成功，请使用新账号登录";
        successPrimaryActionLabel.value = "去登录";
      }
      return;
    }

    await authStore.login(normalizedEmail, password.value);
    router.replace("/home");
  } catch (error) {
    feedbackTone.value = "error";
    feedbackMessage.value = mapAuthError(error);
  } finally {
    loading.value = false;
  }
}

function handleSuccessPrimaryAction() {
  if (successPrimaryActionLabel.value === "去登录") {
    switchToLogin();
    return;
  }
  router.replace("/home");
}

const SERVER_SIDE_REGISTER_ERROR_CODES = new Set([
  "supabase_url_missing",
  "supabase_server_env_missing",
  "service_role_missing",
  "service_role_invalid",
  "brevo_api_key_missing",
  "resend_api_key_missing",
  "register_otp_from_email_missing",
  "register_email_env_missing",
  "register_setup_missing_function",
  "register_setup_missing_table",
  "register_setup_failed",
  "register_email_send_failed",
  "internal_error"
]);

function mapAuthError(error) {
  const code = `${error?.code || error?.payload?.error || ""}`.trim();
  const message = `${error?.message || ""}`.trim();
  const unavailableMessage = import.meta.env.DEV
    ? (message || "服务暂时不可用，请检查服务端配置")
    : "服务暂时不可用，请稍后再试";

  if (code === "email_already_registered") return "该账号已注册，请登录";
  if (code === "register_code_invalid") return "验证码错误，请重新输入";
  if (code === "register_code_expired") return "验证码已过期，请重新获取";
  if (code === "register_code_used") return "验证码已失效，请重新获取";
  if (code === "register_code_cooldown") return message || "验证码刚发送过，请稍后再试";
  if (code === "invalid_email") return "请输入正确的邮箱地址";
  if (code === "invalid_verification_code") return "请输入 6 位邮箱验证码";
  if (code === "password_too_short") return "密码至少需要 6 位";
  if (code === "profile_sync_failed") return "注册成功，但资料初始化失败，请联系管理员";
  if (SERVER_SIDE_REGISTER_ERROR_CODES.has(code)) return unavailableMessage;
  if (code && message) return message;

  if (message.includes("Invalid login credentials")) return "邮箱或密码错误";
  if (message.includes("Email not confirmed")) return "该账号尚未完成邮箱验证";
  if (message.includes("Password should be")) return "密码至少需要 6 位";
  if (message.includes("Database error saving new user")) return "注册失败，用户资料初始化异常";
  return message || "操作失败，请稍后重试";
}

onUnmounted(() => {
  clearVerificationCountdown();
  clearSuccessRedirect();
});
</script>
