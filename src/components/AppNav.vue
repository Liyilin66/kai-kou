<template>
  <!-- Desktop ≥1024: left sidebar. The default slot holds page-specific extras (AI 私教 chat history). -->
  <aside class="app-sidebar">
    <RouterLink class="app-logo" to="/home" aria-label="返回首页">
      <span class="app-logo-icon" aria-hidden="true">
        <svg width="18" height="18" fill="none" viewBox="0 0 18 18">
          <rect x="2" y="2" width="6" height="6" rx="1.5" fill="#F5EFE4" opacity=".95" />
          <rect x="10" y="2" width="6" height="6" rx="1.5" fill="#F5EFE4" opacity=".5" />
          <rect x="2" y="10" width="6" height="6" rx="1.5" fill="#F5EFE4" opacity=".5" />
          <rect x="10" y="10" width="6" height="6" rx="1.5" fill="#F5EFE4" opacity=".75" />
        </svg>
      </span>
      <span class="app-logo-name">开口 PTE</span>
    </RouterLink>

    <nav class="app-nav" aria-label="主导航">
      <RouterLink
        class="app-nav-item"
        :class="{ 'app-nav-item--active': isActive(homeItem) }"
        :to="homeItem.to"
        :aria-current="isActive(homeItem) ? 'page' : undefined"
      >
        <span class="app-nav-icon" aria-hidden="true" v-html="ICONS.home"></span>
        <span>{{ homeItem.label }}</span>
      </RouterLink>

      <div class="app-nav-group" role="group" aria-labelledby="app-nav-practice">
        <div id="app-nav-practice" class="app-nav-group-title">练习</div>
        <RouterLink
          v-for="item in practiceItems"
          :key="item.key"
          class="app-nav-item app-nav-item--task"
          :class="{ 'app-nav-item--active': isActive(item) }"
          :to="item.to"
          :aria-current="isActive(item) ? 'page' : undefined"
        >
          <span class="app-nav-code">{{ item.code }}</span>
          <span>{{ item.label }}</span>
        </RouterLink>
      </div>

      <RouterLink
        v-for="item in trailingItems"
        :key="item.key"
        class="app-nav-item"
        :class="{ 'app-nav-item--active': isActive(item) }"
        :to="item.to"
        :aria-current="isActive(item) ? 'page' : undefined"
      >
        <span class="app-nav-icon" aria-hidden="true" v-html="ICONS[item.key]"></span>
        <span>{{ item.label }}</span>
      </RouterLink>
    </nav>

    <slot />

    <div class="app-sidebar-footer">
      <div class="app-promo">
        <div class="app-promo-title">WE 模板库</div>
        <div class="app-promo-sub">写作结构 · 模板参考</div>
        <RouterLink class="app-promo-button" to="/we/templates">查看模板</RouterLink>
      </div>
    </div>
  </aside>

  <!-- Mobile and tablet <1024: fixed bottom tab bar. Pages that use AppNav pad their content by --kk-tabbar-h. -->
  <nav class="app-tabbar" aria-label="主导航">
    <RouterLink
      v-for="item in PRIMARY_NAV_ITEMS"
      :key="item.key"
      class="app-tab"
      :class="{ 'app-tab--active': isActive(item) }"
      :to="item.to"
      :aria-current="isActive(item) ? 'page' : undefined"
    >
      <span class="app-tab-icon" aria-hidden="true" v-html="ICONS[item.key]"></span>
      <span class="app-tab-label">{{ item.short }}</span>
    </RouterLink>
  </nav>
</template>

<script setup>
import { computed } from "vue";
import { useRoute } from "vue-router";
import { isDIEnabled } from "@/lib/di-feature";
import { PRIMARY_NAV_ITEMS, buildPracticeNavItems, isNavItemActive } from "@/lib/app-nav";

const ICONS = {
  home: '<svg viewBox="0 0 20 20" fill="none"><path d="M3 8.6 10 3l7 5.6V16a1 1 0 0 1-1 1h-3.5v-5h-5v5H4a1 1 0 0 1-1-1V8.6Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  agent: '<svg viewBox="0 0 20 20" fill="none"><path d="M10 3c-3.87 0-7 2.7-7 6.05 0 1.86.97 3.52 2.5 4.63V17l3.02-1.73c.48.08.98.12 1.48.12 3.87 0 7-2.7 7-6.04C17 5.7 13.87 3 10 3Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M7 9h6M10 6.5v5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  profile: '<svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="7" r="3.2" stroke="currentColor" stroke-width="1.6"/><path d="M3.8 17c.6-3.06 3.1-5 6.2-5s5.6 1.94 6.2 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'
};

