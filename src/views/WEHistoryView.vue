<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import NavBar from "@/components/NavBar.vue";
import OrangeButton from "@/components/OrangeButton.vue";
import { fetchWEHistory, filterWEHistory, summarizeWEHistory } from "@/lib/we-history";

const route = useRoute();
const router = useRouter();

const STATUS_OPTIONS = [
  { id: "all", label: "全部" },
  { id: "scored", label: "AI评阅完成" },
  { id: "rule_gated", label: "规则判定" },
  { id: "ai_review_degraded", label: "AI评阅降级" }
];

const TRAIT_LABELS = {
  content: "内容",
  form: "格式",
  development_structure_coherence: "结构连贯",
  grammar: "语法",
  general_linguistic_range: "语言范围",
  vocabulary_range: "词汇范围",
  spelling: "拼写"
};

const loading = ref(false);
const loadError = ref("");
const allRecords = ref([]);
const statusFilter = ref(`${route.query?.status || "all"}`.trim() || "all");
const keyword = ref(`${route.query?.q || ""}`.trim());
const questionFilter = ref(`${route.query?.question || ""}`.trim());
const expandedIds = ref([]);

const filteredRecords = computed(() =>
  filterWEHistory(allRecords.value, {
    status: statusFilter.value,
    keyword: keyword.value,
    questionId: questionFilter.value
  })
);

const summary = computed(() => summarizeWEHistory(filteredRecords.value));

const statusCounts = computed(() => {
  const counts = {
    all: allRecords.value.length,
    scored: 0,
    rule_gated: 0,
    ai_review_degraded: 0
  };

  allRecords.value.forEach((item) => {
    const key = `${item?.status || ""}`.trim();
    if (key in counts) counts[key] += 1;
  });

  return counts;
});

const hasFilters = computed(() => {
  return statusFilter.value !== "all" || Boolean(keyword.value.trim()) || Boolean(questionFilter.value.trim());
});

function formatDateTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return date.toLocaleString();
}

function formatLatestTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function scoreLabel(record) {
  if (record.status === "scored") return `${record.overallEstimated}/90`;
  if (record.status === "ai_review_degraded") return "降级";
  return "未评分";
}

function toggleExpand(recordId) {
  const id = `${recordId || ""}`.trim();
  if (!id) return;
  const exists = expandedIds.value.includes(id);
  expandedIds.value = exists
    ? expandedIds.value.filter((item) => item !== id)
    : [...expandedIds.value, id];
}

function isExpanded(recordId) {
  return expandedIds.value.includes(`${recordId || ""}`.trim());
}

function clearFilters() {
  statusFilter.value = "all";
  keyword.value = "";
  questionFilter.value = "";
}

function removeQuestionFilter() {
  questionFilter.value = "";
}

function goWriteEssay() {
  router.push("/we");
}

function traitLabel(key) {
  return TRAIT_LABELS[key] || key;
}

function syncQuery() {
  const query = {};
  if (statusFilter.value && statusFilter.value !== "all") query.status = statusFilter.value;
  const normalizedKeyword = keyword.value.trim();
  if (normalizedKeyword) query.q = normalizedKeyword;
  const normalizedQuestion = questionFilter.value.trim();
  if (normalizedQuestion) query.question = normalizedQuestion;
  router.replace({ path: route.path, query });
}

async function loadHistory() {
  loading.value = true;
  loadError.value = "";
  try {
    const rows = await fetchWEHistory({ limit: 120 });
    allRecords.value = rows;
  } catch (error) {
    console.warn("WE history page load failed:", error);
    allRecords.value = [];
    loadError.value = "历史提交加载失败，请稍后重试。";
  } finally {
    loading.value = false;
  }
}

watch([statusFilter, keyword, questionFilter], () => {
  syncQuery();
});

onMounted(async () => {
  await loadHistory();
});
</script>

