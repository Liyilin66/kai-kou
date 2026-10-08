<script setup>
defineProps({
  name: {
    type: String,
    required: true
  }
});
</script>

<template>
  <svg class="agent-icon-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <g v-if="name === 'home'">
      <path d="M3.5 11.2 12 4l8.5 7.2" />
      <path d="M5.5 10.5v8.8h5.1v-5.2h2.8v5.2h5.1v-8.8" />
    </g>
    <g v-else-if="name === 'list'">
      <rect x="5" y="4.8" width="14" height="14.4" rx="2.2" />
      <path d="M8.2 9h7.6M8.2 12h7.6M8.2 15h5.2" />
    </g>
    <g v-else-if="name === 'spark'">
      <path d="M12 3.8 13.8 9 19 10.8 13.8 12.6 12 17.8 10.2 12.6 5 10.8 10.2 9 12 3.8Z" />
      <path d="M18 15.8 18.7 18 21 18.8 18.7 19.6 18 21.8 17.3 19.6 15 18.8 17.3 18 18 15.8Z" />
    </g>
    <g v-else-if="name === 'tutor'">
      <rect x="4.8" y="5.2" width="14.4" height="12.8" rx="4.2" />
      <path d="M8.4 13.4c1-1.15 2.2-1.72 3.6-1.72s2.6.57 3.6 1.72" />
      <path d="M8.8 9.2h.01M15.2 9.2h.01" />
      <path d="M12 2.8v2.4M12 18v3.2M8.3 21.2h7.4" />
    </g>
    <g v-else-if="name === 'loader'">
      <path d="M12 4.5a7.5 7.5 0 1 1-6.5 3.75" />
      <path d="M5.2 4.8v3.8h3.8" />
    </g>
    <g v-else-if="name === 'lock'">
      <rect x="5.5" y="10.2" width="13" height="9" rx="2.4" />
      <path d="M8.2 10.2V8.1a3.8 3.8 0 0 1 7.6 0v2.1M12 14v2.2" />
    </g>
    <g v-else-if="name === 'shield'">
      <path d="M12 3.8 18.4 6v5.2c0 4.2-2.5 7.3-6.4 9-3.9-1.7-6.4-4.8-6.4-9V6Z" />
      <path d="m8.9 12 2.1 2.1 4.2-4.4" />
    </g>
    <g v-else-if="name === 'alert'">
      <path d="M12 4.8 20 18.7H4Z" />
      <path d="M12 9.2v4.2M12 16.3h.01" />
    </g>
    <g v-else-if="name === 'check'">
      <path d="M4.8 12.4 9.6 17 19.2 7" />
    </g>
    <g v-else-if="name === 'square'">
      <rect x="5.5" y="5.5" width="13" height="13" rx="3" />
      <path d="M9 9h6M9 12h5M9 15h3" />
    </g>
    <g v-else-if="name === 'report'">
      <path d="M6 4.5h8.4L18 8.1v11.4H6z" />
      <path d="M14.2 4.8v3.6h3.6M9 16V12M12 16V9.8M15 16v-2.6" />
    </g>
    <g v-else-if="name === 'box'">
      <path d="M4.8 8.1 12 4.4l7.2 3.7v7.8L12 19.6l-7.2-3.7Z" />
      <path d="M4.9 8.2 12 12l7.1-3.8M12 12v7.5" />
    </g>
    <g v-else-if="name === 'circle'">
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.8 19.2c1-3.1 3.1-4.7 6.2-4.7s5.2 1.6 6.2 4.7" />
    </g>
    <g v-else-if="name === 'search'">
      <circle cx="10.8" cy="10.8" r="5.7" />
      <path d="m15.3 15.3 4.2 4.2" />
    </g>
    <g v-else-if="name === 'trend'">
      <path d="M4.5 17.5h15" />
      <path d="M6 15.5 10.4 11l3.2 3.1L19 8.4" />
      <path d="M15.6 8.2H19v3.4" />
    </g>
    <g v-else-if="name === 'calendar'">
      <rect x="4.8" y="5.8" width="14.4" height="13" rx="2.6" />
      <path d="M8.2 4.2v3.1M15.8 4.2v3.1M5 10h14M8.2 13.4h3M13.4 13.4h2.4" />
    </g>
    <g v-else-if="name === 'question'">
      <circle cx="12" cy="12" r="8" />
      <path d="M9.8 9.7a2.4 2.4 0 0 1 4.6 1c0 1.8-1.9 2.2-2.4 3.5M12 17.2h.01" />
    </g>
    <g v-else-if="name === 'clock'">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.8v4.6l3 1.8" />
    </g>
    <g v-else-if="name === 'heart'">
      <path d="M12 20s-7.2-4.3-7.2-10A4 4 0 0 1 12 7.4 4 4 0 0 1 19.2 10C19.2 15.7 12 20 12 20Z" />
    </g>
    <g v-else-if="name === 'plan'">
      <path d="M7.8 4.5h8.4a2 2 0 0 1 2 2v13h-12.4v-13a2 2 0 0 1 2-2Z" />
      <path d="M9 8.5h6M9 12h6M9 15.5h3.8" />
      <path d="M7.2 19.5h10.6" />
    </g>
    <g v-else-if="name === 'chat'">
      <path d="M5.2 6.8a3 3 0 0 1 3-3h7.6a3 3 0 0 1 3 3v5.4a3 3 0 0 1-3 3h-4.7l-4.8 4.1v-4.1H8.2a3 3 0 0 1-3-3Z" />
      <path d="M8.8 8.7h6.4M8.8 12h3.7" />
    </g>
    <g v-else-if="name === 'send'">
      <path d="M4.8 12.2 19.5 5 15 19.2l-3.3-5.4Z" />
      <path d="m11.7 13.8 7.2-8.2" />
    </g>
    <g v-else-if="name === 'chevron-right'">
      <path d="m9 6 6 6-6 6" />
    </g>
    <g v-else-if="name === 'chevron-down'">
      <path d="m6 9 6 6 6-6" />
    </g>
  </svg>
</template>

<style scoped>
.agent-icon-svg {
  display: block;
  width: 1em;
  height: 1em;
  overflow: visible;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.9;
}
</style>
