module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_TRANSLATE_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Missing GEMINI_API_KEY" });
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

  try {
    const geminiRes = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text:
                    "Translate Korean text to natural English for an image prompt. " +
                    "Return only translated English text without quotes.\n\n" +
                    `Input: ${text}`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 256,
          },
        }),
      },
    );

    const data = await geminiRes.json();
    if (!geminiRes.ok) {
      const message = data?.error?.message || "Gemini API request failed";
      return res.status(geminiRes.status).json({ error: message });
    }

    const translatedText = data?.candidates?.[0]?.content?.parts
      ?.map((part) => part?.text || "")
      .join(" ")
      .trim();

    if (!translatedText) {
      return res.status(502).json({ error: "No translation returned" });
    }

    return res.status(200).json({ translatedText });
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Unexpected translation error" });
  }
};
