<script setup>
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import NavBar from "@/components/NavBar.vue";
import {
  BILLING_PAUSED,
  BILLING_PAUSED_MESSAGE,
  BILLING_PLANS,
  createBillingOrder,
  getBillingErrorMessage,
  normalizeBillingPlan,
  writeBillingOrderNo
} from "@/lib/billing";

const route = useRoute();
const router = useRouter();

const selectedPlanKey = ref("month");
const submitting = ref(false);
const submitError = ref("");

const selectedPlan = computed(() => {
  return BILLING_PLANS.find((plan) => plan.key === selectedPlanKey.value) || BILLING_PLANS[1];
});

const payButtonText = computed(() => {
  if (BILLING_PAUSED) return "支付功能暂停中";
  if (submitting.value) return "正在跳转支付宝...";
  return `立即支付 ${selectedPlan.value.name} · ¥${selectedPlan.value.price}`;
});

watch(
  () => route.query.plan,
  (plan) => {
    const normalizedPlan = normalizeBillingPlan(plan);
    if (BILLING_PLANS.some((item) => item.key === normalizedPlan)) {
      selectedPlanKey.value = normalizedPlan;
    }
  },
  {
    immediate: true
  }
);

function selectPlan(planKey) {
  if (submitting.value) return;
  selectedPlanKey.value = planKey;
  submitError.value = "";
}

async function handlePay() {
  if (BILLING_PAUSED) {
    submitError.value = BILLING_PAUSED_MESSAGE;
    return;
  }
  if (submitting.value) return;

  submitting.value = true;
  submitError.value = "";

  try {
    const result = await createBillingOrder(selectedPlanKey.value);
    const orderNo = `${result?.orderNo || ""}`.trim();
    const payUrl = `${result?.payUrl || ""}`.trim();

    if (!orderNo || !payUrl) {
      throw new Error("支付链接创建失败，请稍后重试");
    }

    writeBillingOrderNo(orderNo);
    window.location.assign(payUrl);
  } catch (error) {
    submitting.value = false;
    submitError.value = getBillingErrorMessage(error, "创建订单失败，请稍后重试");
  }
}
</script>

<template>
  <div class="min-h-screen bg-bg">
    <NavBar title="开通 VIP" back-to="/profile" />

    <div class="mx-auto max-w-2xl px-4 py-6">
      <section class="rounded-2xl border border-[#E7EDF5] bg-white p-6 shadow-card">
        <div class="text-center">
          <h1 class="text-2xl font-bold text-navy">选择会员套餐</h1>
          <p class="mt-2 text-sm leading-6 text-muted">
            支付完成后会自动返回结果页确认状态，会员权益以服务端订单结果为准。
          </p>
        </div>

        <p
          v-if="BILLING_PAUSED"
          class="mt-4 rounded-xl border border-[#F2D6D3] bg-[#FFF7F6] px-4 py-3 text-sm text-[#B42318]"
        >
          {{ BILLING_PAUSED_MESSAGE }}
        </p>

        <div class="mt-6 grid gap-3 md:grid-cols-3">
          <button
            v-for="plan in BILLING_PLANS"
            :key="plan.key"
            type="button"
            class="rounded-2xl border p-4 text-left transition-all disabled:cursor-not-allowed"
            :class="selectedPlanKey === plan.key ? 'border-orange bg-[#FFF7F2] shadow-sm' : 'border-[#E7EDF5] bg-white hover:border-[#C7D4E5]'"
            :disabled="submitting || BILLING_PAUSED"
            @click="selectPlan(plan.key)"
          >
            <div class="flex items-center justify-between gap-3">
              <div class="text-lg font-semibold text-navy">{{ plan.name }}</div>
              <span
                v-if="plan.key === 'month'"
                class="rounded-full bg-orange/10 px-2 py-1 text-xs font-medium text-orange"
              >
                推荐
              </span>
            </div>
            <div class="mt-3 text-2xl font-bold text-text">¥{{ plan.price }}</div>
            <div class="mt-1 text-sm text-muted">{{ plan.unit }}</div>
            <div class="mt-4 text-xs text-muted">{{ plan.hint }}</div>
          </button>
        </div>

        <div class="mt-6 rounded-xl bg-[#F8FAFD] p-4">
          <div class="flex items-center justify-between gap-4">
            <span class="text-sm text-muted">当前选择</span>
            <span class="text-sm font-medium text-text">{{ selectedPlan.name }} · ¥{{ selectedPlan.price }}</span>
          </div>
          <p class="mt-2 text-xs leading-5 text-muted">
            将通过支付宝手机网站支付发起购买，请勿重复点击，避免生成重复订单。
          </p>
        </div>

        <p v-if="submitError" class="mt-4 rounded-xl border border-[#F2D6D3] bg-[#FFF7F6] px-4 py-3 text-sm text-[#B42318]">
          {{ submitError }}
        </p>

        <div class="mt-6 space-y-3">
          <button
            type="button"
            class="w-full rounded-xl bg-orange py-4 text-base font-bold text-white shadow-md transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
            :disabled="submitting || BILLING_PAUSED"
            @click="handlePay"
          >
            {{ payButtonText }}
          </button>
          <button
            type="button"
            class="w-full rounded-xl border border-gray-200 py-3 text-sm text-muted transition-all hover:border-navy hover:text-navy disabled:cursor-not-allowed disabled:opacity-70"
            :disabled="submitting"
            @click="router.push('/profile')"
          >
            返回个人中心
          </button>
        </div>
      </section>
    </div>
  </div>
</template>
