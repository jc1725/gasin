import React, { createContext, useContext, useEffect, useState } from "react";
import { readThemePreference } from "@/lib/themePreference";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  toggleTheme?: () => void;
  switchable: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  switchable?: boolean;
}

export function ThemeProvider({
  children,
  defaultTheme = "light",
  switchable = false,
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(defaultTheme);
  const [preferenceReady, setPreferenceReady] = useState(!switchable);

  useEffect(() => {
    if (!switchable) return;
    try {
      setTheme(readThemePreference(localStorage.getItem("theme"), defaultTheme));
    } catch {
      setTheme(defaultTheme);
    } finally {
      setPreferenceReady(true);
    }
  }, [defaultTheme, switchable]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    if (switchable && preferenceReady) {
      localStorage.setItem("theme", theme);
    }
  }, [preferenceReady, theme, switchable]);

  const toggleTheme = switchable
    ? () => {
        setTheme(prev => (prev === "light" ? "dark" : "light"));
      }
    : undefined;

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, switchable }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
