<script setup>
import { computed } from "vue";
import { RouterLink } from "vue-router";

const props = defineProps({
  to: {
    type: String,
    default: ""
  },
  type: {
    type: String,
    default: "button"
  },
  disabled: {
    type: Boolean,
    default: false
  },
  tone: {
    type: String,
    default: "solid"
  },
  full: {
    type: Boolean,
    default: false
  }
});

const componentType = computed(() => (props.to ? RouterLink : "button"));

const toneClass = computed(() => {
  // "action" follows docs/ui-guidelines.md (primary button); other tones are the legacy look.
  if (props.tone === "action") return "rounded-full bg-kk-action font-bold text-kk-on-action hover:bg-kk-action-hover active:bg-kk-action-press disabled:opacity-45";
  if (props.tone === "secondary") return "rounded-full border border-kk-line bg-kk-surface font-semibold text-kk-ink hover:bg-kk-surface-2 disabled:opacity-45";
  if (props.tone === "soft") return "bg-[#EDBBA5] text-white hover:bg-[#e3ab92]";
  if (props.tone === "outline") return "border-2 border-[#D1D5DB] bg-white text-[#1A1A2E] hover:bg-[#F8FAFC]";
  return "bg-orange text-white hover:bg-[#D7744A]";
});
</script>

<template>
  <component
    :is="componentType"
    :to="to || undefined"
    :type="to ? undefined : type"
    :disabled="to ? undefined : disabled"
    class="inline-flex h-12 items-center justify-center rounded-lg px-8 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60"
    :class="[toneClass, full ? 'w-full' : '']"
  >
    <slot />
  </component>
</template>
