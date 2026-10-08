<script setup>
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import ToastMessage from "@/components/ToastMessage.vue";
import { useAuthStore } from "@/stores/auth";

const authStore = useAuthStore();
const router = useRouter();

onMounted(async () => {
  await authStore.init();

  if (authStore.isLoggedIn && !authStore.loaded) {
    await authStore.loadStatus();
  }

  if (!authStore.isLoggedIn && router.currentRoute.value.meta?.requiresAuth) {
    router.replace("/auth");
  }
});
</script>

<template>
  <RouterView />
  <ToastMessage />
</template>
