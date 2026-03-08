function withAuthHeaders(accessToken, headers = {}) {
  return {
    ...headers,
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
}

export async function fetchWithTimeout(url, options = {}, timeoutMs = 12_000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("요청 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function readApiJson(response, fallbackError) {
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();

  if (contentType.includes("application/json")) {
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || fallbackError);
    }
    return payload;
  }

  const rawText = await response.text();
  const looksLikeHtml = rawText.includes("<!DOCTYPE") || rawText.includes("<html");
  if (looksLikeHtml) {
    throw new Error("API 서버가 실행되지 않았습니다. npm run dev 또는 npx vercel dev --listen 3000 으로 실행해 주세요.");
  }

  if (!response.ok) {
    throw new Error(fallbackError);
  }

  try {
    return JSON.parse(rawText || "{}");
  } catch {
    throw new Error("API 응답 파싱 실패");
  }
}

export async function requestSubjectTranslate({ text, accessToken }) {
  const response = await fetchWithTimeout("/api/translate", {
    method: "POST",
    headers: withAuthHeaders(accessToken, {
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({ text }),
  });

  const payload = await readApiJson(response, "번역 요청 실패");
  const translatedText = String(payload?.translatedText || "").trim();
  if (!translatedText) {
    throw new Error("번역 결과가 비어 있습니다.");
  }

  return translatedText;
}

export async function requestPromptRefine({ accessToken, payload, timeoutMs = 20_000 }) {
  const response = await fetchWithTimeout(
    "/api/refine-prompt",
    {
      method: "POST",
      headers: withAuthHeaders(accessToken, {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify(payload),
    },
    timeoutMs,
  );

  return readApiJson(response, "다듬기 API 요청 실패");
}
