"use client";

import { useEffect, useState } from "react";
import { MoonStar, Sun } from "lucide-react";
import { Button } from "./ui-button";

const THEME_STORAGE_KEY = "ledgerlite-theme";

type ThemeMode = "light" | "dark";

const resolveInitialTheme = (): ThemeMode => {
  if (typeof window === "undefined") {
    return "light";
  }
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark") {
    return stored;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

const applyTheme = (theme: ThemeMode) => {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.setAttribute("data-theme", theme);
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
};

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>("light");

  useEffect(() => {
    const initial = resolveInitialTheme();
    applyTheme(initial);
    setTheme(initial);
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  };

  const label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";

  return (
    <Button
      type="button"
      variant="secondary"
      size="icon"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      disabled={!mounted}
      className="theme-toggle-button"
    >
      {theme === "dark" ? <Sun size={16} aria-hidden="true" /> : <MoonStar size={16} aria-hidden="true" />}
    </Button>
  );
}
