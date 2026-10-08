<script setup>
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import NavBar from "@/components/NavBar.vue";
import OrangeButton from "@/components/OrangeButton.vue";
import { useUIStore } from "@/stores/ui";
import { getUniversalWETemplates } from "@/lib/we-data";

const router = useRouter();
const route = useRoute();
const uiStore = useUIStore();
const ACTIVE_TEMPLATE_STORAGE_KEY = "we.activeTemplateId";

const templates = ref(getUniversalWETemplates());
const expandedTemplateIds = ref([]);
const activeTemplateId = ref(String(route.query?.template || "").trim());

function persistTemplateId(templateId) {
  const key = String(templateId || "").trim();
  if (!key || typeof window === "undefined") return;
  window.localStorage.setItem(ACTIVE_TEMPLATE_STORAGE_KEY, key);
}

function isExpanded(templateId) {
  return expandedTemplateIds.value.includes(templateId);
}

function toggleExpand(templateId) {
  if (isExpanded(templateId)) {
    expandedTemplateIds.value = expandedTemplateIds.value.filter((item) => item !== templateId);
    return;
  }
  expandedTemplateIds.value = [...expandedTemplateIds.value, templateId];
}

function previewText(content) {
  const text = String(content || "").trim();
  if (text.length <= 180) return text;
  return `${text.slice(0, 180).trim()}...`;
}

async function copyTemplate(template) {
  const content = String(template?.content || "").trim();
  if (!content) {
    uiStore.showToast("Template is empty.", "warning");
    return;
  }

  try {
    await navigator.clipboard.writeText(content);
    uiStore.showToast("Template copied.", "success");
  } catch (error) {
    uiStore.showToast("Copy failed. Please copy manually.", "warning");
  }
}

function useTemplateInPractice(templateId) {
  const key = String(templateId || "").trim();
  if (!key) return;
  activeTemplateId.value = key;
  persistTemplateId(key);
  router.push({
    path: "/we/select",
    query: { template: key }
  });
}

function startRandomPractice() {
  router.push({
    path: "/we",
    query: activeTemplateId.value ? { template: activeTemplateId.value } : {}
  });
}
</script>

<template>
  <div class="min-h-screen bg-bg">
    <NavBar title="WE 通用模板" back-to="/we" />

    <main class="mx-auto max-w-4xl px-4 py-6">
      <section class="mb-4 rounded-xl border bg-white p-4 shadow-sm">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-sm font-semibold text-navy">10 个全文通用模板</p>
            <p class="text-xs text-muted">查看、复制，并带着模板去练习页使用。</p>
          </div>
          <OrangeButton tone="outline" @click="startRandomPractice">去随机练习</OrangeButton>
        </div>
      </section>

      <div class="space-y-3">
        <article
          v-for="template in templates"
          :key="template.id"
          class="rounded-xl border bg-white p-4 shadow-sm"
          :class="template.id === activeTemplateId ? 'border-orange' : 'border-gray-200'"
        >
          <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p class="text-sm font-semibold text-navy">{{ template.title }}</p>
              <p class="text-xs text-muted">{{ template.shortLabel || template.id }} · difficulty {{ template.difficulty }}</p>
            </div>
            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                class="rounded-lg border border-gray-300 px-3 py-1 text-xs font-semibold text-muted transition-colors hover:border-orange hover:text-orange"
                @click="toggleExpand(template.id)"
              >
                {{ isExpanded(template.id) ? "收起" : "查看全文" }}
              </button>
              <button
                type="button"
                class="rounded-lg border border-gray-300 px-3 py-1 text-xs font-semibold text-muted transition-colors hover:border-orange hover:text-orange"
                @click="copyTemplate(template)"
              >
                复制
              </button>
              <button
                type="button"
                class="rounded-lg bg-orange px-3 py-1 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                @click="useTemplateInPractice(template.id)"
              >
                去练习中使用
              </button>
            </div>
          </div>

          <pre
            v-if="isExpanded(template.id)"
            class="overflow-auto whitespace-pre-wrap rounded-md bg-[#F8FAFC] p-3 text-xs leading-relaxed text-text"
          >{{ template.content }}</pre>
          <p v-else class="text-xs leading-relaxed text-text">{{ previewText(template.content) }}</p>
        </article>
      </div>
    </main>
  </div>
</template>
