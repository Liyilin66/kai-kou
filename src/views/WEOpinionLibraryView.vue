<script setup>
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import NavBar from "@/components/NavBar.vue";
import OrangeButton from "@/components/OrangeButton.vue";
import { useUIStore } from "@/stores/ui";
import { getWEOpinionSentences, getWEOpinionTopics } from "@/lib/we-data";

const router = useRouter();
const uiStore = useUIStore();
const ACTIVE_OPINION_STORAGE_KEY = "we.activeOpinionId";

const searchText = ref("");
const opinionSentences = ref(getWEOpinionSentences());
const opinionTopics = ref(getWEOpinionTopics());

const stanceLabelMap = {
  support: "support",
  against: "against",
  balanced: "balanced"
};

const topicLabelMap = {
  education_learning: "Education & Learning",
  technology_media: "Technology & Media",
  work_business_economy: "Work / Business / Economy",
  government_law_environment: "Government / Law / Environment",
  city_building_tourism_living: "City / Building / Tourism / Living",
  family_society_growth: "Family / Society / Growth"
};

function persistOpinionId(opinionId) {
  const key = String(opinionId || "").trim();
  if (!key || typeof window === "undefined") return;
  window.localStorage.setItem(ACTIVE_OPINION_STORAGE_KEY, key);
}

const groupedOpinionSentences = computed(() => {
  const keyword = searchText.value.trim().toLowerCase();
  const topicOrder = opinionTopics.value.length
    ? opinionTopics.value.map((item) => item.topicKey)
    : Object.keys(topicLabelMap);

  return topicOrder
    .map((topicKey) => {
      const topicItems = opinionSentences.value.filter((item) => item.topicKey === topicKey);
      const filteredItems = keyword
        ? topicItems.filter((item) => {
            const text = String(item.text || "").toLowerCase();
            const subTopic = String(item.subTopicLabel || item.subTopicKey || "").toLowerCase();
            return text.includes(keyword) || subTopic.includes(keyword);
          })
        : topicItems;

      return {
        topicKey,
        label: topicLabelMap[topicKey] || topicKey,
        items: filteredItems
      };
    })
    .filter((group) => group.items.length > 0);
});

async function copySentence(sentence) {
  const text = String(sentence?.text || "").trim();
  if (!text) {
    uiStore.showToast("Sentence is empty.", "warning");
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    uiStore.showToast("Sentence copied.", "success");
  } catch (error) {
    uiStore.showToast("Copy failed. Please copy manually.", "warning");
  }
}

function useInPractice(sentence) {
  const opinionId = String(sentence?.id || "").trim();
  if (!opinionId) return;

  persistOpinionId(opinionId);

  router.push({
    path: "/we/select",
    query: { opinion: opinionId }
  });
}

function goRandomPractice() {
  router.push("/we");
}
</script>

<template>
  <div class="min-h-screen bg-bg">
    <NavBar title="WE 观点句总库" back-to="/we" />

    <main class="mx-auto max-w-5xl px-4 py-6">
      <section class="mb-4 rounded-xl border bg-white p-4 shadow-sm">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-sm font-semibold text-navy">观点句总库</p>
            <p class="text-xs text-muted">按 6 大分类整理，可复制并直接带去练习使用。</p>
          </div>
          <OrangeButton tone="outline" @click="goRandomPractice">去随机练习</OrangeButton>
        </div>

        <div class="mt-3">
          <input
            v-model="searchText"
            type="text"
            placeholder="Search opinion sentences..."
            class="h-11 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-orange"
          />
        </div>
      </section>

      <div class="space-y-4">
        <section
          v-for="group in groupedOpinionSentences"
          :key="group.topicKey"
          class="rounded-xl border bg-white p-4 shadow-sm"
        >
          <div class="mb-3 flex items-center justify-between gap-2">
            <p class="text-sm font-semibold text-navy">{{ group.label }}</p>
            <span class="text-xs text-muted">{{ group.items.length }} sentences</span>
          </div>

          <div class="space-y-2">
            <article
              v-for="sentence in group.items"
              :key="sentence.id"
              class="rounded-lg border border-gray-200 p-3"
            >
              <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div class="min-w-0">
                  <p class="text-xs font-semibold text-navy">{{ sentence.subTopicLabel || sentence.subTopicKey }}</p>
                  <p class="text-[11px] text-muted">{{ stanceLabelMap[sentence.stance] || sentence.stance }} · {{ sentence.id }}</p>
                </div>
                <div class="flex flex-wrap gap-2">
                  <button
                    type="button"
                    class="rounded-lg border border-gray-300 px-3 py-1 text-xs font-semibold text-muted transition-colors hover:border-orange hover:text-orange"
                    @click="copySentence(sentence)"
                  >
                    复制
                  </button>
                  <button
                    type="button"
                    class="rounded-lg bg-orange px-3 py-1 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                    @click="useInPractice(sentence)"
                  >
                    去练习中使用
                  </button>
                </div>
              </div>

              <p class="text-sm leading-relaxed text-text">{{ sentence.text }}</p>
              <p class="mt-1 text-xs leading-relaxed text-muted">{{ sentence.translationZh }}</p>
            </article>
          </div>
        </section>

        <section v-if="!groupedOpinionSentences.length" class="rounded-xl border bg-white p-10 text-center shadow-sm">
          <p class="text-sm font-semibold text-navy">No matched opinion sentence</p>
          <p class="mt-1 text-xs text-muted">Try another keyword.</p>
        </section>
      </div>
    </main>
  </div>
</template>
