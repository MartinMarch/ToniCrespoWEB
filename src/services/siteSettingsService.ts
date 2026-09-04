import { supabase } from "../lib/supabaseClient";
import { defaultSiteSettings, type SiteContactSettings, type SiteSettings } from "../types/siteSettings";

type SiteSettingsRow = {
  value: unknown;
};

export async function loadSiteSettings(): Promise<SiteSettings> {
  if (!supabase) return defaultSiteSettings;

  const { data, error } = await supabase.from("site_settings").select("value").eq("key", "global").maybeSingle();

  if (error) {
    console.warn("No se pudo cargar la configuración global; se usarán los valores seguros por defecto.", error.message);
    return defaultSiteSettings;
  }

  return normalizeSiteSettings((data as SiteSettingsRow | null)?.value);
}

export async function updateSiteSettings(settings: SiteSettings) {
  if (!supabase) throw new Error("Supabase no está configurado.");

  const normalized = normalizeSiteSettings(settings);
  const { error } = await supabase.from("site_settings").upsert(
    {
      key: "global",
      value: normalized,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );

  if (error) throw error;
}

function normalizeSiteSettings(value: unknown): SiteSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaultSiteSettings;

  const candidate = value as Partial<SiteSettings>;
  const contact = candidate.contact && typeof candidate.contact === "object" ? candidate.contact : {};

  return {
    contact: normalizeContactSettings(contact),
    defaultLanguage: isSiteLanguage(candidate.defaultLanguage) ? candidate.defaultLanguage : defaultSiteSettings.defaultLanguage,
  };
}

function normalizeContactSettings(value: Partial<SiteContactSettings>): SiteContactSettings {
  const instagramUsername = cleanInstagramUsername(value.instagramUsername) || defaultSiteSettings.contact.instagramUsername;
  const phoneNumber = cleanPhoneNumber(value.phoneNumber) || defaultSiteSettings.contact.phoneNumber;

  return {
    email: cleanText(value.email) || defaultSiteSettings.contact.email,
    instagramHandle: cleanText(value.instagramHandle) || `@${instagramUsername}`,
    instagramUsername,
    phoneDisplay: cleanText(value.phoneDisplay) || formatPhoneNumber(phoneNumber),
    phoneNumber,
  };
}

function cleanInstagramUsername(value: unknown) {
  return cleanText(value).replace(/^@/, "").replace(/[^a-zA-Z0-9._]/g, "").slice(0, 60);
}

function cleanPhoneNumber(value: unknown) {
  return cleanText(value).replace(/\D/g, "").slice(0, 18);
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function formatPhoneNumber(value: string) {
  return value.startsWith("34") && value.length === 11
    ? `+34 ${value.slice(2, 5)} ${value.slice(5, 8)} ${value.slice(8)}`
    : `+${value}`;
}

function isSiteLanguage(value: unknown): value is SiteSettings["defaultLanguage"] {
  return value === "es" || value === "en" || value === "de" || value === "ca";
}
