<script setup>
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";

const props = defineProps({
  title: {
    type: String,
    required: true
  },
  home: {
    type: Boolean,
    default: false
  },
  showLogin: {
    type: Boolean,
    default: false
  },
  backTo: {
    type: String,
    default: ""
  },
  timer: {
    type: String,
    default: ""
  }
});

const router = useRouter();
const authStore = useAuthStore();

const statusClass = computed(() => {
  if (authStore.isPremium) return "bg-green-100 text-green-700";
  if (authStore.isInTrial) return "bg-orange/10 text-orange";
  return "bg-gray-100 text-gray-500";
});

function goBack() {
  if (!props.backTo) return;
  router.push(props.backTo);
}

function goLogin() {
  router.push("/auth");
}

async function handleLogout() {
  await authStore.logout();
  router.replace("/auth");
}
</script>

<template>
  <div v-if="home" class="bg-navy px-4 py-6">
    <div class="mx-auto flex max-w-6xl items-center justify-between gap-3">
      <div class="flex min-w-0 items-center gap-3">
        <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-white">
          <svg viewBox="0 0 24 24" class="h-6 w-6 text-navy" fill="none" stroke="currentColor" stroke-width="2.8">
            <path d="M12 4a8 8 0 1 1-5.657 2.343" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </div>
        <h1 class="truncate text-xl font-bold text-white">{{ title }}</h1>
      </div>

      <div class="flex items-center gap-2">
        <template v-if="authStore.isLoggedIn">
          <span class="rounded-full px-2 py-1 text-xs font-medium" :class="statusClass">
            {{ authStore.statusText }}
          </span>
          <button type="button" class="text-xs text-white/80 transition-colors hover:text-white" @click="handleLogout">退出</button>
        </template>
        <button
          v-else-if="showLogin"
          type="button"
          class="inline-flex h-9 items-center justify-center rounded-md border border-white/80 px-4 text-sm font-medium text-white transition hover:bg-white/10"
          @click="goLogin"
        >
          登录
        </button>
      </div>
    </div>
  </div>

  <div v-else class="bg-navy py-3">
    <div class="mx-auto flex h-full max-w-4xl items-center justify-between gap-3 px-4">
      <div class="flex min-w-0 items-center gap-3">
        <button v-if="backTo" type="button" class="text-white" aria-label="返回上一页" @click="goBack">
          <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2.4">
            <path d="M15 18l-6-6 6-6" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        <span class="truncate text-base font-medium text-white">{{ title }}</span>
      </div>

      <div class="flex shrink-0 items-center gap-2">
        <div v-if="timer" class="font-mono text-sm font-bold tracking-wide text-blue-300">
          {{ timer }}
        </div>

        <template v-if="authStore.isLoggedIn">
          <span class="rounded-full px-2 py-1 text-[11px] font-medium" :class="statusClass">
            {{ authStore.statusText }}
          </span>
          <button type="button" class="text-[11px] text-white/80 transition-colors hover:text-white" @click="handleLogout">退出</button>
        </template>
      </div>
    </div>
  </div>
</template>

