import { createClient } from "@supabase/supabase-js";

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? "").trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();

export const requiredEnvKeys = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"];
export const missingSupabaseEnvKeys = requiredEnvKeys.filter((key) => {
  if (key === "VITE_SUPABASE_URL") return !supabaseUrl;
  if (key === "VITE_SUPABASE_ANON_KEY") return !supabaseAnonKey;
  return false;
});

function isValidHttpUrl(urlString) {
  try {
    const url = new URL(urlString);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export let supabaseConfigError = "";
export let supabase = null;

if (missingSupabaseEnvKeys.length === 0) {
  if (!isValidHttpUrl(supabaseUrl)) {
    supabaseConfigError =
      "VITE_SUPABASE_URL 형식이 잘못되었습니다. 예: https://your-project-ref.supabase.co";
  } else {
    try {
    supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    } catch (error) {
      supabaseConfigError = `Supabase 초기화 실패: ${error?.message ?? "알 수 없는 오류"}`;
    }
  }
}

export const isSupabaseConfigured = Boolean(supabase);
