/** @type {import('tailwindcss').Config} */
export default {
  content: ["./app/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Text",
          "SF Pro Display",
          "Segoe UI",
          "PingFang SC",
          "Hiragino Sans GB",
          "Microsoft YaHei",
          "sans-serif",
        ],
      },
      boxShadow: {
        // 卡片底影:近处 1px 锐影 + 远处柔影,替代 Tailwind 默认的平贴感
        soft: "0 1px 2px rgba(15, 23, 42, 0.04), 0 12px 32px -16px rgba(15, 23, 42, 0.14)",
        lift: "0 2px 4px rgba(15, 23, 42, 0.05), 0 20px 44px -20px rgba(15, 23, 42, 0.22)",
        glow: "0 8px 24px -8px rgba(16, 185, 129, 0.45)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pop-in": {
          "0%": { opacity: "0", transform: "scale(0.92)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) both",
        "pop-in": "pop-in 0.28s cubic-bezier(0.22, 1, 0.36, 1) both",
      },
    },
  },
  plugins: [],
};
