module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GOOGLE_TRANSLATE_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Missing GOOGLE_TRANSLATE_KEY" });
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
    const googleRes = await fetch(
      `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`,
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
      return res.status(googleRes.status).json({ error: message });
    }

    const translatedText = data?.data?.translations?.[0]?.translatedText?.trim();
    if (!translatedText) {
      return res.status(502).json({ error: "No translation returned" });
    }

    return res.status(200).json({ translatedText });
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Unexpected translation error" });
  }
};
