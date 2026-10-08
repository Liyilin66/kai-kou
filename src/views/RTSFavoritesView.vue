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
  <div class="min-h-screen bg-[#F0F4F8] [font-family:'DM_Sans',-apple-system,'PingFang_SC',sans-serif]">
    <header class="bg-[#1B3A6B] text-white">
      <div class="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <button type="button" class="text-sm text-white/90 transition-opacity hover:opacity-90" @click="goBack">← 返回首页</button>
        <p class="text-base font-semibold">RTS 收藏</p>
        <button type="button" class="text-xs text-white/80 transition-opacity hover:opacity-90" @click="goRTSHome">RTS 首页</button>
      </div>
    </header>

    <main class="mx-auto max-w-6xl px-4 py-6">
      <section v-if="loading" class="rounded-[14px] border border-[#E8EDF5] bg-white p-4 text-sm text-[#8CA0C0]">
        收藏加载中...
      </section>

      <section v-else-if="!favoriteQuestions.length" class="rounded-[14px] border border-[#E8EDF5] bg-white p-4 text-sm text-[#8CA0C0]">
        暂无 RTS 收藏题目。
      </section>

      <section v-else class="space-y-3">
        <article
          v-for="question in favoriteQuestions"
          :key="question.id"
          class="cursor-pointer rounded-[14px] border border-[#E8EDF5] bg-white p-4 transition-colors hover:bg-[#F8FAFD]"
          @click="openPractice(question.id)"
        >
          <div class="flex flex-wrap items-center gap-2">
            <span class="rounded-full bg-[#EDF2FB] px-2.5 py-1 text-xs font-semibold text-[#1B3A6B]">{{ question.id }}</span>
            <span class="rounded-full bg-[#F5F7FB] px-2.5 py-1 text-xs text-[#1E293B]">{{ topicLabel(question.topic) }}</span>
            <span class="rounded-full bg-[#FFF3EC] px-2.5 py-1 text-xs text-[#E8845A]">难度 {{ "★".repeat(Math.max(1, Math.min(3, Number(question.difficulty || 1)))) }}</span>
          </div>
          <p class="mt-3 line-clamp-2 text-sm leading-relaxed text-[#1E293B]">{{ question.content }}</p>
        </article>
      </section>
    </main>
  </div>
</template>

