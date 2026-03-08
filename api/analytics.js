const MAX_EVENT_COUNT = 50;
const MAX_NAME_LENGTH = 64;
const MAX_PROP_COUNT = 24;
const MAX_STRING_LENGTH = 200;
const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeString(value, maxLength = MAX_STRING_LENGTH) {
  const clean = String(value || "").trim().replace(EMAIL_REGEX, "[redacted-email]");
  if (!clean) return "";
  return clean.length <= maxLength ? clean : clean.slice(0, maxLength);
}

function sanitizeValue(value, depth = 0) {
  if (value == null) return undefined;
  if (typeof value === "string") return sanitizeString(value);
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? Number(value.toFixed(3)) : undefined;
  if (depth > 1) return undefined;

  if (Array.isArray(value)) {
    const cleaned = value
      .slice(0, 12)
      .map((item) => sanitizeValue(item, depth + 1))
      .filter((item) => item !== undefined);
    return cleaned.length ? cleaned : undefined;
  }

  if (isPlainObject(value)) {
    const out = {};
    Object.entries(value)
      .slice(0, MAX_PROP_COUNT)
      .forEach(([key, item]) => {
        const safeKey = String(key || "")
          .trim()
          .replace(/[^a-zA-Z0-9_.-]/g, "_")
          .slice(0, 40);
        if (!safeKey) return;
        const safeValue = sanitizeValue(item, depth + 1);
        if (safeValue !== undefined) out[safeKey] = safeValue;
      });
    return Object.keys(out).length ? out : undefined;
  }

  return undefined;
}

function normalizeEvent(raw) {
  if (!isPlainObject(raw)) return null;

  const rawName = sanitizeString(raw.name || "", MAX_NAME_LENGTH)
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, "_");
  if (!rawName) return null;

  const ts = Number(raw.ts);
  const normalized = {
    name: rawName,
    ts: Number.isFinite(ts) ? Math.round(ts) : Date.now(),
  };

  const path = sanitizeString(raw.path || "", 120);
  if (path) normalized.path = path;

  const sessionId = sanitizeString(raw.sessionId || "", 80);
  if (sessionId) normalized.sessionId = sessionId;

  const anonymousId = sanitizeString(raw.anonymousId || "", 80);
  if (anonymousId) normalized.anonymousId = anonymousId;

  const props = sanitizeValue(raw.props, 0);
  if (props && isPlainObject(props) && Object.keys(props).length) {
    normalized.props = props;
  }

  return normalized;
}

function extractEvents(body) {
  if (Array.isArray(body)) return body;
  if (isPlainObject(body)) {
    if (Array.isArray(body.events)) return body.events;
    if (isPlainObject(body.event)) return [body.event];
  }
  return [];
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

async function parseBody(req) {
  if (isPlainObject(req.body) || Array.isArray(req.body)) return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      throw new Error("Invalid JSON body");
    }
  }

  const raw = await readRawBody(req);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON body");
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = await parseBody(req);
    const events = extractEvents(body).map(normalizeEvent).filter(Boolean).slice(0, MAX_EVENT_COUNT);

    if (!events.length) {
      return res.status(400).json({ error: "events are required" });
    }

    const payload = {
      receivedAt: new Date().toISOString(),
      source: "camera-keyword-web",
      request: {
        ip: String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || null,
        userAgent: sanitizeString(req.headers["user-agent"] || "", 180) || null,
      },
      events,
    };

    const webhookUrl = process.env.ANALYTICS_WEBHOOK_URL;
    const webhookToken = process.env.ANALYTICS_WEBHOOK_TOKEN;

    if (webhookUrl) {
      try {
        const headers = {
          "Content-Type": "application/json",
        };
        if (webhookToken) {
          headers.Authorization = `Bearer ${webhookToken}`;
        }

        const forwarded = await fetch(webhookUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });

        if (!forwarded.ok) {
          console.error(
            "[analytics] webhook forward failed",
            forwarded.status,
            forwarded.statusText || "unknown",
          );
          return res.status(202).json({ accepted: events.length, forwarded: false });
        }
      } catch (error) {
        console.error("[analytics] webhook forward error", error?.message || error);
        return res.status(202).json({ accepted: events.length, forwarded: false });
      }
    } else {
      console.log("[analytics]", JSON.stringify(payload));
    }

    return res.status(200).json({ accepted: events.length, forwarded: Boolean(webhookUrl) });
  } catch (error) {
    return res.status(400).json({ error: error?.message || "Unexpected analytics error" });
  }
};

