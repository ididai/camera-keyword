import { normalizePromptText } from "./promptNormalizer";

const HISTORY_KEY = "ck_prompt_history_v2";
const HISTORY_LIMIT = 30;
let lastHistoryWriteFailed = false;

function safeParse(value, fallback) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function readRaw() {
  if (typeof window === "undefined") return [];
  try {
    return safeParse(window.localStorage.getItem(HISTORY_KEY) || "[]", []);
  } catch {
    return [];
  }
}

function writeRaw(items) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
    lastHistoryWriteFailed = false;
  } catch {
    // ignore storage write errors (private mode/quota exceeded)
    lastHistoryWriteFailed = true;
  }
}

export function getPromptHistory() {
  return readRaw()
    .filter((item) => item && typeof item.text === "string" && item.text.trim())
    .slice(0, HISTORY_LIMIT);
}

export function savePromptHistory({ text, lang = "en", source = "auto" }) {
  const normalized = normalizePromptText(text);
  if (!normalized) return getPromptHistory();

  const current = getPromptHistory();
  const withoutDuplicate = current.filter((item) => item.text.toLowerCase() !== normalized.toLowerCase());

  const next = [
    {
      id: `h_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      text: normalized,
      lang: lang === "kr" ? "kr" : "en",
      source: source === "manual" ? "manual" : "auto",
      updatedAt: Date.now(),
    },
    ...withoutDuplicate,
  ].slice(0, HISTORY_LIMIT);

  writeRaw(next);
  return next;
}

export function removePromptHistory(id) {
  const next = getPromptHistory().filter((item) => item.id !== id);
  writeRaw(next);
  return next;
}

export function didLastHistoryWriteFail() {
  return lastHistoryWriteFailed;
}
