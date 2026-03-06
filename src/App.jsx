import { lazy, Suspense, useState } from "react";
import LoginScreen from "./features/auth/LoginScreen";
import {
  isSupabaseConfigured,
  missingSupabaseEnvKeys,
  requiredEnvKeys,
  supabaseConfigError,
} from "./features/auth/supabaseClient";
import { useSupabaseAuth } from "./features/auth/useSupabaseAuth";

const InteractiveMode = lazy(() => import("./features/interactive/InteractiveMode"));

function MissingEnvNotice() {
  const hasMissingKeys = missingSupabaseEnvKeys.length > 0;
  const missingKeys = hasMissingKeys ? missingSupabaseEnvKeys : requiredEnvKeys;
  const title = hasMissingKeys ? "Supabase 환경변수 누락" : "Supabase 설정값 오류";
  const description = hasMissingKeys
    ? "Vercel 환경변수 또는 `.env.local`에 아래 키를 설정한 뒤 재배포(또는 개발 서버 재시작)하세요."
    : supabaseConfigError;

  return (
    <main
      style={{
        minHeight: "calc(100vh - 96px)",
        display: "grid",
        placeItems: "center",
        padding: 24,
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: 560,
          border: "1px solid #3a1f28",
          background: "#171215",
          borderRadius: 12,
          padding: 20,
          color: "#f2d1db",
          fontFamily: "sans-serif",
          lineHeight: 1.5,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{title}</h2>
        <p style={{ margin: "10px 0 8px", color: "#c8a9b2", fontSize: 15 }}>
          {description}
        </p>
        <pre
          style={{
            margin: 0,
            background: "#100d0f",
            border: "1px solid #3a1f28",
            borderRadius: 8,
            padding: 12,
            color: "#e8d7dc",
            fontSize: 14,
            overflowX: "auto",
          }}
        >
{missingKeys.join("\n")}
        </pre>
      </section>
    </main>
  );
}

export default function App() {
  const [authLoadingAction, setAuthLoadingAction] = useState(false);
  const [authError, setAuthError] = useState("");
  const { session, loading, signInWithGoogle, signOut } = useSupabaseAuth();

  const handleGoogleLogin = async () => {
    setAuthError("");
    setAuthLoadingAction(true);
    const { error } = await signInWithGoogle();
    if (error) {
      setAuthError(error.message);
    }
    setAuthLoadingAction(false);
  };

  const handleSignOut = async () => {
    setAuthError("");
    setAuthLoadingAction(true);
    const { error } = await signOut();
    if (error) {
      setAuthError(error.message);
    }
    setAuthLoadingAction(false);
  };

  const userEmail = session?.user?.email ?? "";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#1a1a1a",
        fontFamily: "'Arial Black', 'Helvetica Neue', sans-serif",
        color: "#e0ddd4",
      }}
    >
      <header
        style={{
          borderBottom: "2px solid #222",
          padding: "10px 28px 0",
          background: "#1a1a1a",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 10 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, letterSpacing: "-0.04em", display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ color: "#e0ddd4" }}>CAMERA</span>
            <span style={{ color: "#f19eb8" }}>KEYWORD</span>
            <span style={{ fontSize: 14, color: "#333" }}>✦</span>
          </h1>
          <span
            style={{
              fontSize: 10,
              color: "#444",
              letterSpacing: "0.2em",
              fontFamily: "sans-serif",
              textTransform: "uppercase",
            }}
          >
            AI PROMPT GENERATOR
          </span>

          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: "#f19eb8" }} />
              <span style={{ fontSize: 11, color: "#aaa", fontFamily: "sans-serif" }}>샷</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: "#2563eb" }} />
              <span style={{ fontSize: 11, color: "#aaa", fontFamily: "sans-serif" }}>높이</span>
            </div>
            {session ? (
              <>
                <span
                  title={userEmail}
                  style={{
                    maxWidth: 180,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontSize: 12,
                    color: "#8d8d8d",
                    fontFamily: "sans-serif",
                  }}
                >
                  {userEmail}
                </span>
                <button
                  onClick={handleSignOut}
                  disabled={authLoadingAction}
                  style={{
                    fontSize: 12,
                    background: "#222",
                    color: "#e0ddd4",
                    padding: "4px 10px",
                    borderRadius: 20,
                    letterSpacing: "0.06em",
                    fontFamily: "sans-serif",
                    border: "1px solid #333",
                    cursor: authLoadingAction ? "default" : "pointer",
                    fontWeight: 700,
                  }}
                >
                  로그아웃
                </button>
              </>
            ) : null}
          </div>
        </div>
      </header>

      {!isSupabaseConfigured ? <MissingEnvNotice /> : null}
      {isSupabaseConfigured && loading ? (
        <div style={{ padding: 24, color: "#666", fontFamily: "sans-serif", fontSize: 14 }}>인증 상태 확인 중...</div>
      ) : null}
      {isSupabaseConfigured && !loading && !session ? (
        <LoginScreen onGoogleLogin={handleGoogleLogin} loading={authLoadingAction} errorMessage={authError} />
      ) : null}
      {isSupabaseConfigured && !loading && session ? (
        <Suspense
          fallback={
            <div style={{ padding: 24, color: "#666", fontFamily: "sans-serif", fontSize: 14 }}>
              Loading interactive view...
            </div>
          }
        >
          <InteractiveMode />
        </Suspense>
      ) : null}
    </div>
  );
}
