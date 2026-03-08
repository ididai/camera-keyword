const { hasUpstash, runUpstashPipeline } = require("./_redis");

const USAGE_STATE = globalThis.__CK_USAGE_STATE__ || {
  tokenEvents: [],
  requestEvents: [],
  lastLogAt: 0,
};

if (!globalThis.__CK_USAGE_STATE__) {
  globalThis.__CK_USAGE_STATE__ = USAGE_STATE;
}

function asPositiveInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function asPositiveFloat(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function getConfig() {
  return {
    usageWindowMs: asPositiveInt(process.env.USAGE_WINDOW_SEC, 600) * 1000,
    usageLogCooldownMs: asPositiveInt(process.env.USAGE_LOG_COOLDOWN_SEC, 30) * 1000,
    usageFailureAlertThreshold: asPositiveFloat(process.env.USAGE_FAILURE_ALERT_THRESHOLD, 0.25),
    usageFailureAlertMinRequests: asPositiveInt(process.env.USAGE_FAILURE_ALERT_MIN_REQUESTS, 20),
    usageTokenBudgetPerMinute: asPositiveInt(process.env.USAGE_TOKEN_BUDGET_PER_MINUTE, 120_000),
    usageMaxModelCallsDefault: asPositiveInt(process.env.USAGE_MAX_MODEL_CALLS_DEFAULT, 6),
    usageMaxModelCallsTranslate: asPositiveInt(process.env.USAGE_MAX_MODEL_CALLS_TRANSLATE, 4),
    usageMaxModelCallsRefine: asPositiveInt(process.env.USAGE_MAX_MODEL_CALLS_REFINE, 6),
  };
}

function pruneUsageState(now, usageWindowMs) {
  USAGE_STATE.requestEvents = USAGE_STATE.requestEvents.filter((event) => now - event.ts <= usageWindowMs);
  USAGE_STATE.tokenEvents = USAGE_STATE.tokenEvents.filter((event) => now - event.ts <= 60_000);
}

function estimateTextTokens(value) {
  const text = String(value || "").trim();
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

function getMaxModelCallsForRoute(route, config) {
  if (route === "translate") return config.usageMaxModelCallsTranslate;
  if (route === "refine_prompt") return config.usageMaxModelCallsRefine;
  return config.usageMaxModelCallsDefault;
}

function getRetryAfterSec(now) {
  const oldest = USAGE_STATE.tokenEvents[0];
  if (!oldest) return 1;
  return Math.max(1, Math.ceil((60_000 - (now - oldest.ts)) / 1000));
}

function getMinuteBucketRetryAfterSec(now) {
  const bucketEnd = (Math.floor(now / 60_000) + 1) * 60_000;
  return Math.max(1, Math.ceil((bucketEnd - now) / 1000));
}

async function checkDistributedTokenBudget({ estimatedTotalTokens, now, config }) {
  if (!hasUpstash()) return null;

  const minuteBucket = Math.floor(now / 60_000);
  const redisKey = `ck_usage_tokens:${minuteBucket}`;
  try {
    const results = await runUpstashPipeline([
      ["INCRBY", redisKey, estimatedTotalTokens],
      ["EXPIRE", redisKey, 70],
    ]);
    const currentMinuteTokens = Number(results?.[0]?.result || 0);
    if (!Number.isFinite(currentMinuteTokens)) return null;

    if (currentMinuteTokens > config.usageTokenBudgetPerMinute) {
      return {
        ok: false,
        retryAfterSec: getMinuteBucketRetryAfterSec(now),
      };
    }

    return {
      ok: true,
      currentMinuteTokens,
    };
  } catch {
    return null;
  }
}

function createRequestUsageContext(route) {
  return {
    id: `u_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    route: String(route || "unknown"),
    modelCalls: 0,
    failedModelCalls: 0,
    estimatedPromptTokens: 0,
    estimatedCompletionTokens: 0,
  };
}

async function reserveModelCallBudget(
  usageContext,
  { provider = "unknown", promptText = "", maxOutputTokens = 256 } = {},
) {
  const ctx = usageContext || createRequestUsageContext("unknown");
  const config = getConfig();
  const now = Date.now();
  pruneUsageState(now, config.usageWindowMs);

  const maxCalls = getMaxModelCallsForRoute(ctx.route, config);
  if (ctx.modelCalls >= maxCalls) {
    return {
      ok: false,
      status: 429,
      error: `Model call limit exceeded for request (${maxCalls})`,
      retryAfterSec: 1,
    };
  }

  const estimatedPromptTokens = estimateTextTokens(promptText);
  const expectedOutputTokens = Math.max(1, Math.ceil(asPositiveInt(maxOutputTokens, 256) * 0.6));
  const estimatedTotalTokens = estimatedPromptTokens + expectedOutputTokens;

  const distributed = await checkDistributedTokenBudget({
    estimatedTotalTokens,
    now,
    config,
  });

  if (distributed && !distributed.ok) {
    return {
      ok: false,
      status: 429,
      error: "Token budget exceeded. Please retry shortly.",
      retryAfterSec: distributed.retryAfterSec || 1,
    };
  }

  if (!distributed) {
    const currentMinuteTokens = USAGE_STATE.tokenEvents.reduce((sum, event) => sum + event.tokens, 0);
    if (currentMinuteTokens + estimatedTotalTokens > config.usageTokenBudgetPerMinute) {
      return {
        ok: false,
        status: 429,
        error: "Token budget exceeded. Please retry shortly.",
        retryAfterSec: getRetryAfterSec(now),
      };
    }
  }

  ctx.modelCalls += 1;
  ctx.estimatedPromptTokens += estimatedPromptTokens;
  ctx.estimatedCompletionTokens += expectedOutputTokens;

  USAGE_STATE.tokenEvents.push({
    ts: now,
    route: ctx.route,
    provider: String(provider || "unknown"),
    requestId: ctx.id,
    tokens: estimatedTotalTokens,
  });

  return {
    ok: true,
    estimatedPromptTokens,
    estimatedCompletionTokens: expectedOutputTokens,
    estimatedTotalTokens,
  };
}

function markModelCallFailure(usageContext) {
  if (!usageContext) return;
  usageContext.failedModelCalls += 1;
}

function summarizeRouteUsage(route, now, config) {
  const events = USAGE_STATE.requestEvents.filter((event) => event.route === route);
  const requests = events.length;
  const failures = events.filter((event) => event.status >= 500 || event.status === 429).length;
  const estimatedTokens = events.reduce((sum, event) => sum + event.estimatedTokens, 0);
  const modelCalls = events.reduce((sum, event) => sum + event.modelCalls, 0);
  const failureRate = requests ? failures / requests : 0;

  return {
    route,
    requests,
    failures,
    failureRate,
    estimatedTokens,
    modelCalls,
    windowSec: Math.round(config.usageWindowMs / 1000),
    timestamp: new Date(now).toISOString(),
  };
}

function maybeLogUsageSummary(status, summary, config, now) {
  const isAlert =
    summary.requests >= config.usageFailureAlertMinRequests &&
    summary.failureRate >= config.usageFailureAlertThreshold;
  const shouldLog = isAlert || status >= 500 || now - USAGE_STATE.lastLogAt >= config.usageLogCooldownMs;
  if (!shouldLog) return summary;

  USAGE_STATE.lastLogAt = now;
  const label = isAlert ? "[usage-alert]" : "[usage-metrics]";
  const payload = {
    route: summary.route,
    requests: summary.requests,
    estimatedTokens: summary.estimatedTokens,
    failureRate: Number(summary.failureRate.toFixed(4)),
    modelCalls: summary.modelCalls,
    windowSec: summary.windowSec,
  };
  if (isAlert || status >= 500) {
    console.error(label, JSON.stringify(payload));
  } else {
    console.log(label, JSON.stringify(payload));
  }

  return summary;
}

function recordRequestUsage(route, { status = 0, usageContext = null, latencyMs = 0 } = {}) {
  const config = getConfig();
  const now = Date.now();
  pruneUsageState(now, config.usageWindowMs);

  const estimatedTokens = Number(
    (Number(usageContext?.estimatedPromptTokens || 0) + Number(usageContext?.estimatedCompletionTokens || 0)),
  );
  const record = {
    ts: now,
    route: String(route || usageContext?.route || "unknown"),
    status: Number(status || 0),
    requestId: usageContext?.id || `u_${now}`,
    latencyMs: Number.isFinite(Number(latencyMs)) ? Number(latencyMs) : 0,
    estimatedTokens,
    modelCalls: Number(usageContext?.modelCalls || 0),
    failedModelCalls: Number(usageContext?.failedModelCalls || 0),
  };
  USAGE_STATE.requestEvents.push(record);

  const summary = summarizeRouteUsage(record.route, now, config);
  maybeLogUsageSummary(record.status, summary, config, now);
  return summary;
}

module.exports = {
  createRequestUsageContext,
  estimateTextTokens,
  markModelCallFailure,
  recordRequestUsage,
  reserveModelCallBudget,
};
