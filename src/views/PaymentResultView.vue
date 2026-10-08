<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import NavBar from "@/components/NavBar.vue";
import {
  BILLING_PAUSED,
  BILLING_PAUSED_MESSAGE,
  BILLING_MAX_POLL_ATTEMPTS,
  BILLING_POLL_INTERVAL_MS,
  clearBillingOrderNo,
  fetchBillingOrderStatus,
  getBillingErrorMessage,
  getBillingOrderNoFromRoute,
  getBillingPlan,
  normalizeBillingStatus,
  readBillingOrderNo,
  writeBillingOrderNo
} from "@/lib/billing";
import { useAuthStore } from "@/stores/auth";

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const viewState = ref("processing");
const orderNo = ref("");
const orderData = ref(null);
const statusMessage = ref("正在确认支付结果...");
const polling = ref(false);
const refreshedAfterSuccess = ref(false);

let pollTimer = null;

const resultMeta = computed(() => {
  if (viewState.value === "success") {
    return {
      emoji: "✓",
      title: "VIP 已开通"
    };
  }

  if (viewState.value === "pending") {
    return {
      emoji: "…",
      title: "支付尚未确认"
    };
  }

  if (viewState.value === "closed_or_cancelled") {
    return {
      emoji: "×",
      title: "订单已关闭或未完成支付"
    };
  }

  return {
    emoji: "•",
    title: "正在确认支付结果"
  };
});

const planInfo = computed(() => getBillingPlan(orderData.value?.vip?.vipPlan || orderData.value?.plan));
const planSummary = computed(() => {
  const label = planInfo.value?.name || "";
  const amount = formatAmount(orderData.value?.amount) || (planInfo.value ? `¥${planInfo.value.price}` : "");
  return [label, amount].filter(Boolean).join(" · ");
});
const paidAtText = computed(() => formatDateTime(orderData.value?.paidAt));
const vipSummary = computed(() => {
  const vipPlan = orderData.value?.vip?.vipPlan;
  const vipExpiresAt = orderData.value?.vip?.vipExpiresAt;

  if (vipPlan === "lifetime") {
    return "永久会员已生效";
  }

  const formattedExpiresAt = formatDateTime(vipExpiresAt);
  return formattedExpiresAt ? `有效期至 ${formattedExpiresAt}` : "";
});

function clearPollTimer() {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

function scheduleNextPoll(attempt) {
  clearPollTimer();
  pollTimer = setTimeout(() => {
    void pollStatus(attempt);
  }, BILLING_POLL_INTERVAL_MS);
}

function resolveUpgradeQuery() {
  const plan = orderData.value?.plan || orderData.value?.vip?.vipPlan;
  return plan ? { plan } : undefined;
}

async function pollStatus(attempt = 0) {
  if (!orderNo.value || polling.value) return;

  polling.value = true;
  try {
    const data = await fetchBillingOrderStatus(orderNo.value, { sync: true });
    orderData.value = data;

    const normalizedStatus = normalizeBillingStatus(data?.status);
    const entitlementGranted = Boolean(data?.entitlementGranted);

    if (normalizedStatus === "paid" && entitlementGranted) {
      viewState.value = "success";
      statusMessage.value = "支付成功，会员权益已到账。";
      clearBillingOrderNo();

      if (!refreshedAfterSuccess.value) {
        refreshedAfterSuccess.value = true;
        await authStore.loadStatus();
      }
      return;
    }

    if (normalizedStatus === "closed_or_cancelled") {
      viewState.value = "closed_or_cancelled";
      statusMessage.value = "订单已关闭或支付未完成。";
      clearBillingOrderNo();
      return;
    }

    if (data?.shouldPoll !== false && attempt < BILLING_MAX_POLL_ATTEMPTS) {
      viewState.value = "processing";
      statusMessage.value = "正在确认支付结果...";
      scheduleNextPoll(attempt + 1);
      return;
    }

    viewState.value = "pending";
    statusMessage.value = "支付尚未确认，你可以稍后刷新状态。";
  } catch (error) {
    viewState.value = "pending";
    statusMessage.value = getBillingErrorMessage(error, "查询支付结果失败，请稍后重试。");
  } finally {
    polling.value = false;
  }
}

async function refreshStatus() {
  if (BILLING_PAUSED) {
    viewState.value = "pending";
    statusMessage.value = BILLING_PAUSED_MESSAGE;
    return;
  }
  clearPollTimer();
  viewState.value = "processing";
  statusMessage.value = "正在确认支付结果...";
  await pollStatus(0);
}

async function initializeResultView() {
  clearPollTimer();
  orderData.value = null;
  refreshedAfterSuccess.value = false;

  const routeOrderNo = getBillingOrderNoFromRoute(route.query);
  if (routeOrderNo) {
    writeBillingOrderNo(routeOrderNo);
  }

  orderNo.value = routeOrderNo || readBillingOrderNo();
  if (BILLING_PAUSED) {
    clearBillingOrderNo();
    viewState.value = "pending";
    statusMessage.value = BILLING_PAUSED_MESSAGE;
    return;
  }
  if (!orderNo.value) {
    viewState.value = "pending";
    statusMessage.value = "未找到订单信息，请返回升级页重新发起支付。";
    return;
  }

  viewState.value = "processing";
  statusMessage.value = "正在确认支付结果...";
  await pollStatus(0);
}

function goToUpgrade() {
  router.push({
    path: "/upgrade",
    query: resolveUpgradeQuery()
  });
}

function formatDateTime(value) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "";

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(parsed);
}

