const { enforceApiGuard } = require("./_guard");
const { hasUpstash, runUpstashPipeline } = require("./_redis");
const { safeJsonParse } = require("./_http");

const HISTORY_LIMIT = 30;
const USER_PRESET_LIMIT = 20;
const SUBJECT_POS_MIN = -1.8;
const SUBJECT_POS_MAX = 1.8;
const MAX_WORKSPACE_LABEL_LENGTH = 36;
const MAX_HINT_LENGTH = 120;
const DEFAULT_ACCOUNT_CAMERA_DEFAULTS = {
  phi: 65,
  theta: 0,
  r: 0.72,
  subjectPos: { x: 0, y: 0 },
  gazeVector: { x: 0, y: 0 },
  arPresetId: "ar916",
  includeAngleInPrompt: true,
  qualityPresetLevel: 0,
  updatedAt: 0,
};
const DEFAULT_ACCOUNT_ENVIRONMENT = {
  workspaceLabel: "",
  defaultPromptLanguage: "auto",
  syncMode: "live",
  legacyImportMode: "ask",
  uiDensity: "immersive",
  interactiveDefaults: {
    defaultCustomPromptHint: "",
    cameraDefaults: { ...DEFAULT_ACCOUNT_CAMERA_DEFAULTS },
  },
  updatedAt: 0,
};
const PROMPT_FORMATS = new Set(["keyword", "sentence"]);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeToken(value) {
  return String(value || "")
    .trim()
    .replace(/^,+|,+$/g, "")
    .replace(/\s{2,}/g, " ");
}

function normalizePromptFormat(value) {
  const format = String(value || "").trim().toLowerCase();
  return PROMPT_FORMATS.has(format) ? format : "keyword";
}

function normalizeChoice(value, allowed, fallback) {
  const candidate = String(value || "")
    .trim()
    .toLowerCase();
  return allowed.includes(candidate) ? candidate : fallback;
}

function normalizeWorkspaceLabel(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_WORKSPACE_LABEL_LENGTH);
}

function normalizeHint(value) {
  return String(value || "").trim().slice(0, MAX_HINT_LENGTH);
}

function normalizeArPresetId(value) {
  return (
    String(value || "")
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, 32) || DEFAULT_ACCOUNT_CAMERA_DEFAULTS.arPresetId
  );
}

function normalizePromptText(value) {
  const normalized = normalizeToken(value);
  if (!normalized) return "";

  const unique = [];
  const seen = new Set();

  normalized
    .split(",")
    .map((part) => normalizeToken(part))
    .filter(Boolean)
    .forEach((chunk) => {
      const key = chunk.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      unique.push(chunk);
    });

  return unique.join(", ");
}

function normalizeSentenceText(value) {
  return normalizeToken(value);
}

function asNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return clamp(n, min, max);
}

