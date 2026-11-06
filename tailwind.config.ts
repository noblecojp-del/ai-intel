import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Noto Sans JP"', "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Meiryo", "sans-serif"],
      },
      colors: {
        ink: { DEFAULT: "#16181d", soft: "#4a4f5a", faint: "#8a8f99" },
        line: "#e4e6ea",
        paper: "#fafaf9",
        accent: "#1d4ed8",
      },
    },
  },
  plugins: [],
} satisfies Config;
