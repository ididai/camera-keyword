const INTERACTIVE_SETTINGS_KEY = "ck_interactive_settings_v1";
const MAX_HINT_LENGTH = 120;
const MAX_ID_LENGTH = 40;

export const SUBJECT_COUNT_VALUES = ["single", "pair", "group"];

export const DEFAULT_INTERACTIVE_SETTINGS = {
  poseId: "",
  compositionId: "",
  subjectCount: "single",
  customPromptHint: "",
  updatedAt: 0,
};

function safeParse(value, fallback) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function normalizeId(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_.-]/g, "")
    .slice(0, MAX_ID_LENGTH);
}

function normalizeSubjectCount(value) {
  const candidate = String(value || "").trim().toLowerCase();
  return SUBJECT_COUNT_VALUES.includes(candidate) ? candidate : DEFAULT_INTERACTIVE_SETTINGS.subjectCount;
}

function normalizeHint(value) {
  return String(value || "").trim().slice(0, MAX_HINT_LENGTH);
}

function sanitizeSettings(input) {
  if (!input || typeof input !== "object") {
    return { ...DEFAULT_INTERACTIVE_SETTINGS };
  }

  return {
    poseId: normalizeId(input.poseId),
    compositionId: normalizeId(input.compositionId),
    subjectCount: normalizeSubjectCount(input.subjectCount),
    customPromptHint: normalizeHint(input.customPromptHint),
    updatedAt: Number(input.updatedAt) || Date.now(),
  };
}

function readRaw() {
  if (typeof window === "undefined") return { ...DEFAULT_INTERACTIVE_SETTINGS };

  try {
    const raw = window.localStorage.getItem(INTERACTIVE_SETTINGS_KEY) || "{}";
    return safeParse(raw, {});
  } catch {
    return {};
  }
}

function writeRaw(settings) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(INTERACTIVE_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore localStorage write errors
  }
}

export function getInteractiveSettings() {
  return sanitizeSettings(readRaw());
}

export function saveInteractiveSettings(nextSettings) {
  const sanitized = sanitizeSettings(nextSettings);
  const next = { ...sanitized, updatedAt: Date.now() };
  writeRaw(next);
  return next;
}

export function patchInteractiveSettings(partialSettings) {
  const current = getInteractiveSettings();
  return saveInteractiveSettings({ ...current, ...(partialSettings || {}) });
}

export function clearInteractiveSettings() {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(INTERACTIVE_SETTINGS_KEY);
    } catch {
      // ignore localStorage remove errors
    }
  }
  return { ...DEFAULT_INTERACTIVE_SETTINGS };
}

