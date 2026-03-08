const QUEUE_STORAGE_KEY = "camera_keyword.analytics.queue.v1";
const ANON_ID_KEY = "camera_keyword.analytics.anon_id.v1";
const SESSION_ID_KEY = "camera_keyword.analytics.session_id.v1";
const MAX_QUEUE_SIZE = 200;
const MAX_BATCH_SIZE = 20;
const FLUSH_DELAY_MS = 2400;
const RETRY_DELAY_MS = 7000;
const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const VALID_KEY_REGEX = /^[a-zA-Z0-9_.-]{1,40}$/;

const isBrowser = typeof window !== "undefined";
const isEnabled = isBrowser && import.meta.env.VITE_ANALYTICS_ENABLED !== "false";
const isDebug = isBrowser && import.meta.env.VITE_ANALYTICS_DEBUG === "true";

let queue = isBrowser ? loadQueue() : [];
let flushTimer = null;
let isFlushing = false;
let initialized = false;
let memorySessionId = "";
let memoryAnonId = "";

function safeParse(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function safeReadStorage(storage, key) {
  if (!isBrowser || !storage) return "";
  try {
    return storage.getItem(key) || "";
  } catch {
    return "";
  }
}

function safeWriteStorage(storage, key, value) {
  if (!isBrowser || !storage) return;
  try {
    storage.setItem(key, value);
  } catch {
    // ignore write failures (private mode, quota exceeded, etc.)
  }
}

function createId(prefix) {
  if (!isBrowser) return `${prefix}-server`;
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

function sanitizeString(value, maxLength = 180) {
  const clean = String(value).trim().replace(EMAIL_REGEX, "[redacted-email]");
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

  if (typeof value === "object") {
    const out = {};
    Object.entries(value)
      .slice(0, 16)
      .forEach(([key, item]) => {
        if (!VALID_KEY_REGEX.test(key)) return;
        const sanitized = sanitizeValue(item, depth + 1);
        if (sanitized !== undefined) out[key] = sanitized;
      });
    return Object.keys(out).length ? out : undefined;
  }

  return undefined;
}

function sanitizeProps(props) {
  if (!props || typeof props !== "object" || Array.isArray(props)) return {};
  return sanitizeValue(props, 0) || {};
}

function normalizeEventName(name) {
  const normalized = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, "_")
    .slice(0, 64);
  return normalized;
}

function getAnonId() {
  if (!isBrowser) return "anon-server";
  if (memoryAnonId) return memoryAnonId;

  const persisted = safeReadStorage(window.localStorage, ANON_ID_KEY);
  if (persisted) {
    memoryAnonId = persisted;
    return persisted;
  }

  const generated = createId("anon");
  memoryAnonId = generated;
  safeWriteStorage(window.localStorage, ANON_ID_KEY, generated);
  return generated;
}

function getSessionId() {
  if (!isBrowser) return "session-server";
  if (memorySessionId) return memorySessionId;

  const persisted = safeReadStorage(window.sessionStorage, SESSION_ID_KEY);
  if (persisted) {
    memorySessionId = persisted;
    return persisted;
  }

  const generated = createId("session");
  memorySessionId = generated;
  safeWriteStorage(window.sessionStorage, SESSION_ID_KEY, generated);
  return generated;
}

function loadQueue() {
  if (!isBrowser) return [];
  const parsed = safeParse(safeReadStorage(window.localStorage, QUEUE_STORAGE_KEY));
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((item) => item && typeof item === "object").slice(-MAX_QUEUE_SIZE);
}

function persistQueue() {
  if (!isBrowser) return;
  safeWriteStorage(window.localStorage, QUEUE_STORAGE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE_SIZE)));
}

function scheduleFlush(delay = FLUSH_DELAY_MS) {
  if (!isEnabled || !isBrowser) return;
  if (flushTimer) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void flushAnalytics();
  }, delay);
}

function enqueue(event) {
  queue.push(event);
  if (queue.length > MAX_QUEUE_SIZE) {
    queue = queue.slice(-MAX_QUEUE_SIZE);
  }
  persistQueue();
  scheduleFlush();
}

export async function flushAnalytics(force = false) {
  if (!isEnabled || !isBrowser || isFlushing) return;
  if (!queue.length) return;
  if (!force && typeof navigator !== "undefined" && navigator.onLine === false) {
    scheduleFlush(RETRY_DELAY_MS);
    return;
  }

  const batch = queue.slice(0, MAX_BATCH_SIZE);
  isFlushing = true;

  try {
    const response = await fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events: batch }),
      keepalive: Boolean(force),
    });

    if (!response.ok) {
      throw new Error(`analytics flush failed: ${response.status}`);
    }

    queue = queue.slice(batch.length);
    persistQueue();
    if (queue.length) scheduleFlush(600);
  } catch (error) {
    if (isDebug) {
      // eslint-disable-next-line no-console
      console.warn("[analytics] flush retry", error);
    }
    scheduleFlush(RETRY_DELAY_MS);
  } finally {
    isFlushing = false;
  }
}

export function trackEvent(name, props = {}) {
  if (!isEnabled || !isBrowser) return;

  const normalizedName = normalizeEventName(name);
  if (!normalizedName) return;

  const payload = {
    id: createId("evt"),
    name: normalizedName,
    ts: Date.now(),
    path: window.location?.pathname || "/",
    anonymousId: getAnonId(),
    sessionId: getSessionId(),
    props: sanitizeProps(props),
  };

  enqueue(payload);

  if (isDebug) {
    // eslint-disable-next-line no-console
    console.info("[analytics]", normalizedName, payload.props);
  }
}

export function initAnalytics() {
  if (!isEnabled || !isBrowser || initialized) return;
  initialized = true;

  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      void flushAnalytics(true);
      return;
    }
    if (queue.length) scheduleFlush(900);
  };

  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("beforeunload", () => {
    void flushAnalytics(true);
  });

  if (queue.length) scheduleFlush(800);
}

