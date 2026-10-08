import { createApp } from "vue";
import { createPinia } from "pinia";
import router from "@/router";
import App from "@/App.vue";
import "@/assets/styles/main.css";

redirectToCanonicalHost();

const app = createApp(App);

app.use(createPinia());
app.use(router);

if (typeof window !== "undefined") {
  window.__vue_router__ = router;
}

app.mount("#app");

function redirectToCanonicalHost() {
  if (typeof window === "undefined") return;
  // Every Preview keeps its own API and assets regardless of feature flags.
  if (import.meta.env.VERCEL_ENV === "preview") return;

  const canonicalHost = "kai-kou.vercel.app";
  const currentHost = window.location.hostname.toLowerCase();
  const isOldVercelDeployment = currentHost.endsWith(".vercel.app") && currentHost !== canonicalHost;

  if (!isOldVercelDeployment) return;

  const targetUrl = `https://${canonicalHost}${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.location.replace(targetUrl);
}