<template>
  <div class="min-h-screen bg-bg">
    <NavBar title="WE 历史提交" back-to="/we" />

    <main class="mx-auto max-w-5xl px-4 py-4">
      <section class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p class="text-sm font-semibold text-navy">历史提交与 AI 评阅</p>
          <p class="text-xs text-muted">按时间倒序 · 支持筛选与关键词检索</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <OrangeButton tone="outline" @click="loadHistory">刷新</OrangeButton>
          <OrangeButton tone="outline" @click="goWriteEssay">继续写作</OrangeButton>
        </div>
      </section>

      <section class="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        <article class="rounded-lg border bg-white p-3 shadow-sm">
          <p class="text-[11px] text-muted">当前结果数</p>
          <p class="mt-1 text-xl font-bold text-navy">{{ summary.total }}</p>
        </article>
        <article class="rounded-lg border bg-white p-3 shadow-sm">
          <p class="text-[11px] text-muted">AI评阅次数</p>
          <p class="mt-1 text-xl font-bold text-navy">{{ summary.scoredCount }}</p>
        </article>
        <article class="rounded-lg border bg-white p-3 shadow-sm">
          <p class="text-[11px] text-muted">平均估分</p>
          <p class="mt-1 text-xl font-bold text-navy">{{ summary.avgScore.toFixed(1) }}</p>
        </article>
        <article class="rounded-lg border bg-white p-3 shadow-sm">
          <p class="text-[11px] text-muted">最近提交</p>
          <p class="mt-1 text-sm font-semibold text-navy">{{ formatLatestTime(summary.latestAt) }}</p>
        </article>
      </section>

      <section class="mb-3 rounded-lg border bg-white p-3 shadow-sm">
        <div class="flex flex-wrap items-center gap-2">
          <button
            v-for="item in STATUS_OPTIONS"
            :key="item.id"
            type="button"
            class="rounded-full border px-3 py-1 text-xs font-semibold transition-colors"
            :class="statusFilter === item.id
              ? 'border-orange bg-orange/10 text-orange'
              : 'border-gray-200 text-muted hover:border-orange hover:text-orange'"
            @click="statusFilter = item.id"
          >
            {{ item.label }} ({{ statusCounts[item.id] || 0 }})
          </button>

          <input
            v-model="keyword"
            type="text"
            placeholder="搜索题号/点评/正文关键词"
            class="min-w-[220px] flex-1 rounded-md border border-gray-200 px-3 py-1.5 text-xs focus:border-orange focus:outline-none"
          />

          <button
            v-if="hasFilters"
            type="button"
            class="rounded-md border border-gray-200 px-2 py-1 text-xs text-muted hover:border-orange hover:text-orange"
            @click="clearFilters"
          >
            清空筛选
          </button>
        </div>

        <div v-if="questionFilter" class="mt-2 flex items-center gap-2 text-xs text-muted">
          <span class="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">题目：{{ questionFilter }}</span>
          <button type="button" class="text-orange hover:opacity-80" @click="removeQuestionFilter">移除</button>
        </div>
      </section>

      <section v-if="loading" class="rounded-lg border bg-white p-6 text-center shadow-sm">
        <p class="text-sm text-muted">历史记录加载中...</p>
      </section>

      <section v-else-if="loadError" class="rounded-lg border border-red-200 bg-red-50 p-4 shadow-sm">
        <p class="text-sm font-semibold text-red-600">{{ loadError }}</p>
      </section>

      <section v-else-if="!filteredRecords.length" class="rounded-lg border bg-white p-6 text-center shadow-sm">
        <p class="text-base font-semibold text-navy">暂无匹配的 WE 历史记录</p>
        <p class="mt-1 text-xs text-muted">你可以先提交一次作文，或调整筛选条件。</p>
      </section>

      <section v-else class="space-y-2">
        <article
          v-for="record in filteredRecords"
          :key="record.id"
          class="rounded-lg border border-[#E4EAF5] bg-white p-3 shadow-sm"
        >
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <p class="text-sm font-semibold text-navy">{{ record.questionId || 'WE-UNKNOWN' }}</p>
                <span class="rounded-full border px-2 py-0.5 text-[11px] font-semibold" :class="record.statusBadgeClass">
                  {{ record.statusLabel }}
                </span>
                <span class="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                  {{ record.summary.level }}
                </span>
              </div>
              <p class="mt-1 text-xs text-muted">提交：{{ formatDateTime(record.createdAt) }} · 评阅：{{ formatDateTime(record.reviewedAt) }}</p>
            </div>
            <div class="text-right">
              <p class="text-[11px] text-muted">估分</p>
              <p class="text-lg font-bold text-navy">{{ scoreLabel(record) }}</p>
            </div>
          </div>

          <p class="mt-2 text-sm leading-relaxed text-text line-clamp-2">{{ record.summary.finalComment || '暂无总评' }}</p>

          <div class="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
            <span class="rounded bg-[#F4F7FB] px-2 py-0.5">词数 {{ record.submittedWordCount }}</span>
            <span class="rounded bg-[#F4F7FB] px-2 py-0.5">Provider {{ record.providerUsed || 'none' }}</span>
            <span v-if="record.requestId" class="rounded bg-[#F4F7FB] px-2 py-0.5">Request {{ record.requestId }}</span>
            <button
              type="button"
              class="ml-auto rounded border border-gray-200 px-2 py-0.5 text-[11px] font-semibold text-muted hover:border-orange hover:text-orange"
              @click="toggleExpand(record.id)"
            >
              {{ isExpanded(record.id) ? '收起详情' : '展开详情' }}
            </button>
          </div>

          <div v-if="isExpanded(record.id)" class="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-5">
            <section class="space-y-2 lg:col-span-3">
              <article class="rounded-md border border-[#E6ECF8] bg-[#FAFCFF] p-2.5">
                <p class="text-xs font-semibold text-navy">优点</p>
                <ul v-if="record.summary.strengths.length" class="mt-1 list-disc space-y-1 pl-4 text-xs text-text">
                  <li v-for="(item, idx) in record.summary.strengths" :key="`s-${record.id}-${idx}`">{{ item }}</li>
                </ul>
                <p v-else class="mt-1 text-xs text-muted">暂无。</p>
              </article>

              <article class="rounded-md border border-[#E6ECF8] bg-[#FAFCFF] p-2.5">
                <p class="text-xs font-semibold text-navy">改进建议</p>
                <ul v-if="record.summary.improvements.length" class="mt-1 list-disc space-y-1 pl-4 text-xs text-text">
                  <li v-for="(item, idx) in record.summary.improvements" :key="`i-${record.id}-${idx}`">{{ item }}</li>
                </ul>
                <p v-else class="mt-1 text-xs text-muted">暂无。</p>
              </article>

              <article v-if="record.gateReasonMessagesZh.length" class="rounded-md border border-amber-200 bg-amber-50 p-2.5">
                <p class="text-xs font-semibold text-amber-700">规则提醒</p>
                <ul class="mt-1 list-disc space-y-1 pl-4 text-xs text-amber-700">
                  <li v-for="(item, idx) in record.gateReasonMessagesZh" :key="`g-${record.id}-${idx}`">{{ item }}</li>
                </ul>
              </article>
            </section>

            <section class="space-y-2 lg:col-span-2">
              <article class="rounded-md border border-[#E6ECF8] bg-[#FAFCFF] p-2.5">
                <p class="text-xs font-semibold text-navy">评分维度</p>
                <div v-if="record.traits.length" class="mt-1 space-y-1">
                  <div
                    v-for="trait in record.traits"
                    :key="`${record.id}-${trait.key}`"
                    class="flex items-center justify-between text-xs"
                  >
                    <span class="text-muted">{{ traitLabel(trait.key) }}</span>
                    <span class="font-semibold text-navy">{{ trait.score }}/{{ trait.max }}</span>
                  </div>
                </div>
                <p v-else class="mt-1 text-xs text-muted">该记录无维度分数。</p>
              </article>

              <article class="rounded-md border border-[#E6ECF8] bg-[#FAFCFF] p-2.5">
                <p class="text-xs font-semibold text-navy">总评</p>
                <p class="mt-1 text-xs leading-relaxed text-text">{{ record.feedback || '暂无总评。' }}</p>
              </article>
            </section>

            <section class="lg:col-span-5">
              <article class="rounded-md border border-[#E6ECF8] bg-[#FAFCFF] p-2.5">
                <p class="text-xs font-semibold text-navy">提交原文</p>
                <pre class="mt-1 max-h-56 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-text">{{ record.transcript || '无正文内容。' }}</pre>
              </article>
            </section>
          </div>
        </article>
      </section>
    </main>
  </div>
</template>
