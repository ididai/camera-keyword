const { extractApiErrorMessage, fetchJsonWithTimeout } = require("./_http");

function getUpstashConfig() {
  return {
    url: String(process.env.UPSTASH_REDIS_REST_URL || "").trim(),
    token: String(process.env.UPSTASH_REDIS_REST_TOKEN || "").trim(),
  };
}

function hasUpstash() {
  const cfg = getUpstashConfig();
  return Boolean(cfg.url && cfg.token);
}

async function runUpstashPipeline(commands) {
  const { url, token } = getUpstashConfig();
  if (!url || !token) return null;

  const endpoint = `${url.replace(/\/+$/, "")}/pipeline`;
  const { ok, status, data, text } = await fetchJsonWithTimeout(
    endpoint,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
    },
    {
      timeoutMs: 3_000,
      retries: 1,
      retryBaseMs: 200,
    },
  );

  if (!ok) {
    throw new Error(extractApiErrorMessage(data, text, `Upstash pipeline failed: ${status}`));
  }

  return Array.isArray(data) ? data : [];
}

module.exports = {
  getUpstashConfig,
  hasUpstash,
  runUpstashPipeline,
};
