<script setup>
defineProps({
  task: {
    type: Object,
    required: true
  }
});
</script>

<template>
  <RouterLink
    :to="task.to"
    class="group flex flex-col gap-6 overflow-hidden rounded-xl border bg-card text-card-foreground shadow-card transition-all duration-300 hover:shadow-md"
  >
    <div class="flex items-center gap-4 p-4">
      <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white" :class="task.iconBg">
        <svg v-if="task.icon === 'ra'" viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2.1">
          <path d="M12 1v11" />
          <path d="M8 6v5a4 4 0 0 0 8 0V6" />
          <path d="M5 11a7 7 0 0 0 14 0" />
          <path d="M12 18v5" />
        </svg>
        <svg v-else-if="task.icon === 'rs'" viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M5 6h14v9H9l-4 4z" />
        </svg>
        <svg v-else-if="task.icon === 'rl'" viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M6 9a6 6 0 0 1 6-6v12a6 6 0 0 1-6-6z" />
          <path d="M13 8a4 4 0 0 1 0 8" />
          <path d="M17 6a7 7 0 0 1 0 12" />
        </svg>
        <svg v-else-if="task.icon === 'we'" viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M7 3h8l4 4v14H7z" />
          <path d="M15 3v5h5" />
          <path d="M10 12h6M10 16h6" />
        </svg>
        <svg v-else-if="task.icon === 'rts'" viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M5 5h14v9H9l-4 4z" />
          <path d="M12 9h4" />
          <path d="M8 12h8" />
        </svg>
        <svg v-else viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M4 13v-2a8 8 0 1 1 16 0v2" />
          <path d="M4 13v4a2 2 0 0 0 2 2h2v-6H6a2 2 0 0 0-2 2z" />
          <path d="M20 13v4a2 2 0 0 1-2 2h-2v-6h2a2 2 0 0 1 2 2z" />
        </svg>
      </div>

      <div class="min-w-0 flex-1">
        <h3 class="text-base font-bold text-[#1A1A2E]">{{ task.title }}</h3>
        <p class="text-sm font-medium text-orange">{{ task.subtitle }}</p>
        <p class="mt-1 text-sm text-[#6B7280]">{{ task.description }}</p>

        <div class="mt-3 flex justify-end">
          <span class="flex items-center gap-1 text-sm font-medium text-orange transition-all group-hover:gap-2">
            开始练习
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2.4">
              <path d="M5 12h14" />
              <path d="m13 6 6 6-6 6" />
            </svg>
          </span>
        </div>
      </div>
    </div>
  </RouterLink>
</template>
