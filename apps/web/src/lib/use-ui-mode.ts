import { useEffect, useState } from "react";

export type UiMode = "simple" | "accountant";

const UI_MODE_KEY = "ledgerlite.uiMode";

export function useUiMode() {
  const [mode, setModeState] = useState<UiMode>("simple");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const stored = window.localStorage.getItem(UI_MODE_KEY);
    if (stored === "simple" || stored === "accountant") {
      setModeState(stored);
    }
  }, []);

  const setMode = (next: UiMode) => {
    setModeState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(UI_MODE_KEY, next);
    }
  };

  return { mode, setMode, isAccountant: mode === "accountant" };
}
