import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { isDIEnabled } from "@/lib/di-feature";

const routes = [
  { path: "/", redirect: "/home" },
  { path: "/auth", name: "auth", component: () => import("@/views/AuthView.vue") },
  { path: "/forgot-password", name: "forgot-password", component: () => import("@/views/ForgotPasswordView.vue") },
  { path: "/reset-password", name: "reset-password", component: () => import("@/views/ResetPasswordView.vue") },
  { path: "/home", name: "home", component: () => import("@/views/HomeView.vue"), meta: { requiresAuth: true } },
  { path: "/agent", name: "agent", component: () => import("@/views/AgentView.vue"), meta: { requiresAuth: true } },
  { path: "/ra", name: "ra", component: () => import("@/views/RAHomeView.vue"), meta: { requiresAuth: true } },
  { path: "/ra/practice", name: "ra-practice", component: () => import("@/views/RAView.vue"), meta: { requiresAuth: true } },
  { path: "/ra/list", name: "ra-list", component: () => import("@/views/RAListView.vue"), meta: { requiresAuth: true } },
  { path: "/ra/result", name: "ra-result", component: () => import("@/views/RAResultView.vue"), meta: { requiresAuth: true } },
  { path: "/rs", name: "rs", component: () => import("@/views/RSView.vue"), meta: { requiresAuth: true } },
  { path: "/rs/result", name: "rs-result", component: () => import("@/views/RSResultView.vue"), meta: { requiresAuth: true } },
  { path: "/rl", name: "rl", component: () => import("@/views/RLView.vue"), meta: { requiresAuth: true } },
  { path: "/rl/result", name: "rl-result", component: () => import("@/views/RLResultView.vue"), meta: { requiresAuth: true } },
  { path: "/we", name: "we", component: () => import("@/views/WEView.vue"), meta: { requiresAuth: true } },
  { path: "/we/select", name: "we-select", component: () => import("@/views/WESelectView.vue"), meta: { requiresAuth: true } },
  { path: "/we/templates", name: "we-templates", component: () => import("@/views/WETemplateLibraryView.vue"), meta: { requiresAuth: true } },
  { path: "/we/opinions", name: "we-opinions", component: () => import("@/views/WEOpinionLibraryView.vue"), meta: { requiresAuth: true } },
  { path: "/we/history", name: "we-history", component: () => import("@/views/WEHistoryView.vue"), meta: { requiresAuth: true } },
  { path: "/we/practice/:id", name: "we-practice", component: () => import("@/views/WEView.vue"), meta: { requiresAuth: true } },
  { path: "/di", name: "di", component: () => import("@/views/DIView.vue"), meta: { requiresAuth: true } },
  { path: "/di/select", name: "di-select", component: () => import("@/views/DISelectView.vue"), meta: { requiresAuth: true } },
  { path: "/di/templates", name: "di-templates", component: () => import("@/views/DITemplateLibraryView.vue"), meta: { requiresAuth: true } },
  { path: "/di/practice/:id", name: "di-practice", component: () => import("@/views/DIPracticeView.vue"), meta: { requiresAuth: true } },
  { path: "/di/analyzing", name: "di-analyzing", component: () => import("@/views/DIAnalyzingView.vue"), meta: { requiresAuth: true } },
  { path: "/di/result", name: "di-result", component: () => import("@/views/DIResultView.vue"), meta: { requiresAuth: true } },
  { path: "/rts", name: "rts-home", component: () => import("@/views/RTSHomeView.vue"), meta: { requiresAuth: true } },
  { path: "/rts/list", name: "rts-list", component: () => import("@/views/RTSListView.vue"), meta: { requiresAuth: true } },
  { path: "/rts/templates", name: "rts-templates", component: () => import("@/views/RTSTemplateLibraryView.vue"), meta: { requiresAuth: true } },
  { path: "/rts/favorites", name: "rts-favorites", component: () => import("@/views/RTSFavoritesView.vue"), meta: { requiresAuth: true } },
  { path: "/rts/practice", name: "rts-practice", component: () => import("@/views/RTSPracticeView.vue"), meta: { requiresAuth: true } },
  { path: "/rts/analyzing", name: "rts-analyzing", component: () => import("@/views/RTSAnalyzingView.vue"), meta: { requiresAuth: true } },
  { path: "/rts/result", name: "rts-result", component: () => import("@/views/RTSResultView.vue"), meta: { requiresAuth: true } },
  { path: "/wfd", name: "wfd", component: () => import("@/views/WFDView.vue"), meta: { requiresAuth: true } },
  { path: "/wfd/practice", name: "wfd-practice", component: () => import("@/views/WFDPracticeView.vue"), meta: { requiresAuth: true } },
  { path: "/wfd/list", name: "wfd-list", component: () => import("@/views/WFDListView.vue"), meta: { requiresAuth: true } },
  { path: "/wfd/listen", name: "wfd-listen", component: () => import("@/views/WFDListenView.vue"), meta: { requiresAuth: true } },
  { path: "/wfd/result", name: "wfd-result", component: () => import("@/views/WFDResultView.vue"), meta: { requiresAuth: true } },
  { path: "/profile", name: "profile", component: () => import("@/views/ProfileView.vue"), meta: { requiresAuth: true } },
  { path: "/limit", name: "limit", component: () => import("@/views/LimitReachedView.vue"), meta: { requiresAuth: true } },
  { path: "/upgrade", name: "upgrade", component: () => import("@/views/UpgradeView.vue"), meta: { requiresAuth: true } },
  { path: "/billing/result", name: "billing-result", component: () => import("@/views/PaymentResultView.vue"), meta: { requiresAuth: true } }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

router.beforeEach(async (to) => {
  const authStore = useAuthStore();
  await authStore.init();

  if (to.path === "/ra") {
    const hasPracticeQuery = ["questionId", "difficulty", "mode"].some((key) => {
      const value = to.query?.[key];
      return Array.isArray(value) ? value.some(Boolean) : Boolean(value);
    });

    if (hasPracticeQuery) {
      return {
        path: "/ra/practice",
        query: to.query
      };
    }
  }

  if (to.path.startsWith("/di") && !isDIEnabled()) {
    return "/home";
  }

  if (to.meta.requiresAuth && !authStore.isLoggedIn) {
    return "/auth";
  }

  const needsPremiumAccess = to.path.startsWith("/we") || to.path.startsWith("/di");
  if (needsPremiumAccess && !authStore.canPractice && to.path !== "/limit") {
    return "/limit";
  }

  if (to.path === "/auth" && authStore.isLoggedIn) {
    return "/home";
  }
});

export default router;
