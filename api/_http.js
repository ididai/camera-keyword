const DEFAULT_RETRY_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeJsonParse(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function trimMessage(value, maxLength = 240) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}...`;
}

function extractApiErrorMessage(data, rawText, fallback = "Unexpected API error") {
  const candidates = [
    data?.error?.message,
    data?.error?.msg,
    data?.message,
    data?.msg,
    data?.error,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return trimMessage(candidate);
    }
  }

  if (data && typeof data === "object") {
    try {
      const packed = JSON.stringify(data);
      if (packed && packed !== "{}") return trimMessage(packed);
    } catch {
      // ignore stringify errors
    }
  }

  const textMessage = trimMessage(rawText);
  if (textMessage) return textMessage;
  return fallback;
}

async function fetchJsonWithTimeout(url, options = {}, config = {}) {
  const timeoutMs = Number(config.timeoutMs) > 0 ? Number(config.timeoutMs) : 12_000;
  const retries = Number(config.retries);
  const maxRetry = Number.isFinite(retries) ? Math.max(0, retries) : 0;
  const retryBaseMs = Number(config.retryBaseMs) > 0 ? Number(config.retryBaseMs) : 300;
  const retryStatuses =
    Array.isArray(config.retryStatuses) && config.retryStatuses.length
      ? new Set(config.retryStatuses.map((status) => Number(status)))
      : DEFAULT_RETRY_STATUSES;

  let attempt = 0;
  let lastError = null;

  while (attempt <= maxRetry) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      const text = await response.text();
      const data = safeJsonParse(text);
      const result = {
        ok: response.ok,
        status: response.status,
        data,
        text,
      };

      const shouldRetry = !response.ok && attempt < maxRetry && retryStatuses.has(response.status);
      if (shouldRetry) {
        await wait(retryBaseMs * Math.pow(2, attempt));
        attempt += 1;
        continue;
      }

      return result;
    } catch (error) {
      const isTimeout = error?.name === "AbortError";
      lastError = new Error(isTimeout ? `Request timeout after ${timeoutMs}ms` : error?.message || "Network request failed");
      if (attempt >= maxRetry) throw lastError;
      await wait(retryBaseMs * Math.pow(2, attempt));
      attempt += 1;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError || new Error("Network request failed");
}

module.exports = {
  extractApiErrorMessage,
  fetchJsonWithTimeout,
  safeJsonParse,
};
