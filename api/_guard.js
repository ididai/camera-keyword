const { extractApiErrorMessage, fetchJsonWithTimeout } = require("./_http");
const { hasUpstash, runUpstashPipeline } = require("./_redis");

const RATE_LIMIT_STATE = globalThis.__CK_RATE_LIMIT_STATE__ || new Map();
if (!globalThis.__CK_RATE_LIMIT_STATE__) {
  globalThis.__CK_RATE_LIMIT_STATE__ = RATE_LIMIT_STATE;
}

const AUTH_CACHE_STATE =
  globalThis.__CK_AUTH_CACHE_STATE__ || {
    byToken: new Map(),
  };
if (!globalThis.__CK_AUTH_CACHE_STATE__) {
  globalThis.__CK_AUTH_CACHE_STATE__ = AUTH_CACHE_STATE;
}

const AUTH_CACHE_TTL_MS = 45_000;

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function getClientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").trim();
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = String(req.headers["x-real-ip"] || "").trim();
  if (realIp) return realIp;
  return String(req.socket?.remoteAddress || "unknown");
}

function extractBearerToken(req) {
  const header = String(req.headers.authorization || "").trim();
  if (!header.toLowerCase().startsWith("bearer ")) return "";
  return header.slice(7).trim();
}

function getSupabaseConfig() {
  const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim();
  const anonKey = String(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "").trim();
  return { url, anonKey };
}

function isOriginAllowed(req) {
  const origin = String(req.headers.origin || "").trim();
  if (!origin) return true;

  const host = String(req.headers.host || "").trim();
  const allowed = new Set();
  if (host) {
    allowed.add(`https://${host}`);
    allowed.add(`http://${host}`);
  }

  const explicit = String(process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  explicit.forEach((item) => allowed.add(item));

  if (allowed.has(origin)) return true;
  if (!explicit.length) return true;
  return false;
}

function pruneTimestamps(timestamps, now, windowMs) {
  return timestamps.filter((ts) => now - ts < windowMs);
}

function checkRateLimitMemory({ key, limit, windowMs }) {
  const now = Date.now();
  const existing = RATE_LIMIT_STATE.get(key) || [];
  const fresh = pruneTimestamps(existing, now, windowMs);

  if (fresh.length >= limit) {
    const oldest = fresh[0] || now;
    const retryAfterMs = Math.max(1000, windowMs - (now - oldest));
    RATE_LIMIT_STATE.set(key, fresh);
    return {
      ok: false,
      retryAfterSec: Math.ceil(retryAfterMs / 1000),
    };
  }

  fresh.push(now);
  RATE_LIMIT_STATE.set(key, fresh);
  return { ok: true };
}

async function checkRateLimitDistributed({ key, limit, windowMs }) {
  if (!hasUpstash()) return null;

  const now = Date.now();
  const windowSec = Math.max(1, Math.ceil(windowMs / 1000));
  const bucket = Math.floor(now / windowMs);
  const redisKey = `ck_rl:${key}:${bucket}`;

  try {
    const results = await runUpstashPipeline([
      ["INCR", redisKey],
      ["EXPIRE", redisKey, windowSec + 5],
    ]);
    const currentCount = Number(results?.[0]?.result || 0);
    if (currentCount > limit) {
      const bucketEnd = (bucket + 1) * windowMs;
      return {
        ok: false,
        retryAfterSec: Math.max(1, Math.ceil((bucketEnd - now) / 1000)),
      };
    }
    return { ok: true };
  } catch {
    return null;
  }
}

async function checkRateLimit({ key, limit, windowMs }) {
  const distributed = await checkRateLimitDistributed({ key, limit, windowMs });
  if (distributed) return distributed;
  return checkRateLimitMemory({ key, limit, windowMs });
}

async function verifySupabaseUser(token) {
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) {
    return {
      ok: false,
      status: 500,
      error: "Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_ANON_KEY/VITE_SUPABASE_ANON_KEY",
    };
  }

  const cached = AUTH_CACHE_STATE.byToken.get(token);
  if (cached && Date.now() - cached.ts < AUTH_CACHE_TTL_MS && cached.user?.id) {
    return { ok: true, user: cached.user };
  }

  try {
    const endpoint = `${url.replace(/\/+$/, "")}/auth/v1/user`;
    const { ok, status, data, text } = await fetchJsonWithTimeout(
      endpoint,
      {
        method: "GET",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${token}`,
        },
      },
      {
        timeoutMs: 5_000,
        retries: 0,
      },
    );

    if (!ok) {
      if (status === 401 || status === 403) {
        return { ok: false, status: 401, error: "Unauthorized API request" };
      }
      return {
        ok: false,
        status: 502,
        error: extractApiErrorMessage(data, text, "Supabase auth service unavailable"),
      };
    }

    const user = data;
    if (!user?.id) {
      return { ok: false, status: 401, error: "Unauthorized API request" };
    }

    AUTH_CACHE_STATE.byToken.set(token, {
      user,
      ts: Date.now(),
    });

    return { ok: true, user };
  } catch (error) {
    return {
      ok: false,
      status: 502,
      error: extractApiErrorMessage(null, error?.message, "Supabase auth check failed"),
    };
  }
}

async function enforceApiGuard(
  req,
  res,
  { routeKey = "", limit = 40, windowMs = 60_000, respond = true } = {},
) {
  if (!isOriginAllowed(req)) {
    if (respond) json(res, 403, { error: "Forbidden origin" });
    return { ok: false, status: 403, error: "Forbidden origin" };
  }

  const token = extractBearerToken(req);
  if (!token) {
    if (respond) json(res, 401, { error: "Missing Authorization bearer token" });
    return { ok: false, status: 401, error: "Missing Authorization bearer token" };
  }

  const authResult = await verifySupabaseUser(token);
  if (!authResult.ok) {
    if (respond) {
      json(res, authResult.status || 401, {
        error: authResult.error || "Unauthorized API request",
      });
    }
    return {
      ok: false,
      status: authResult.status || 401,
      error: authResult.error || "Unauthorized API request",
    };
  }

  const identity = authResult.user?.id || getClientIp(req);
  const key = `${routeKey || "api"}:${identity}`;
  const limited = await checkRateLimit({ key, limit, windowMs });
  if (!limited.ok) {
    if (respond) {
      res.setHeader("Retry-After", String(limited.retryAfterSec || 1));
      json(res, 429, { error: "Too many requests. Please retry shortly." });
    }
    return {
      ok: false,
      status: 429,
      error: "Too many requests. Please retry shortly.",
      retryAfterSec: limited.retryAfterSec || 1,
    };
  }

  return {
    ok: true,
    user: authResult.user,
  };
}

module.exports = {
  enforceApiGuard,
};
