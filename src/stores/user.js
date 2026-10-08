import { defineStore } from "pinia";

export const useUserStore = defineStore("user", {
  state: () => ({
    id: "mock-user-001",
    name: "访客",
    scoreBand: "47-50",
    loggedIn: false
  }),
  actions: {
    login() {
      this.loggedIn = true;
      this.name = "开口学员";
    },
    setScoreBand(scoreBand) {
      this.scoreBand = scoreBand;
    }
  }
});
