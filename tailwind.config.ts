import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: "#0A2540",
        aqua: "#06B6D4",
        ink: "#374151",
        // Standards palette
        "std-b": "#E2E8F0",
        "std-bb": "#EF4444",
        "std-a": "#3B82F6",
        "std-aa": "#10B981",
        "std-aaa": "#8B5CF6",
        "std-aaaa": "#F59E0B",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Manrope", "Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl: "0.75rem",
      },
    },
  },
  plugins: [],
} satisfies Config;
