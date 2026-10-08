<template>
  <div class="flex min-h-screen flex-col items-center justify-center bg-bg px-6">
    <div class="max-w-sm text-center">
      <div class="mb-6 text-6xl">🌙</div>
      <h1 class="mb-3 text-2xl font-bold text-navy">免费试用已结束</h1>
      <p class="mb-3 leading-relaxed text-muted">当前账号未开通 AI 评分权限。</p>
      <p class="mb-8 leading-relaxed text-muted">开通 VIP 后即可无限练习；若是赠送试用账号，请联系管理员配置试用时长。</p>

      <button
        type="button"
        class="mb-3 w-full rounded-xl bg-orange py-4 text-lg font-bold text-white shadow-md transition-opacity hover:opacity-90"
        @click="router.push('/upgrade')"
      >
        去开通
      </button>

      <button
        type="button"
        class="mb-3 w-full rounded-xl border border-gray-200 py-3 text-muted transition-all hover:border-navy hover:text-navy"
        @click="openContact"
      >
        联系管理员
      </button>

      <button
        type="button"
        class="w-full rounded-xl border border-gray-200 py-3 text-muted transition-all hover:border-navy hover:text-navy"
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