function sanitizeHistoryItem(input) {
  if (!input || typeof input !== "object") return null;
  const format = normalizePromptFormat(input.format);
  const text = format === "sentence" ? normalizeSentenceText(input.text) : normalizePromptText(input.text);
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

function sanitizePreset(input) {
  if (!input || typeof input !== "object") return null;
  const name = String(input.name || "").trim().slice(0, 32);
  if (!name) return null;

  return {
    id: String(input.id || `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`),
    name,
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

function sanitizePresetItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map(sanitizePreset).filter(Boolean).slice(0, USER_PRESET_LIMIT);
}

function sanitizeAccountEnvironment(input) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const updatedAt = Number(source.updatedAt);
  const cameraDefaultsUpdatedAt = Number(source?.interactiveDefaults?.cameraDefaults?.updatedAt);

  return {
    workspaceLabel: normalizeWorkspaceLabel(source.workspaceLabel),
    defaultPromptLanguage: normalizeChoice(
      source.defaultPromptLanguage,
      ["auto", "en", "kr"],
      DEFAULT_ACCOUNT_ENVIRONMENT.defaultPromptLanguage,
    ),
    syncMode: normalizeChoice(
      source.syncMode,
      ["live", "balanced", "focused"],
      DEFAULT_ACCOUNT_ENVIRONMENT.syncMode,
    ),
    legacyImportMode: normalizeChoice(
      source.legacyImportMode,
      ["ask", "auto", "skip"],
      DEFAULT_ACCOUNT_ENVIRONMENT.legacyImportMode,
    ),
    uiDensity: normalizeChoice(
      source.uiDensity,
      ["immersive", "compact"],
      DEFAULT_ACCOUNT_ENVIRONMENT.uiDensity,
    ),
    interactiveDefaults: {
      defaultCustomPromptHint: normalizeHint(source?.interactiveDefaults?.defaultCustomPromptHint),
      cameraDefaults: {
        phi: asNumber(source?.interactiveDefaults?.cameraDefaults?.phi, DEFAULT_ACCOUNT_CAMERA_DEFAULTS.phi, 1, 179),
        theta: asNumber(
          source?.interactiveDefaults?.cameraDefaults?.theta,
          DEFAULT_ACCOUNT_CAMERA_DEFAULTS.theta,
          -180,
          180,
        ),
        r: asNumber(source?.interactiveDefaults?.cameraDefaults?.r, DEFAULT_ACCOUNT_CAMERA_DEFAULTS.r, 0, 1),
        subjectPos: {
          x: asNumber(
            source?.interactiveDefaults?.cameraDefaults?.subjectPos?.x,
            DEFAULT_ACCOUNT_CAMERA_DEFAULTS.subjectPos.x,
            SUBJECT_POS_MIN,
            SUBJECT_POS_MAX,
          ),
          y: asNumber(
            source?.interactiveDefaults?.cameraDefaults?.subjectPos?.y,
            DEFAULT_ACCOUNT_CAMERA_DEFAULTS.subjectPos.y,
            SUBJECT_POS_MIN,
            SUBJECT_POS_MAX,
          ),
        },
        gazeVector: {
          x: asNumber(
            source?.interactiveDefaults?.cameraDefaults?.gazeVector?.x,
            DEFAULT_ACCOUNT_CAMERA_DEFAULTS.gazeVector.x,
            -1,
            1,
          ),
          y: asNumber(
            source?.interactiveDefaults?.cameraDefaults?.gazeVector?.y,
            DEFAULT_ACCOUNT_CAMERA_DEFAULTS.gazeVector.y,
            -1,
            1,
          ),
        },
        arPresetId: normalizeArPresetId(source?.interactiveDefaults?.cameraDefaults?.arPresetId),
        includeAngleInPrompt:
          typeof source?.interactiveDefaults?.cameraDefaults?.includeAngleInPrompt === "boolean"
            ? source.interactiveDefaults.cameraDefaults.includeAngleInPrompt
            : DEFAULT_ACCOUNT_CAMERA_DEFAULTS.includeAngleInPrompt,
        qualityPresetLevel: asNumber(
          source?.interactiveDefaults?.cameraDefaults?.qualityPresetLevel,
          DEFAULT_ACCOUNT_CAMERA_DEFAULTS.qualityPresetLevel,
          0,
          5,
        ),
        updatedAt:
          Number.isFinite(cameraDefaultsUpdatedAt) && cameraDefaultsUpdatedAt > 0
            ? Math.round(cameraDefaultsUpdatedAt)
            : DEFAULT_ACCOUNT_CAMERA_DEFAULTS.updatedAt,
      },
    },
    updatedAt:
      Number.isFinite(updatedAt) && updatedAt > 0
        ? Math.round(updatedAt)
        : DEFAULT_ACCOUNT_ENVIRONMENT.updatedAt,
  };
}

function getUpdatedAt(value) {
  const updatedAt = Number(value);
  return Number.isFinite(updatedAt) && updatedAt > 0 ? Math.round(updatedAt) : 0;
}

function mergeAccountEnvironment(currentItem, nextItem) {
  const current = sanitizeAccountEnvironment(currentItem);
  const next = sanitizeAccountEnvironment(nextItem);
  const currentUpdatedAt = getUpdatedAt(current.updatedAt);
  const nextUpdatedAt = getUpdatedAt(next.updatedAt);
  const currentCameraUpdatedAt = getUpdatedAt(current?.interactiveDefaults?.cameraDefaults?.updatedAt);
  const nextCameraUpdatedAt = getUpdatedAt(next?.interactiveDefaults?.cameraDefaults?.updatedAt);

  const base = nextUpdatedAt >= currentUpdatedAt ? next : current;
  const cameraDefaults =
    nextCameraUpdatedAt >= currentCameraUpdatedAt
      ? next.interactiveDefaults.cameraDefaults
      : current.interactiveDefaults.cameraDefaults;

  return sanitizeAccountEnvironment({
    ...base,
    interactiveDefaults: {
      ...base.interactiveDefaults,
      cameraDefaults,
    },
    updatedAt: Math.max(currentUpdatedAt, nextUpdatedAt),
  });
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
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    return safeJsonParse(req.body) || {};
  }
  const raw = await readRawBody(req);
  return safeJsonParse(raw) || {};
}

