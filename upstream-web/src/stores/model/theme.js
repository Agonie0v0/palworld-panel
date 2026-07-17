import { defineStore } from "pinia";

const THEME_KEY = "palworld_theme";

export default defineStore("theme", {
  state: () => ({
    mode: "light",
  }),
  getters: {
    isDark: (state) => state.mode === "dark",
  },
  actions: {
    init() {
      const stored = localStorage.getItem(THEME_KEY);
      this.setMode(stored === "dark" ? "dark" : "light");
    },
    setMode(mode) {
      this.mode = mode === "dark" ? "dark" : "light";
      localStorage.setItem(THEME_KEY, this.mode);
      document.documentElement.dataset.theme = this.mode;
      document.documentElement.style.colorScheme = this.mode;
    },
    toggle() {
      this.setMode(this.isDark ? "light" : "dark");
    },
  },
});