function formatAmount(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "";
  return `¥${number.toFixed(2)}`;
}

onMounted(() => {
  void initializeResultView();
});

watch(
  () => route.fullPath,
  () => {
    void initializeResultView();
  }
);

onUnmounted(() => {
  clearPollTimer();
});
</script>

<template>
  <div class="min-h-screen bg-bg">
    <NavBar title="支付结果" back-to="/profile" />

    <div class="mx-auto max-w-2xl px-4 py-6">
      <section class="rounded-2xl border border-[#E7EDF5] bg-white p-6 shadow-card">
        <div class="text-center">
          <div
            class="mx-auto flex h-16 w-16 items-center justify-center rounded-full text-3xl"
            :class="viewState === 'success' ? 'bg-green-100 text-green-600' : viewState === 'closed_or_cancelled' ? 'bg-red-100 text-red-500' : 'bg-orange/10 text-orange'"
          >
            <span v-if="viewState === 'processing'" class="billing-spinner" />
            <span v-else>{{ resultMeta.emoji }}</span>
          </div>
          <h1 class="mt-5 text-2xl font-bold text-navy">{{ resultMeta.title }}</h1>
          <p class="mt-2 text-sm leading-6 text-muted">{{ statusMessage }}</p>
        </div>

        <div class="mt-6 rounded-xl bg-[#F8FAFD] p-4">
          <div class="flex items-center justify-between gap-4 border-b border-[#E7EDF5] pb-3">
            <span class="text-sm text-muted">订单号</span>
            <span class="text-sm font-medium text-text">{{ orderNo || "--" }}</span>
          </div>
          <div v-if="planSummary" class="flex items-center justify-between gap-4 border-b border-[#E7EDF5] py-3">
            <span class="text-sm text-muted">套餐</span>
            <span class="text-sm font-medium text-text">{{ planSummary }}</span>
          </div>
          <div v-if="paidAtText" class="flex items-center justify-between gap-4 border-b border-[#E7EDF5] py-3">
            <span class="text-sm text-muted">支付时间</span>
            <span class="text-sm font-medium text-text">{{ paidAtText }}</span>
          </div>
          <div v-if="vipSummary" class="flex items-center justify-between gap-4 pt-3">
            <span class="text-sm text-muted">会员状态</span>
            <span class="text-sm font-medium text-text">{{ vipSummary }}</span>
          </div>
        </div>

        <div v-if="viewState === 'success'" class="mt-6 space-y-3">
          <button
            type="button"
            class="w-full rounded-xl bg-orange py-4 text-base font-bold text-white shadow-md transition-opacity hover:opacity-90"
            @click="router.push('/home')"
          >
            开始练习
          </button>
          <button
            type="button"
            class="w-full rounded-xl border border-gray-200 py-3 text-sm text-muted transition-all hover:border-navy hover:text-navy"
            @click="router.push('/profile')"
          >
            返回个人中心
          </button>
        </div>

        <div v-else-if="viewState === 'processing'" class="mt-6 space-y-3">
          <button
            type="button"
            class="w-full cursor-wait rounded-xl bg-orange/80 py-4 text-base font-bold text-white"
            disabled
          >
            正在确认...
          </button>
          <button
            type="button"
            class="w-full rounded-xl border border-gray-200 py-3 text-sm text-muted transition-all hover:border-navy hover:text-navy"
            @click="router.push('/profile')"
          >
            返回个人中心
          </button>
        </div>

        <div v-else-if="viewState === 'pending'" class="mt-6 space-y-3">
          <button
            type="button"
            class="w-full rounded-xl bg-orange py-4 text-base font-bold text-white shadow-md transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
            :disabled="polling"
            @click="refreshStatus"
          >
            {{ polling ? "刷新中..." : "刷新状态" }}
          </button>
          <button
            type="button"
            class="w-full rounded-xl border border-gray-200 py-3 text-sm text-muted transition-all hover:border-navy hover:text-navy"
            @click="goToUpgrade"
          >
            返回升级页
          </button>
        </div>

        <div v-else class="mt-6 space-y-3">
          <button
            type="button"
            class="w-full rounded-xl bg-orange py-4 text-base font-bold text-white shadow-md transition-opacity hover:opacity-90"
            @click="goToUpgrade"
          >
            重新购买
          </button>
          <button
            type="button"
            class="w-full rounded-xl border border-gray-200 py-3 text-sm text-muted transition-all hover:border-navy hover:text-navy"
            @click="router.push('/profile')"
          >
            返回个人中心
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.billing-spinner {
  width: 28px;
  height: 28px;
  border-radius: 9999px;
  border: 3px solid rgba(232, 132, 90, 0.18);
  border-top-color: #e8845a;
  animation: billing-spin 1s linear infinite;
}

@keyframes billing-spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}
</style>
