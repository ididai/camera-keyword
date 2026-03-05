export default function LoginScreen({ onGoogleLogin, loading, errorMessage }) {
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
          maxWidth: 420,
          border: "1px solid #2b2b2b",
          borderRadius: 14,
          padding: 24,
          background: "#121212",
          boxShadow: "0 12px 30px rgba(0, 0, 0, 0.35)",
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: 23,
            fontWeight: 900,
            letterSpacing: "-0.02em",
            color: "#f2f2f2",
          }}
        >
          Google 로그인
        </h2>
        <p
          style={{
            margin: "10px 0 18px",
            color: "#a3a3a3",
            fontSize: 14,
            lineHeight: 1.5,
            fontFamily: "sans-serif",
          }}
        >
          Supabase OAuth를 통해 Google 계정으로만 로그인합니다.
        </p>

        <button
          type="button"
          onClick={onGoogleLogin}
          disabled={loading}
          style={{
            width: "100%",
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid #3a3a3a",
            background: loading ? "#1e1e1e" : "#ffffff",
            color: loading ? "#777" : "#111",
            fontWeight: 800,
            fontSize: 15,
            cursor: loading ? "default" : "pointer",
            transition: "all 0.15s",
          }}
        >
          {loading ? "진행 중..." : "Google로 로그인"}
        </button>

        {errorMessage ? (
          <p
            style={{
              marginTop: 12,
              color: "#f19eb8",
              fontSize: 13,
              fontFamily: "sans-serif",
              lineHeight: 1.4,
            }}
          >
            {errorMessage}
          </p>
        ) : null}
      </section>
    </main>
  );
}