async function readValue(storageKey) {
  const results = await runUpstashPipeline([["GET", storageKey]]);
  const raw = String(results?.[0]?.result || "").trim();
  if (!raw) return null;
  return safeJsonParse(raw);
}

async function writeItems(storageKey, items) {
  if (!items.length) {
    await runUpstashPipeline([["DEL", storageKey]]);
    return;
  }
  await runUpstashPipeline([["SET", storageKey, JSON.stringify(items)]]);
}

async function writeValue(storageKey, value) {
  await runUpstashPipeline([["SET", storageKey, JSON.stringify(value)]]);
}

function createUserSyncHandler({ routeKey, storageKeyPrefix, sanitizeItems }) {
  return async function handler(req, res) {
    if (req.method !== "GET" && req.method !== "PUT") {
      res.setHeader("Allow", "GET, PUT");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const guard = await enforceApiGuard(req, res, {
      routeKey,
      limit: 90,
      windowMs: 60_000,
    });
    if (!guard.ok) return;

    if (!hasUpstash()) {
      return res.status(503).json({ error: "User sync storage is unavailable" });
    }

    const storageKey = `${storageKeyPrefix}:${guard.user.id}`;

    try {
      if (req.method === "GET") {
        const items = sanitizeItems(await readValue(storageKey));
        return res.status(200).json({ items });
      }

      const body = await parseBody(req);
      const items = sanitizeItems(body?.items);
      await writeItems(storageKey, items);
      return res.status(200).json({ items });
    } catch (error) {
      return res.status(500).json({
        error: error?.message || "User sync request failed",
      });
    }
  };
}

function createUserObjectSyncHandler({
  routeKey,
  storageKeyPrefix,
  sanitizeItem,
  payloadKey = "item",
  mergeItem = null,
}) {
  return async function handler(req, res) {
    if (req.method !== "GET" && req.method !== "PUT") {
      res.setHeader("Allow", "GET, PUT");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const guard = await enforceApiGuard(req, res, {
      routeKey,
      limit: 90,
      windowMs: 60_000,
    });
    if (!guard.ok) return;

    if (!hasUpstash()) {
      return res.status(503).json({ error: "User sync storage is unavailable" });
    }

    const storageKey = `${storageKeyPrefix}:${guard.user.id}`;

    try {
      if (req.method === "GET") {
        const item = sanitizeItem(await readValue(storageKey));
        return res.status(200).json({ [payloadKey]: item });
      }

      const body = await parseBody(req);
      const item = sanitizeItem(body?.[payloadKey]);
      const current = sanitizeItem(await readValue(storageKey));
      const next = typeof mergeItem === "function" ? mergeItem(current, item) : item;
      await writeValue(storageKey, next);
      return res.status(200).json({
        [payloadKey]: next,
      });
    } catch (error) {
      return res.status(500).json({
        error: error?.message || "User sync request failed",
      });
    }
  };
}

module.exports = {
  createUserObjectSyncHandler,
  createUserSyncHandler,
  mergeAccountEnvironment,
  sanitizeAccountEnvironment,
  sanitizeHistoryItems,
  sanitizePresetItems,
};
