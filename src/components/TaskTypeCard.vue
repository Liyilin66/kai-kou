<script setup>
defineProps({
  label: {
    type: String,
    required: true
  },
  active: {
    type: Boolean,
    default: false
  }
});
</script>

<template>
  <button
    type="button"
    class="flex h-12 w-full items-center justify-center rounded-lg border px-3 text-base font-medium transition"
    :class="
      active
        ? 'border-navy bg-navy text-white'
        : 'border-[#D1D5DB] bg-white text-[#6B7280] hover:bg-[#F8FAFC]'
    "
  >
    {{ label }}
  </button>
</template>
