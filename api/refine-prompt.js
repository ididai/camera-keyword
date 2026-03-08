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
  const usageContext = createRequestUsageContext("refine_prompt");
  const reply = (status, payload) => {
    const summary = recordRequestUsage("refine_prompt", {
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
    recordApiResult("refine_prompt", status, Date.now() - startedAt);
    return res.status(status).json(payload);
  };

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return reply(405, { error: "Method not allowed" });
  }

  const guard = await enforceApiGuard(req, res, {
    routeKey: "refine_prompt",
    limit: 20,
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
  if (!geminiKey) {
    return reply(500, { error: "Missing GEMINI_API_KEY" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return reply(400, { error: "Invalid JSON body" });
    }
  }

  const asText = (value) => String(value || "").trim();
  const lang = asText(body?.lang) === "kr" ? "kr" : "en";
  const includeAngle = body?.includeAngle !== false;

  const payload = {
    subjectText: asText(body?.subjectText),
    customText: asText(body?.customText),
    shot: asText(body?.shot),
    height: asText(body?.height),
    direction: asText(body?.direction),
    gaze: asText(body?.gaze),
    composition: asText(body?.composition),
    ratioFraming: asText(body?.ratioFraming),
    arValue: asText(body?.arValue),
  };

  if (!payload.subjectText && !payload.customText) {
    return reply(400, { error: "subjectText or customText is required" });
  }

  const cleanModelText = (value) =>
    String(value || "")
      .replace(/^["']|["']$/g, "")
      .replace(/^translation\s*:\s*/i, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  const hasKorean = (value) => /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(value || "");
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

  const parseModelJson = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return null;

    const stripFence = (text) =>
      String(text || "")
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();
    const parseLooseString = (token) =>
      cleanModelText(
        String(token || "")
          .replace(/^["']|["']$/g, "")
          .replace(/\\n/g, " ")
          .replace(/\\t/g, " ")
          .replace(/\\"/g, '"')
          .replace(/\\'/g, "'"),
      );
    const extractLooseFields = (text) => {
      const fields = {};
      const regex = /"?(subjectText|customText)"?\s*:\s*("(?:\\.|[^"])*"|'(?:\\.|[^'])*'|[^,\n}]+)/gi;
      let matched = false;
      let match;
      while ((match = regex.exec(text)) !== null) {
        matched = true;
        const key = String(match[1] || "");
        fields[key] = parseLooseString(match[2]);
      }
      return matched ? fields : null;
    };

    const candidates = [];
    candidates.push(raw);
    const withoutFence = stripFence(raw);
    if (withoutFence && withoutFence !== raw) candidates.push(withoutFence);
    for (const candidate of candidates) {
      try {
        return JSON.parse(candidate);
      } catch {
        const start = candidate.indexOf("{");
        const end = candidate.lastIndexOf("}");
        if (start >= 0 && end > start) {
          const sliced = candidate.slice(start, end + 1);
          try {
            return JSON.parse(sliced);
          } catch {
            const loose = extractLooseFields(sliced);
            if (loose) return loose;
          }
        }
      }
    }

    return extractLooseFields(withoutFence || raw);
  };

  const CUSTOM_CAMERA_DIRECTIVE_PATTERNS = [
    /\b--ar\s*\d+(?:\.\d+)?:\d+(?:\.\d+)?\b/i,
    /\b(?:extreme\s+wide|wide|medium|close[-\s]?up|extreme\s+close[-\s]?up)\s+shot\b/i,
    /\b(?:eye[-\s]?level|high\s+angle|low[-\s]?angle|top[-\s]?down|overhead)\b/i,
    /\b(?:front|rear|side)\s+(?:view|profile)\b/i,
    /\b(?:45-degree oblique view|over-the-shoulder)\b/i,
    /\bsubject\s+(?:centered in frame|at (?:left|right|upper|lower).+third)\b/i,
    /\b(?:vertical|portrait|cinematic wide)\s+framing\b/i,
    /\blooking\s+directly\s+at\s+camera\b/i,
    /\blooking\s+(?:left|right|up|down|up-left|up-right|down-left|down-right)\b/i,
    /\blooking\s+back(?:\s+(?:at\s+camera|to\s+the\s+(?:left|right)|up|down|up-left|up-right|down-left|down-right))?\b/i,
    /\blook(?:ing)?\s+back\b/i,
    /\b(?:turn(?:ing)?|turned|glanc(?:e|ing|ed)|facing)\s+back\b/i,
    /\b(?:turn(?:ing)?|turned)\s+around\b/i,
    /\bover(?:\s+the)?\s+shoulder\b/i,
    /뒤를?\s*돌아보(?:는|며|고|기|는\s*중|는중)?/i,
    /뒤돌아보(?:는|며|고|기|는\s*중|는중)?/i,
    /카메라\s*(?:정면\s*)?응시/i,
  ];

  const cameraLockTerms = [
    payload.shot,
    includeAngle ? payload.height : "",
    includeAngle ? payload.direction : "",
    includeAngle ? payload.gaze : "",
    payload.composition,
    payload.ratioFraming,
    payload.arValue ? `--ar ${payload.arValue}` : "",
  ].filter(Boolean);
  const cameraLockSet = new Set(
    cameraLockTerms.map((term) =>
      cleanModelText(term)
        .toLowerCase()
        .replace(/\s{2,}/g, " ")
        .trim(),
    ),
  );

  const sanitizeCustomText = (value) => {
    const normalized = cleanModelText(value);
    if (!normalized) return "";
    const chunks = normalized
      .split(/[,\n/]+/)
      .map((chunk) => cleanModelText(chunk))
      .filter(Boolean);
    if (!chunks.length) return "";
    const filtered = chunks.filter((chunk) => {
      const lower = chunk.toLowerCase();
      if (cameraLockSet.has(lower)) return false;
      if (/^(?:looking|look|turning|turned|glancing|facing)$/.test(lower)) return false;
      return !CUSTOM_CAMERA_DIRECTIVE_PATTERNS.some((pattern) => pattern.test(lower));
    });
    return filtered.join(", ");
  };

  const normalizeCompareText = (value) =>
    cleanModelText(value)
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, "");

  const removeCustomOverlap = (subjectText, customText) => {
    const subject = cleanModelText(subjectText);
    const custom = cleanModelText(customText);
    if (!subject || !custom) return custom;

    const subjectNorm = normalizeCompareText(subject);
    if (!subjectNorm) return custom;

    const filtered = custom
      .split(/[,\n/]+/)
      .map((chunk) => cleanModelText(chunk))
      .filter(Boolean)
      .filter((chunk) => {
        const chunkNorm = normalizeCompareText(chunk);
        if (!chunkNorm) return false;
        if (chunkNorm === subjectNorm) return false;
        if (chunkNorm.length >= 20 && subjectNorm.includes(chunkNorm)) return false;
        return true;
      });

    return filtered.join(", ");
  };

  const isLikelyLossyRefinement = (sourceText, candidateText) => {
    const source = cleanModelText(sourceText);
    const candidate = cleanModelText(candidateText);
    if (!source) return false;
    if (!candidate) return true;

    const sourceChars = source.replace(/\s+/g, "").length;
    const candidateChars = candidate.replace(/\s+/g, "").length;
    if (sourceChars >= 20 && candidateChars < Math.max(12, Math.floor(sourceChars * 0.6))) {
      return true;
    }

    const sourceWords = source.split(/\s+/).filter(Boolean).length;
    const candidateWords = candidate.split(/\s+/).filter(Boolean).length;
    if (sourceWords >= 5 && candidateWords < Math.max(2, Math.floor(sourceWords * 0.5))) {
      return true;
    }

    return false;
  };

  const translateWithGemini = async (text, { strictRetry = false } = {}) => {
    const source = cleanModelText(text);
    if (!source) return "";
    const promptText = strictRetry
      ? `Re-translate fully into English without omissions:\n\n${source}`
      : source;
    const budget = await reserveModelCallBudget(usageContext, {
      provider: "gemini",
      promptText,
      maxOutputTokens: 256,
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
                    "You are a strict Korean-to-English translator for image prompt text. " +
                    "Preserve all meaning and return only final English text.",
                },
              ],
            },
            contents: [
              {
                role: "user",
                parts: [{ text: promptText }],
              },
            ],
            generationConfig: {
              temperature: 0,
              maxOutputTokens: 256,
            },
          }),
        },
        {
          timeoutMs: 11_000,
          retries: strictRetry ? 2 : 1,
        },
      );
      if (!ok) {
        throw new Error(extractApiErrorMessage(data, rawText, "Gemini translation failed"));
      }

      const raw = data?.candidates?.[0]?.content?.parts
        ?.map((part) => part?.text || "")
        .join(" ")
        .trim();

      return cleanModelText(raw || "");
    } catch (error) {
      markModelCallFailure(usageContext);
      throw error;
    }
  };

  const translateWithGoogle = async (text) => {
    if (!googleTranslateKey) return "";
    const source = cleanModelText(text);
    if (!source) return "";
    const budget = await reserveModelCallBudget(usageContext, {
      provider: "google_translate",
      promptText: source,
      maxOutputTokens: 256,
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
            q: source,
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
        throw new Error(extractApiErrorMessage(data, rawText, "Google translation failed"));
      }
      return cleanModelText(data?.data?.translations?.[0]?.translatedText || "");
    } catch (error) {
      markModelCallFailure(usageContext);
      throw error;
    }
  };

  const ensureEnglish = async (value) => {
    const source = cleanModelText(value);
    if (!source) return "";
    if (lang !== "en" || !hasKorean(source)) return source;

    let translated = "";
    try {
      translated = await translateWithGemini(source);
      if (translated && hasKorean(translated)) {
        const retried = await translateWithGemini(source, { strictRetry: true });
        if (retried) translated = retried;
      }
    } catch {
      translated = "";
    }

    if ((!translated || hasKorean(translated)) && googleTranslateKey) {
      try {
        translated = await translateWithGoogle(source);
      } catch {
        // keep fallback below
      }
    }

    return cleanModelText(translated || source);
  };

  const userPrompt = [
    `OUTPUT_LANGUAGE=${lang === "kr" ? "Korean" : "English"}`,
    "TASK=Refine only subject/custom phrases for an image prompt.",
    "CRITICAL_RULE_1=Do not omit any object, person, relationship, action, direction, or place from SUBJECT_TEXT.",
    "CRITICAL_RULE_2=Do not summarize SUBJECT_TEXT.",
    "CRITICAL_RULE_3=Do not inject camera terms into subject/custom.",
    "CRITICAL_RULE_4=Keep wording concise but complete.",
    "CRITICAL_RULE_5=If OUTPUT_LANGUAGE is English, fully translate all Korean text to English.",
    "Return JSON only with keys subjectText and customText.",
    "",
    `SUBJECT_TEXT="""${payload.subjectText}"""`,
    `CUSTOM_TEXT="""${payload.customText}"""`,
    `LOCKED_CAMERA_TERMS="""${cameraLockTerms.join(", ")}"""`,
    "",
    `JSON_FORMAT={"subjectText":"...", "customText":"..."}`,
  ].join("\n");

  const requestRefine = async (strictJsonRetry = false) => {
    const retryHint = strictJsonRetry
      ? "\nSTRICT_JSON_OUTPUT=Return one-line JSON only. No markdown, no code fence, no explanation."
      : "";
    const promptText = `${userPrompt}${retryHint}`;
    const budget = await reserveModelCallBudget(usageContext, {
      provider: "gemini_refine",
      promptText,
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
                    "You are a prompt refiner. Keep semantic fidelity with zero omissions. " +
                    "Return strict JSON only.",
                },
              ],
            },
            contents: [
              {
                role: "user",
                parts: [{ text: promptText }],
              },
            ],
            generationConfig: strictJsonRetry
              ? {
                  temperature: 0,
                  maxOutputTokens: 512,
                }
              : {
                  temperature: 0.2,
                  maxOutputTokens: 512,
                  responseMimeType: "application/json",
                },
          }),
        },
        {
          timeoutMs: 12_000,
          retries: strictJsonRetry ? 2 : 1,
        },
      );
      if (!ok) {
        throw new Error(extractApiErrorMessage(data, rawText, "Prompt refine API request failed"));
      }
      return String(
        data?.candidates?.[0]?.content?.parts
          ?.map((part) => part?.text || "")
          .join(" ")
          .trim() || "",
      );
    } catch (error) {
      markModelCallFailure(usageContext);
      throw error;
    }
  };

  try {
    let parsed = null;
    let raw = "";
    try {
      raw = await requestRefine(false);
      parsed = parseModelJson(raw);
    } catch {
      parsed = null;
    }

    if (!parsed) {
      try {
        raw = await requestRefine(true);
        parsed = parseModelJson(raw);
      } catch {
        parsed = null;
      }
    }

    const parsedSubject = typeof parsed?.subjectText === "string" ? parsed.subjectText : payload.subjectText;
    const parsedCustom = typeof parsed?.customText === "string" ? parsed.customText : payload.customText;

    const fallbackSubject = await ensureEnglish(payload.subjectText);
    let refinedSubject = await ensureEnglish(cleanModelText(parsedSubject));
    if (isLikelyLossyRefinement(fallbackSubject || payload.subjectText, refinedSubject)) {
      refinedSubject = fallbackSubject || payload.subjectText;
    }

    const parsedCustomEmpty =
      typeof parsed?.customText === "string" && cleanModelText(parsed.customText) === "";
    const customSource = parsedCustomEmpty
      ? ""
      : isLikelyLossyRefinement(payload.customText, parsedCustom)
      ? payload.customText
      : parsedCustom;

    let refinedCustom = sanitizeCustomText(customSource);
    refinedCustom = await ensureEnglish(refinedCustom);
    refinedCustom = removeCustomOverlap(refinedSubject, refinedCustom);

    return reply(200, {
      subjectText: refinedSubject || payload.subjectText,
      customText: refinedCustom,
    });
  } catch (error) {
    const status = toStatusCode(error, 500);
    return reply(status, toErrorPayload(error, "Unexpected prompt refine error"));
  }
};
