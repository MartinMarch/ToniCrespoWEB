import { defaultSiteSettings, type SiteGradientSettings } from "../types/siteSettings";

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && value.length === 7 && /^#[\da-f]{6}$/i.test(value);
}

export function normalizeGradientSettings(value: unknown): SiteGradientSettings {
  const candidate = value && typeof value === "object" && !Array.isArray(value)
    ? value as Partial<SiteGradientSettings> : {};
  function colorOrDefault(color: unknown, fallback: string) {
    const trimmed = typeof color === "string" ? color.trim() : color;
    return isHexColor(trimmed) ? trimmed.toLowerCase() : fallback;
  }
  return {
    startColor: colorOrDefault(candidate.startColor, defaultSiteSettings.gradient.startColor),
    endColor: colorOrDefault(candidate.endColor, defaultSiteSettings.gradient.endColor),
  };
}

export function buildSiteGradient(gradient: SiteGradientSettings): string {
  const { startColor, endColor } = normalizeGradientSettings(gradient);
  return `linear-gradient(180deg, ${startColor} 0%, ${endColor} 100%)`;
}
