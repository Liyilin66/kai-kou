<template>
  <div class="min-h-screen bg-[#f5f5f7] px-4 py-8 md:px-6 md:py-10">
    <div class="flex min-h-screen items-center justify-center">
      <div class="w-full max-w-[680px]">
        <div class="mb-10 text-center md:mb-12">
          <div class="mb-2 inline-flex items-center justify-center gap-3">
            <svg class="h-9 w-9 text-gray-800 md:h-10 md:w-10" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3L1 9L5 11.18V17.18L12 21L19 17.18V11.18L21 10.09V17H23V9L12 3ZM18.82 9L12 12.72L5.18 9L12 5.28L18.82 9ZM17 15.99L12 18.72L7 15.99V12.27L12 15L17 12.27V15.99Z" />
            </svg>
            <span class="text-[34px] font-semibold tracking-tight text-gray-800 md:text-[40px]">开口</span>
          </div>
        </div>

        <div class="rounded-[28px] bg-white px-6 py-7 shadow-[0_18px_42px_rgba(15,23,42,0.10),0_6px_18px_rgba(15,23,42,0.06)] md:px-11 md:py-10">
          <div>
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
              <h1 class="mb-3 text-[30px] font-bold text-gray-800 md:text-[34px]">重置密码</h1>
              <p class="mx-auto max-w-[420px] text-[16px] leading-8 text-[#7b8698] md:text-[17px]">
                输入您的邮箱地址，我们将发送重置链接
              </p>
            </div>

            <form @submit.prevent="handleSubmit">
              <div>
                <label for="forgot-password-email" class="mb-3 block text-[16px] font-bold text-gray-800 md:mb-4 md:text-[18px]">
                  邮箱地址
                </label>
                <div class="relative">
                  <svg
                    class="pointer-events-none absolute left-5 top-1/2 h-6 w-6 -translate-y-1/2 text-[#aab2c0]"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path stroke-linecap="round" stroke-linejoin="round" d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                  <input
                    id="forgot-password-email"
                    v-model="email"
                    type="email"
                    autocomplete="email"
                    placeholder="输入您的邮箱地址"
                    class="h-14 w-full rounded-[18px] border border-transparent bg-[#f3f4f8] text-[16px] text-gray-800 outline-none transition-all placeholder:text-[#aab2c0] focus:border-[#d4ddf1] focus:bg-white focus:ring-0 md:h-16 md:rounded-[20px] md:text-[17px]"
                    :class="errorMsg ? 'border-[#ffb39a] bg-[#fffaf7]' : ''"
                    style="padding-left: 64px; padding-right: 20px;"
                  />
                </div>
                <p v-if="errorMsg" class="mt-3 text-[14px] leading-6 text-[#ef6a3a]">{{ errorMsg }}</p>
              </div>

              <div class="mt-7 rounded-[20px] border border-[#b8d2ff] bg-[#eef5ff] px-5 py-5 md:mt-8 md:px-6 md:py-6">
                <div class="flex items-start gap-3">
                  <span class="mt-0.5 text-[18px] leading-none">{{ sent ? "✅" : "💡" }}</span>
                  <p class="text-[16px] leading-8 text-[#1f3150] md:text-[17px]">
                    <span class="font-bold">{{ sent ? "已发送：" : "提示：" }}</span>
                    <template v-if="sent">
                      重置链接已发送至
                      <span class="break-all font-medium text-gray-800">{{ email }}</span>
                      ，请尽快完成操作
                    </template>
                    <template v-else>密码重置链接将在15分钟内有效，请尽快完成操作</template>
                  </p>
                </div>
              </div>

              <button
                type="submit"
                :disabled="loading"
                class="mt-8 inline-flex h-14 w-full items-center justify-center gap-2 rounded-[18px] bg-[#1e3a8a] px-4 py-2 text-[18px] font-semibold text-white transition-all duration-200 hover:bg-[#1e40af] disabled:pointer-events-none disabled:opacity-50 md:mt-10 md:h-16 md:rounded-[20px] md:text-[20px]"
              >
                {{ loading ? "发送中..." : sent ? "重新发送重置链接" : "发送重置链接" }}
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
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";

const router = useRouter();
const authStore = useAuthStore();

const email = ref("");
const errorMsg = ref("");
const loading = ref(false);
const sent = ref(false);

async function handleSubmit() {
  const value = email.value.trim();

  if (!value) {
    errorMsg.value = "请输入邮箱地址";
    sent.value = false;
    return;
  }

  loading.value = true;
  errorMsg.value = "";

  try {
    await authStore.forgotPassword(value);
    email.value = value;
    sent.value = true;
  } catch (error) {
    sent.value = false;
    errorMsg.value = error?.message || "发送失败，请稍后重试";
  } finally {
    loading.value = false;
  }
}
</script>
