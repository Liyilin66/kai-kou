<script setup>
import "@/styles/speaking-practice.css";

const props = defineProps({
  backLabel: { type: String, default: "" },
  backIcon: { type: Boolean, default: true },
  title: { type: String, default: "" },
  steps: {
    type: Array,
    default: () => [
      { label: "准备阅读" },
      { label: "开始录音" },
      { label: "提交评测" },
      { label: "查看结果" }
    ]
  },
  currentStep: { type: Number, default: 0 },
  questionInfo: { type: String, default: "" },
  dataTestid: { type: String, default: "" },
  stepperTestid: { type: String, default: "" },
  memberLabel: { type: String, default: "VIP · 无限练习" },
  exitLabel: { type: String, default: "退出" }
});

const emit = defineEmits(["back", "exit"]);

function getStepLabel(step) {
  return typeof step === "string" ? step : step?.label || "";
}

function stepClass(index) {
  if (index < props.currentStep) return "done";
  if (index === props.currentStep) return "act";
  return "wait";
}
</script>

<template>
  <div class="speaking-practice-shell ra-practice-shell" :data-testid="dataTestid || undefined">
    <slot name="topbar">
      <header class="ra-topbar">
        <button class="tb-back" type="button" @click="emit('back')">
          <span v-if="backIcon" class="tb-arr">‹</span>
          <span>{{ backLabel }}</span>
        </button>
        <div class="tb-title">{{ title }}</div>
        <div class="tb-right">
          <div class="vip-pill"><span class="vip-dot"></span>{{ memberLabel }}</div>
          <button class="exit-btn" type="button" @click="emit('exit')">{{ exitLabel }}</button>
        </div>
      </header>
    </slot>

    <section class="step-bar" :data-testid="stepperTestid || undefined">
      <div v-for="(step, i) in steps" :key="getStepLabel(step) || i" class="step-wrap">
        <div class="step-item">
          <div class="step-num" :class="stepClass(i)">
            <span v-if="currentStep > i">✓</span>
            <span v-else>{{ i + 1 }}</span>
          </div>
          <span class="step-label" :class="stepClass(i)">{{ getStepLabel(step) }}</span>
        </div>
        <div v-if="i < steps.length - 1" class="step-sep"></div>
      </div>
      <div v-if="questionInfo" class="step-q-info">{{ questionInfo }}</div>
    </section>

    <slot />
  </div>
</template>
