const { enforceApiGuard } = require("./_guard");
const { extractApiErrorMessage, fetchJsonWithTimeout } = require("./_http");
const { recordApiResult } = require("./_slo");
const {
  createRequestUsageContext,
  markModelCallFailure,
  recordRequestUsage,
  reserveModelCallBudget,
} = require("./_usage");

module.exports = async function handler(req, res) {
  const startedAt = Date.now();
  const usageContext = createRequestUsageContext("translate");
  const reply = (status, payload) => {
    const summary = recordRequestUsage("translate", {
      status,
      usageContext,
      latencyMs: Date.now() - startedAt,
    });
    if (status === 429 && payload?.retryAfterSec) {
      res.setHeader("Retry-After", String(payload.retryAfterSec));
    }
    res.setHeader("X-Usage-Model-Calls", String(usageContext.modelCalls));
    res.setHeader(
      "X-Usage-Estimated-Tokens",
      String(usageContext.estimatedPromptTokens + usageContext.estimatedCompletionTokens),
    );
    res.setHeader("X-Usage-Failure-Rate", String(Number(summary?.failureRate || 0).toFixed(4)));
    recordApiResult("translate", status, Date.now() - startedAt);
    return res.status(status).json(payload);
  };

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return reply(405, { error: "Method not allowed" });
  }

  const guard = await enforceApiGuard(req, res, {
    routeKey: "translate",
    limit: 30,
    windowMs: 60_000,
    respond: false,
  });
  if (!guard.ok) {
    return reply(guard.status || 401, {
      error: guard.error || "Unauthorized API request",
      retryAfterSec: guard.retryAfterSec || undefined,
    });
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  const googleTranslateKey = process.env.GOOGLE_TRANSLATE_KEY;
  if (!geminiKey && !googleTranslateKey) {
    return reply(500, { error: "Missing GEMINI_API_KEY or GOOGLE_TRANSLATE_KEY" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return reply(400, { error: "Invalid JSON body" });
    }
  }

  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) {
    return reply(400, { error: "text is required" });
  }

  const hasKorean = (value) => /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(value);
  const countClauses = (value) =>
    String(value || "")
      .split(/[.!?。！？]/)
      .map((item) => item.trim())
      .filter(Boolean).length;
  const isLikelyTruncated = (sourceText, translatedText) => {
    const source = String(sourceText || "").trim();
    const translated = String(translatedText || "").trim();
    if (!source || !translated) return true;

    const sourceChars = source.replace(/\s+/g, "").length;
    const translatedChars = translated.replace(/\s+/g, "").length;
    if (sourceChars >= 28 && translatedChars < Math.max(18, Math.floor(sourceChars * 0.42))) {
      return true;
    }

    const sourceClauses = countClauses(source);
    const translatedClauses = countClauses(translated);
    if (sourceClauses >= 2 && translatedClauses < sourceClauses - 1) {
      return true;
    }

    const sourceCommaCount = (source.match(/,/g) || []).length;
    const translatedCommaCount = (translated.match(/,/g) || []).length;
    if (sourceCommaCount >= 2 && translatedCommaCount === 0 && translatedChars < sourceChars) {
      return true;
    }

    return false;
  };
  const cleanTranslation = (value) =>
    value
      .replace(/^["']|["']$/g, "")
      .replace(/^translation\s*:\s*/i, "")
      .trim();

  const translateWithGemini = async ({ strictRetry = false } = {}) => {
    if (!geminiKey) return null;
    const inputText = strictRetry
      ? `Re-translate this Korean text fully. Your previous answer omitted details.\n\n${text}`
      : text;
    const budget = await reserveModelCallBudget(usageContext, {
      provider: "gemini",
      promptText: inputText,
      maxOutputTokens: 512,
    });
    if (!budget.ok) {
      throw {
        message: budget.error || "Token budget exceeded",
        statusCode: budget.status || 429,
        retryAfterSec: budget.retryAfterSec || 1,
      };
    }

    try {
      const { ok, data, text: rawText } = await fetchJsonWithTimeout(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": geminiKey,
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [
                {
                  text:
                    "You are a strict Korean-to-English translation engine for image prompts. " +
                    "Never summarize or omit details. Preserve every object, relationship, action, and location. " +
                    "Return only the full English translation text without labels.",
                },
              ],
            },
            contents: [
              {
                role: "user",
                parts: [{ text: inputText }],
              },
            ],
            generationConfig: {
              temperature: 0,
              maxOutputTokens: 512,
            },
          }),
        },
        {
          timeoutMs: 11_000,
          retries: strictRetry ? 2 : 1,
        },
      );
      if (!ok) {
        throw new Error(extractApiErrorMessage(data, rawText, "Gemini API request failed"));
      }

      const raw = data?.candidates?.[0]?.content?.parts
        ?.map((part) => part?.text || "")
        .join(" ")
        .trim();
      const translatedText = raw ? cleanTranslation(raw) : "";
      return translatedText || null;
    } catch (error) {
      markModelCallFailure(usageContext);
      throw error;
    }
  };

  const translateWithGoogle = async () => {
    if (!googleTranslateKey) return null;
    const budget = await reserveModelCallBudget(usageContext, {
      provider: "google_translate",
      promptText: text,
      maxOutputTokens: 384,
    });
    if (!budget.ok) {
      throw {
        message: budget.error || "Token budget exceeded",
        statusCode: budget.status || 429,
        retryAfterSec: budget.retryAfterSec || 1,
      };
    }

    try {
      const { ok, data, text: rawText } = await fetchJsonWithTimeout(
        `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(
          googleTranslateKey,
        )}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            q: text,
            source: "ko",
            target: "en",
            format: "text",
          }),
        },
        {
          timeoutMs: 10_000,
          retries: 1,
        },
      );
      if (!ok) {
        throw new Error(extractApiErrorMessage(data, rawText, "Google Translate API request failed"));
      }
      const translatedText = data?.data?.translations?.[0]?.translatedText?.trim();
      return translatedText || null;
    } catch (error) {
      markModelCallFailure(usageContext);
      throw error;
    }
  };

  const toStatusCode = (error, fallback = 500) => {
    const statusCode = Number(error?.["statusCode"] || error?.["status"]);
    if (Number.isFinite(statusCode) && statusCode >= 400 && statusCode < 600) return statusCode;
    return fallback;
  };

  const toErrorPayload = (error, fallback) => {
    if (!error) return { error: fallback };
    const payload = {
      error: error?.["message"] || fallback,
    };
    if (error?.["retryAfterSec"]) {
      payload.retryAfterSec = Number(error["retryAfterSec"]) || 1;
    }
    return payload;
  };

  try {
    let translatedText = null;
    let lastError = null;
    let geminiAttempted = false;

    try {
      translatedText = await translateWithGemini();
      geminiAttempted = Boolean(translatedText);
      if (translatedText && isLikelyTruncated(text, translatedText)) {
        const retried = await translateWithGemini({ strictRetry: true });
        if (retried) {
          translatedText = retried;
        }
      }
      // Gemini 결과에 한글이 섞이면 Google로 한 번 더 번역 시도
      if (translatedText && hasKorean(translatedText) && googleTranslateKey) {
        translatedText = await translateWithGoogle();
      }
      if (translatedText && isLikelyTruncated(text, translatedText) && googleTranslateKey) {
        translatedText = await translateWithGoogle();
      }
    } catch (error) {
      lastError = error;
    }

    if (!translatedText && googleTranslateKey) {
      try {
        translatedText = await translateWithGoogle();
      } catch (error) {
        lastError = error;
      }
    }

    // Google 키가 없는 환경에서 Gemini 결과가 축약 의심이면 한 번 더 강제 재시도
    if (translatedText && !googleTranslateKey && geminiAttempted && isLikelyTruncated(text, translatedText)) {
      const retried = await translateWithGemini({ strictRetry: true });
      if (retried) translatedText = retried;
    }

    if (!translatedText) {
      const status = toStatusCode(lastError, 502);
      return reply(status, toErrorPayload(lastError, "No translation returned"));
    }

    if (isLikelyTruncated(text, translatedText)) {
      return reply(502, {
        error: "Translation appears incomplete. Please retry.",
      });
    }

    return reply(200, { translatedText });
  } catch (error) {
    const status = toStatusCode(error, 500);
    return reply(status, toErrorPayload(error, "Unexpected translation error"));
  }
};
