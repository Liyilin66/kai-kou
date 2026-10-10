/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{vue,js}"],
  theme: {
    extend: {
      colors: {
        navy: "#1B3A6B",
        bg: "#F0F4F8",
        card: "#FFFFFF",
        orange: "#E8845A",
        success: "#52C41A",
        warning: "#FAAD14",
        text: "#2D3748",
        muted: "#718096",
        kk: {
          bg: "var(--kk-bg)",
          surface: "var(--kk-surface)",
          "surface-2": "var(--kk-surface-2)",
          line: "var(--kk-line)",
          ink: "var(--kk-ink)",
          "ink-2": "var(--kk-ink-2)",
          "ink-3": "var(--kk-ink-3)",
          "ink-inverse": "var(--kk-ink-inverse)",
          "dark-line": "var(--kk-dark-line)",
          action: "var(--kk-action)",
          "action-hover": "var(--kk-action-hover)",
          "action-press": "var(--kk-action-press)",
          "action-soft": "var(--kk-action-soft)",
          "action-text": "var(--kk-action-text)",
          "on-action": "var(--kk-on-action)",
          success: "var(--kk-success)",
          "success-bg": "var(--kk-success-bg)",
          "success-line": "var(--kk-success-line)",
          error: "var(--kk-error)",
          "error-bg": "var(--kk-error-bg)",
          "error-line": "var(--kk-error-line)",
          notice: "var(--kk-notice)",
          "notice-bg": "var(--kk-notice-bg)",
          "notice-line": "var(--kk-notice-line)"
        }
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "PingFang SC", "sans-serif"],
        kk: ["PingFang SC", "Noto Sans SC", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        "kk-num": ["Manrope", "PingFang SC", "sans-serif"],
        "kk-text": ["Source Serif 4", "Georgia", "serif"]
      },
      boxShadow: {
        card: "0 1px 3px rgba(15, 23, 42, 0.16)",
        kk: "0 1px 2px rgba(30, 27, 24, 0.05), 0 8px 24px rgba(30, 27, 24, 0.05)",
        "kk-pop": "0 12px 40px rgba(30, 27, 24, 0.16)"
      }
    }
  },
  plugins: []
};
