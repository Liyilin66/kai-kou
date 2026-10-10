<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { supabase } from "@/lib/supabase";
import { RTS_TOPIC_META, useRTSData } from "@/composables/useRTSData";

const router = useRouter();
const authStore = useAuthStore();
const { loadQuestions } = useRTSData();

const loading = ref(true);
const favoriteIds = ref([]);
const questionMap = ref(new Map());

function goBack() {
  router.push("/home");
}

function goRTSHome() {
  router.push("/rts");
}

function favoriteStorageKey(userId) {
  return `kai_kou_rts_favorites_${userId}`;
}

function readLocalFavorites(userId) {
  const key = favoriteStorageKey(userId);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => `${item || ""}`.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function writeLocalFavorites(userId, ids) {
  const key = favoriteStorageKey(userId);
  try {
    localStorage.setItem(key, JSON.stringify([...ids]));
  } catch {
    // no-op
  }
}

function isMissingFavoritesTableError(error) {
  const code = `${error?.code || ""}`.toUpperCase();
  const message = `${error?.message || ""}`.toLowerCase();
  if (code === "42P01") return true;
  return message.includes("relation") && message.includes("favorites");
}

async function resolveCurrentUserId() {
  const authUserId = `${authStore.user?.id || ""}`.trim();
  if (authUserId) return authUserId;
  const { data } = await supabase.auth.getSession();
  return `${data?.session?.user?.id || ""}`.trim();
}

function openPractice(questionId) {
  const normalized = `${questionId || ""}`.trim();
  if (!normalized) return;
  router.push({ path: "/rts/practice", query: { id: normalized } });
}

function topicLabel(topic) {
  return RTS_TOPIC_META[`${topic || ""}`.trim()]?.label || "日常安排";
}

const favoriteQuestions = computed(() =>
  favoriteIds.value.map((id) => {
    const found = questionMap.value.get(id);
    if (found) return found;
    return {
      id,
      content: "该题目暂不可用",
      topic: "daily",
      difficulty: 1
    };
  })
);

async function loadFavorites() {
  loading.value = true;
  try {
    const questions = await loadQuestions();
    questionMap.value = new Map((Array.isArray(questions) ? questions : []).map((item) => [item.id, item]));

    const userId = await resolveCurrentUserId();
    if (!userId) {
      favoriteIds.value = [];
      return;
    }

    const localIds = readLocalFavorites(userId);
    let mergedIds = [...localIds];

    try {
      const { data, error } = await supabase
        .from("favorites")
        .select("question_id, created_at")
        .eq("user_id", userId)
        .eq("task_type", "RTS")
        .order("created_at", { ascending: false });

      if (error) {
        if (!isMissingFavoritesTableError(error)) throw error;
      } else {
        const remoteIds = (Array.isArray(data) ? data : [])
          .map((item) => `${item?.question_id || ""}`.trim())
          .filter(Boolean);
        mergedIds = [...new Set([...remoteIds, ...localIds])];
        writeLocalFavorites(userId, mergedIds);
      }
    } catch {
      // keep local fallback
    }

    favoriteIds.value = mergedIds;
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void loadFavorites();
});
</script>

<template>
  <div class="kk-page min-h-screen">
    <header class="border-b border-kk-line bg-kk-surface text-kk-ink">
      <div class="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:h-16 lg:px-10">
        <button type="button" class="-ml-2 inline-flex min-h-[44px] items-center px-2 text-[15px] font-medium text-kk-ink hover:text-kk-action-text" @click="goBack">← 返回首页</button>
        <p class="text-base font-semibold">RTS 收藏</p>
        <button type="button" class="inline-flex min-h-[44px] items-center px-1 text-sm font-semibold text-kk-action-text" @click="goRTSHome">RTS 首页</button>
      </div>
    </header>

    <main class="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <section v-if="loading" class="rounded-2xl border border-dashed border-kk-line p-4 text-sm text-kk-ink-3">
        收藏加载中...
      </section>

      <section v-else-if="!favoriteQuestions.length" class="rounded-2xl border border-dashed border-kk-line p-4 text-sm text-kk-ink-3">
        暂无 RTS 收藏题目。
      </section>

      <section v-else class="space-y-3">
        <article
          v-for="question in favoriteQuestions"
          :key="question.id"
          class="cursor-pointer rounded-[20px] border border-kk-line bg-kk-surface p-4 shadow-kk transition-colors hover:bg-kk-surface-2 sm:p-5"
          @click="openPractice(question.id)"
        >
          <div class="flex flex-wrap items-center gap-2">
            <span class="rounded-full bg-kk-surface-2 px-2.5 py-1 text-xs font-semibold text-kk-ink">{{ question.id }}</span>
            <span class="rounded-full bg-kk-surface-2 px-2.5 py-1 text-xs text-kk-ink">{{ topicLabel(question.topic) }}</span>
            <span class="rounded-full bg-kk-surface-2 px-2.5 py-1 text-xs text-kk-ink-2">难度 {{ "★".repeat(Math.max(1, Math.min(3, Number(question.difficulty || 1)))) }}</span>
          </div>
          <p class="kk-text mt-3 line-clamp-2 text-[15px] leading-relaxed text-kk-ink">{{ question.content }}</p>
        </article>
      </section>
    </main>
  </div>
</template>

