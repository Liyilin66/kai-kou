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
        muted: "#718096"
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "PingFang SC", "sans-serif"]
      },
      boxShadow: {
        card: "0 1px 3px rgba(15, 23, 42, 0.16)"
      }
    }
  },
  plugins: []
};
