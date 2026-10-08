import { defineStore } from "pinia";

let toastTimer = null;

export const useUIStore = defineStore("ui", {
  state: () => ({
    toast: null
  }),

  actions: {
    showToast(message, type = "success", duration = 3000) {
      this.toast = {
        message,
        type
      };

      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        this.toast = null;
      }, duration);
    },

    clearToast() {
      clearTimeout(toastTimer);
      this.toast = null;
    }
  }
});