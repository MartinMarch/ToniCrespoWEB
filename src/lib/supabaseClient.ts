import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured ? createClient(supabaseUrl, supabaseAnonKey) : null;

export type SupabaseStorageBucket = "artworks" | "photography" | "news" | "biography" | "site-assets";

export function getSupabasePublicStorageUrl(bucket: SupabaseStorageBucket, storagePath: string) {
  if (!supabaseUrl) return "";

  const encodedPath = storagePath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${encodedPath}`;
}
