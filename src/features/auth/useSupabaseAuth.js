import { useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "./supabaseClient";

const configuredAuthRedirectUrl = (import.meta.env.VITE_AUTH_REDIRECT_URL ?? "").trim();

export function useSupabaseAuth() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }

    let mounted = true;

    const processOAuthCallback = async () => {
      const url = new URL(window.location.href);
      const hash = window.location.hash.startsWith("#")
        ? window.location.hash.slice(1)
        : window.location.hash;
      const hashParams = new URLSearchParams(hash);

      const hashAccessToken = hashParams.get("access_token");
      const hashRefreshToken = hashParams.get("refresh_token");
      const code = url.searchParams.get("code");

      if (hashAccessToken && hashRefreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: hashAccessToken,
          refresh_token: hashRefreshToken,
        });
        if (error) {
          console.error("Failed to set session from OAuth hash:", error.message);
        }
        window.history.replaceState({}, document.title, url.pathname + url.search);
      } else if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          console.error("Failed to exchange OAuth code:", error.message);
        }
        url.searchParams.delete("code");
        window.history.replaceState({}, document.title, `${url.pathname}${url.search}`);
      }
    };

    const loadSession = async () => {
      await processOAuthCallback();
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.error("Failed to get session:", error.message);
      }
      if (!mounted) return;
      setSession(data?.session ?? null);
      setLoading(false);
    };

    loadSession();

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = async () => {
    if (!supabase) return { error: new Error("Supabase is not configured") };
    const redirectTo = configuredAuthRedirectUrl || window.location.origin;

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });

    if (error) return { error };

    if (data?.url) {
      window.location.assign(data.url);
      return { error: null };
    }

    const fallback = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });

    if (fallback.error) return { error: fallback.error };
    return { error: new Error("Google 로그인 리다이렉트를 시작하지 못했습니다.") };
  };

  const signOut = async () => {
    if (!supabase) return { error: new Error("Supabase is not configured") };
    return supabase.auth.signOut();
  };

  return {
    session,
    loading,
    signInWithGoogle,
    signOut,
  };
}
