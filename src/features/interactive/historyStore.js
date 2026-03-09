import { normalizePromptText, normalizeSentenceText } from "./promptNormalizer";

const HISTORY_KEY = "ck_prompt_history_v2";
const HISTORY_LIMIT = 30;
let lastHistoryWriteFailed = false;
const PROMPT_FORMATS = new Set(["keyword", "sentence"]);

function normalizePromptFormat(value) {
  const format = String(value || "").trim().toLowerCase();
  return PROMPT_FORMATS.has(format) ? format : "keyword";
}

function buildStorageKey(scope = "") {
  const suffix = String(scope || "").trim();
  return suffix ? `${HISTORY_KEY}:${suffix}` : HISTORY_KEY;
}

function safeParse(value, fallback) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function sanitizeHistoryItem(input) {
  if (!input || typeof input !== "object") return null;

  const format = normalizePromptFormat(input.format);
  const text = format === "sentence"
    ? normalizeSentenceText(input.text)
    : normalizePromptText(input.text);
  if (!text) return null;

  return {
    id: String(input.id || `h_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`),
    text,
    format,
    lang: input.lang === "kr" ? "kr" : "en",
    source: input.source === "manual" ? "manual" : "auto",
    updatedAt: Number(input.updatedAt) || Date.now(),
  };
}

function sanitizeHistoryItems(items) {
  if (!Array.isArray(items)) return [];

  const unique = [];
  const seen = new Set();

  items.forEach((item) => {
    const sanitized = sanitizeHistoryItem(item);
    if (!sanitized) return;
    const key = `${sanitized.format}:${sanitized.text.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(sanitized);
  });

  return unique.slice(0, HISTORY_LIMIT);
}

function readRaw(scope = "") {
  if (typeof window === "undefined") return [];
  try {
    return safeParse(window.localStorage.getItem(buildStorageKey(scope)) || "[]", []);
  } catch {
    return [];
  }
}

function writeRaw(items, scope = "") {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(buildStorageKey(scope), JSON.stringify(items));
    lastHistoryWriteFailed = false;
  } catch {
    // ignore storage write errors (private mode/quota exceeded)
    lastHistoryWriteFailed = true;
  }
}

export function getPromptHistory(scope = "") {
  return sanitizeHistoryItems(readRaw(scope));
}

export function replacePromptHistory(items, scope = "") {
  const next = sanitizeHistoryItems(items);
  writeRaw(next, scope);
  return next;
}

export function savePromptHistory(
  { text, lang = "en", source = "auto", format = "keyword" },
  scope = "",
) {
  const normalizedFormat = normalizePromptFormat(format);
  const normalized =
    normalizedFormat === "sentence" ? normalizeSentenceText(text) : normalizePromptText(text);
  if (!normalized) return getPromptHistory(scope);

  const current = getPromptHistory(scope);
  const withoutDuplicate = current.filter(
    (item) =>
      item.text.toLowerCase() !== normalized.toLowerCase() ||
      normalizePromptFormat(item.format) !== normalizedFormat,
  );

  return replacePromptHistory(
    [
      {
        id: `h_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        text: normalized,
        format: normalizedFormat,
        lang: lang === "kr" ? "kr" : "en",
        source: source === "manual" ? "manual" : "auto",
        updatedAt: Date.now(),
      },
      ...withoutDuplicate,
    ],
    scope,
  );
}

export function removePromptHistory(id, scope = "") {
  const next = getPromptHistory(scope).filter((item) => item.id !== id);
  return replacePromptHistory(next, scope);
}

export function clearPromptHistory(scope = "") {
  writeRaw([], scope);
  return [];
}

export function didLastHistoryWriteFail() {
  return lastHistoryWriteFailed;
}
