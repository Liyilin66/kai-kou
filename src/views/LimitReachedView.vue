<template>
  <div class="kk-page flex min-h-screen flex-col items-center justify-center px-4 py-10">
    <div class="w-full max-w-sm rounded-[20px] border border-kk-line bg-kk-surface p-6 text-center shadow-kk">
      <div class="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-kk-surface-2 text-kk-ink-2" aria-hidden="true"><svg class="h-7 w-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg></div>
      <h1 class="mb-3 text-[24px] font-bold text-kk-ink">免费试用已结束</h1>
      <p class="mb-3 leading-relaxed text-kk-ink-3">当前账号未开通 AI 评分权限。</p>
      <p class="mb-8 leading-relaxed text-kk-ink-3">开通 VIP 后即可无限练习；若是赠送试用账号，请联系管理员配置试用时长。</p>

      <button
        type="button"
        class="mb-3 min-h-[52px] w-full rounded-full py-3 text-[16px] font-bold transition-colors bg-kk-action text-kk-on-action hover:bg-kk-action-hover active:bg-kk-action-press"
        @click="router.push('/upgrade')"
      >
        去开通
      </button>

      <button
        type="button"
        class="mb-3 w-full min-h-[48px] rounded-full border border-kk-line bg-kk-surface py-3 text-[15px] font-semibold text-kk-ink transition-colors hover:bg-kk-surface-2"
        @click="openContact"
      >
        联系管理员
      </button>

      <button
        type="button"
        class="w-full min-h-[48px] rounded-full border border-kk-line bg-kk-surface py-3 text-[15px] font-semibold text-kk-ink transition-colors hover:bg-kk-surface-2"
        @click="router.push('/home')"
      >
        返回首页
      </button>
    </div>
  </div>
</template>

<script setup>
import { useRouter } from "vue-router";

const router = useRouter();
const adminContactEmail = import.meta.env.VITE_ADMIN_CONTACT_EMAIL || "admin@example.com";

function openContact() {
  if (typeof window !== "undefined") {
    window.location.href = `mailto:${adminContactEmail}`;
  }
}
</script>
