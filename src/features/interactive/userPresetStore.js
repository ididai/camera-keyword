const USER_PRESET_KEY = "ck_user_presets_v2";
const USER_PRESET_LIMIT = 20;
const SUBJECT_POS_MIN = -1.8;
const SUBJECT_POS_MAX = 1.8;
let lastPresetWriteFailed = false;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

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
    return safeParse(window.localStorage.getItem(USER_PRESET_KEY) || "[]", []);
  } catch {
    return [];
  }
}

function writeRaw(items) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(USER_PRESET_KEY, JSON.stringify(items));
    lastPresetWriteFailed = false;
  } catch {
    // ignore storage write errors (private mode/quota exceeded)
    lastPresetWriteFailed = true;
  }
}

function asNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return clamp(n, min, max);
}

function sanitizePreset(input) {
  if (!input || typeof input !== "object") return null;
  const name = String(input.name || "").trim();
  if (!name) return null;

  return {
    id: String(input.id || `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`),
    name: name.slice(0, 32),
    phi: asNumber(input.phi, 65, 1, 179),
    theta: asNumber(input.theta, 0, -180, 180),
    r: asNumber(input.r, 0.72, 0, 1),
    subjectPos: {
      x: asNumber(input.subjectPos?.x, 0, SUBJECT_POS_MIN, SUBJECT_POS_MAX),
      y: asNumber(input.subjectPos?.y, 0, SUBJECT_POS_MIN, SUBJECT_POS_MAX),
    },
    gazeVector: {
      x: asNumber(input.gazeVector?.x, 0, -1, 1),
      y: asNumber(input.gazeVector?.y, 0, -1, 1),
    },
    arPresetId: String(input.arPresetId || "ar916"),
    updatedAt: Number(input.updatedAt) || Date.now(),
  };
}

export function getUserPresets() {
  return readRaw()
    .map(sanitizePreset)
    .filter(Boolean)
    .slice(0, USER_PRESET_LIMIT);
}

export function saveUserPreset(payload) {
  const sanitized = sanitizePreset(payload);
  if (!sanitized) return getUserPresets();

  const current = getUserPresets().filter((item) => item.id !== sanitized.id);
  const next = [{ ...sanitized, updatedAt: Date.now() }, ...current].slice(0, USER_PRESET_LIMIT);
  writeRaw(next);
  return next;
}

export function renameUserPreset(id, nextName) {
  const normalizedName = String(nextName || "").trim().slice(0, 32);
  if (!normalizedName) return getUserPresets();

  const next = getUserPresets().map((item) =>
    item.id === id ? { ...item, name: normalizedName, updatedAt: Date.now() } : item,
  );
  writeRaw(next);
  return next;
}

export function removeUserPreset(id) {
  const next = getUserPresets().filter((item) => item.id !== id);
  writeRaw(next);
  return next;
}

export function clearUserPresets() {
  writeRaw([]);
  return [];
}

export function didLastUserPresetWriteFail() {
  return lastPresetWriteFailed;
}
