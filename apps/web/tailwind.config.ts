import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "sans-serif"],
        arabic: ["var(--font-arabic)", "sans-serif"],
      },
      fontSize: {
        "ui-xs": ["0.75rem", { lineHeight: "1.1rem", letterSpacing: "0.01em" }],
        "ui-sm": ["0.875rem", { lineHeight: "1.35rem", letterSpacing: "0.005em" }],
        "ui-base": ["1rem", { lineHeight: "1.55rem", letterSpacing: "0.002em" }],
        "ui-lg": ["1.125rem", { lineHeight: "1.65rem", letterSpacing: "-0.008em" }],
        "ui-xl": ["1.375rem", { lineHeight: "1.75rem", letterSpacing: "-0.015em" }],
        "ui-2xl": ["1.75rem", { lineHeight: "2.2rem", letterSpacing: "-0.02em" }],
        "ui-3xl": ["2.25rem", { lineHeight: "2.6rem", letterSpacing: "-0.025em" }],
        "ui-display": ["3rem", { lineHeight: "1.05", letterSpacing: "-0.035em" }],
      },
      spacing: {
        "ui-1": "0.25rem",
        "ui-2": "0.5rem",
        "ui-3": "0.75rem",
        "ui-4": "1rem",
        "ui-5": "1.25rem",
        "ui-6": "1.5rem",
        "ui-7": "2rem",
        "ui-8": "2.5rem",
        "ui-9": "3rem",
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [animate],
};

export default config;
