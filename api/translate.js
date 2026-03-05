module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  const googleTranslateKey = process.env.GOOGLE_TRANSLATE_KEY;
  if (!geminiKey && !googleTranslateKey) {
    return res.status(500).json({ error: "Missing GEMINI_API_KEY or GOOGLE_TRANSLATE_KEY" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON body" });
    }
  }

  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) {
    return res.status(400).json({ error: "text is required" });
  }

  const hasKorean = (value) => /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(value);
  const cleanTranslation = (value) =>
    value
      .replace(/^["']|["']$/g, "")
      .replace(/^translation\s*:\s*/i, "")
      .trim();

  const translateWithGemini = async () => {
    if (!geminiKey) return null;
    const geminiRes = await fetch(
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
                  "You are a translation engine. Translate Korean to natural English for image prompts. " +
                  "Return only English translation text.",
              },
            ],
          },
          contents: [
            {
              role: "user",
              parts: [{ text }],
            },
          ],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 256,
          },
        }),
      },
    );

    const data = await geminiRes.json();
    if (!geminiRes.ok) {
      const message = data?.error?.message || "Gemini API request failed";
      throw new Error(message);
    }

    const raw = data?.candidates?.[0]?.content?.parts
      ?.map((part) => part?.text || "")
      .join(" ")
      .trim();
    const translatedText = raw ? cleanTranslation(raw) : "";
    return translatedText || null;
  };

  const translateWithGoogle = async () => {
    if (!googleTranslateKey) return null;
    const googleRes = await fetch(
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
    );
    const data = await googleRes.json();
    if (!googleRes.ok) {
      const message = data?.error?.message || "Google Translate API request failed";
      throw new Error(message);
    }
    const translatedText = data?.data?.translations?.[0]?.translatedText?.trim();
    return translatedText || null;
  };

  try {
    let translatedText = null;
    let lastError = null;

    try {
      translatedText = await translateWithGemini();
      // Gemini 결과에 한글이 섞이면 Google로 한 번 더 번역 시도
      if (translatedText && hasKorean(translatedText) && googleTranslateKey) {
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

    if (!translatedText) {
      return res.status(502).json({
        error: lastError?.message || "No translation returned",
      });
    }

    return res.status(200).json({ translatedText });
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Unexpected translation error" });
  }
};
