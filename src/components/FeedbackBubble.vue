<script setup>
import { computed } from "vue";

const props = defineProps({
  title: {
    type: String,
    required: true
  },
  body: {
    type: String,
    default: ""
  },
  tone: {
    type: String,
    default: "navy"
  },
  containerClass: {
    type: String,
    default: "p-6"
  },
  titleClass: {
    type: String,
    default: "text-xl font-medium"
  },
  bodyClass: {
    type: String,
    default: "text-lg"
  },
  centered: {
    type: Boolean,
    default: false
  }
});

const toneClass = computed(() => {
  if (props.tone === "green") return "bg-[#2F855A] text-white";
  if (props.tone === "dark") return "bg-[#1E2A44] text-white";
  return "bg-navy text-white";
});
</script>

<template>
  <section class="rounded-xl border border-transparent shadow-card" :class="[toneClass, containerClass, centered ? 'text-center' : '']">
    <h2 :class="titleClass">
      {{ title }}
    </h2>
    <p v-if="body" class="mt-2" :class="bodyClass">{{ body }}</p>
  </section>
</template>