const route = useRoute();
const homeItem = PRIMARY_NAV_ITEMS[0];
const trailingItems = PRIMARY_NAV_ITEMS.slice(1);
const practiceItems = computed(() => buildPracticeNavItems({ diEnabled: isDIEnabled() }));

function isActive(item) {
  return isNavItemActive(item, route.path);
}
</script>

<style scoped>
.app-sidebar{display:none;flex:0 0 232px;width:232px;min-height:0;flex-direction:column;background:var(--kk-surface);border-right:1px solid var(--kk-line);font-family:var(--kk-font);}
.app-logo{display:flex;align-items:center;gap:10px;height:72px;flex:0 0 72px;padding:0 24px;text-decoration:none;}
.app-logo-icon{display:flex;width:34px;height:34px;align-items:center;justify-content:center;border-radius:50%;background:var(--kk-action);flex-shrink:0;}
.app-logo-name{color:var(--kk-ink);font-size:18px;font-weight:700;}
.app-nav{display:flex;flex:0 1 auto;min-height:0;overflow-y:auto;flex-direction:column;gap:2px;padding:4px 16px 16px;}
.app-nav-item{display:flex;align-items:center;gap:12px;min-height:42px;padding:0 14px;border-radius:12px;color:var(--kk-ink-2);font-size:15px;line-height:1.3;text-decoration:none;transition:background .15s,color .15s;}
.app-nav-item:hover{background:var(--kk-surface-2);color:var(--kk-ink);}
.app-nav-item--active,.app-nav-item--active:hover{background:var(--kk-action-soft);color:var(--kk-action-text);font-weight:600;}
.app-nav-icon{display:flex;align-items:center;justify-content:center;width:18px;height:18px;flex:0 0 18px;}
.app-nav-icon :deep(svg){width:18px;height:18px;}
.app-nav-group{display:flex;flex-direction:column;gap:2px;margin:8px 0;padding:8px 0;border-top:1px solid var(--kk-line);border-bottom:1px solid var(--kk-line);}
.app-nav-group-title{padding:4px 14px 6px;color:var(--kk-ink-3);font-size:12px;font-weight:600;letter-spacing:.04em;}
.app-nav-item--task{min-height:38px;font-size:14px;}
.app-nav-code{flex:0 0 36px;font-family:var(--kk-font-num);font-size:12px;font-weight:800;color:var(--kk-ink-3);}
.app-nav-item--active .app-nav-code{color:inherit;}
.app-sidebar-footer{margin-top:auto;padding:16px;}
.app-promo{padding:16px;border-radius:16px;background:var(--kk-surface-2);}
.app-promo-title{margin-bottom:2px;color:var(--kk-ink);font-size:15px;font-weight:600;}
.app-promo-sub{margin-bottom:12px;color:var(--kk-ink-3);font-size:13px;}
.app-promo-button{display:inline-flex;align-items:center;justify-content:center;min-height:36px;padding:0 16px;border:1px solid var(--kk-line);border-radius:999px;background:var(--kk-surface);color:var(--kk-ink);font:600 13px/1 var(--kk-font);text-decoration:none;}

.app-tabbar{position:fixed;left:0;right:0;bottom:0;z-index:40;display:flex;height:var(--kk-tabbar-h);padding-bottom:env(safe-area-inset-bottom, 0px);background:var(--kk-surface);border-top:1px solid var(--kk-line);font-family:var(--kk-font);}
.app-tab{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;min-width:0;color:var(--kk-ink-3);font-size:12px;font-weight:500;text-decoration:none;-webkit-tap-highlight-color:transparent;}
.app-tab-icon{display:flex;width:24px;height:24px;}
.app-tab-icon :deep(svg){width:24px;height:24px;}
.app-tab--active{color:var(--kk-action-text);font-weight:700;}

@media (min-width:1024px){
  .app-sidebar{display:flex;}
  .app-tabbar{display:none;}
}
</style>
