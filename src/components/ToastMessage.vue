<script setup>
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useUIStore } from "@/stores/ui";

const uiStore = useUIStore();
const { toast } = storeToRefs(uiStore);

const toneClass = computed(() => {
  if (!toast.value) return "";
  if (toast.value.type === "warning") return "bg-amber-500 text-white";
  if (toast.value.type === "info") return "bg-slate-700 text-white";
  return "bg-emerald-600 text-white";
});
</script>

<template>
  <transition
    enter-active-class="transition duration-300 ease-out"
    enter-from-class="translate-y-3 opacity-0"
    enter-to-class="translate-y-0 opacity-100"
    leave-active-class="transition duration-200 ease-in"
    leave-from-class="translate-y-0 opacity-100"
    leave-to-class="translate-y-2 opacity-0"
  >
    <div
      v-if="toast"
      class="pointer-events-none fixed left-1/2 top-6 z-50 w-[92%] max-w-md -translate-x-1/2 rounded-xl px-4 py-3 text-sm font-medium shadow-lg"
      :class="toneClass"
    >
      {{ toast.message }}
    </div>
  </transition>
</template>
