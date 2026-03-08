const SLO_STATE = globalThis.__CK_SLO_STATE__ || { events: [], lastAlertAt: 0 };
if (!globalThis.__CK_SLO_STATE__) {
  globalThis.__CK_SLO_STATE__ = SLO_STATE;
}

function asPositiveNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function quantile(values, q) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * q) - 1));
  return sorted[idx];
}

function getConfig() {
  return {
    windowMs: asPositiveNumber(process.env.ROLLBACK_EVAL_WINDOW_SEC, 600) * 1000,
    minSample: asPositiveNumber(process.env.ROLLBACK_MIN_SAMPLE_SIZE, 20),
    errorRateThreshold: asPositiveNumber(process.env.ROLLBACK_ERROR_RATE_THRESHOLD, 0.02),
    p95ThresholdMs: asPositiveNumber(process.env.ROLLBACK_P95_MS_THRESHOLD, 3000),
    alertCooldownMs: asPositiveNumber(process.env.ROLLBACK_ALERT_COOLDOWN_SEC, 300) * 1000,
    alertWebhookUrl: String(process.env.ROLLBACK_ALERT_WEBHOOK_URL || process.env.ALERT_WEBHOOK_URL || "").trim(),
    alertWebhookToken: String(process.env.ROLLBACK_ALERT_WEBHOOK_TOKEN || process.env.ALERT_WEBHOOK_TOKEN || "").trim(),
  };
}

function pruneEvents(now, windowMs) {
  SLO_STATE.events = SLO_STATE.events.filter((event) => now - event.ts <= windowMs);
}

function evaluateGlobalSlo() {
  const config = getConfig();
  const now = Date.now();
  pruneEvents(now, config.windowMs);

  const sample = SLO_STATE.events;
  if (sample.length < config.minSample) return null;

  const serverErrors = sample.filter((event) => event.status >= 500).length;
  const errorRate = serverErrors / sample.length;
  const latencies = sample.map((event) => event.latencyMs).filter((n) => Number.isFinite(n));
  const p95 = quantile(latencies, 0.95);

  return {
    sampleSize: sample.length,
    errorRate,
    p95,
    breached: errorRate > config.errorRateThreshold || p95 > config.p95ThresholdMs,
    config,
  };
}

async function sendAlert(summary) {
  const now = Date.now();
  if (now - SLO_STATE.lastAlertAt < summary.config.alertCooldownMs) return;
  SLO_STATE.lastAlertAt = now;

  const payload = {
    type: "slo_breach",
    timestamp: new Date(now).toISOString(),
    message: "Rollback threshold breached",
    metrics: {
      sampleSize: summary.sampleSize,
      errorRate: Number(summary.errorRate.toFixed(4)),
      p95Ms: Number(summary.p95.toFixed(0)),
      thresholds: {
        errorRate: summary.config.errorRateThreshold,
        p95Ms: summary.config.p95ThresholdMs,
      },
    },
  };

  console.error("[slo-alert]", JSON.stringify(payload));

  if (!summary.config.alertWebhookUrl) return;

  try {
    const headers = { "Content-Type": "application/json" };
    if (summary.config.alertWebhookToken) {
      headers.Authorization = `Bearer ${summary.config.alertWebhookToken}`;
    }

    await fetch(summary.config.alertWebhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error("[slo-alert] webhook failed", error?.message || error);
  }
}

function recordApiResult(route, status, latencyMs) {
  const ts = Date.now();
  SLO_STATE.events.push({
    ts,
    route: String(route || "unknown"),
    status: Number(status || 0),
    latencyMs: Number.isFinite(Number(latencyMs)) ? Number(latencyMs) : 0,
  });

  const summary = evaluateGlobalSlo();
  if (summary?.breached) {
    void sendAlert(summary);
  }
}

module.exports = {
  recordApiResult,
};

