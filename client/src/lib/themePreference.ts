export type ThemePreference = "light" | "dark";

export function readThemePreference(value: string | null | undefined, fallback: ThemePreference = "light"): ThemePreference {
  return value === "dark" || value === "light" ? value : fallback;
}
