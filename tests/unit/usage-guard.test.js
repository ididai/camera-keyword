import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function loadUsageModule() {
  const redisPath = require.resolve("../../api/_redis.js");
  delete require.cache[redisPath];
  const modulePath = require.resolve("../../api/_usage.js");
  delete require.cache[modulePath];
  return require(modulePath);
}

function loadUsageModuleWithRedisStub(redisStub) {
  const redisPath = require.resolve("../../api/_redis.js");
  delete require.cache[redisPath];
  /** @type {any} */ (require.cache)[redisPath] = {
    id: redisPath,
    filename: redisPath,
    loaded: true,
    exports: redisStub,
  };
  const modulePath = require.resolve("../../api/_usage.js");
  delete require.cache[modulePath];
  return require(modulePath);
}

describe("usage guard", () => {
  const previousEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...previousEnv };
    delete globalThis.__CK_USAGE_STATE__;
  });

  afterEach(() => {
    process.env = { ...previousEnv };
    delete globalThis.__CK_USAGE_STATE__;
  });

  it("enforces per-request model call cap", async () => {
    process.env.USAGE_MAX_MODEL_CALLS_TRANSLATE = "1";
    process.env.USAGE_TOKEN_BUDGET_PER_MINUTE = "100000";

    const usage = loadUsageModule();
    const ctx = usage.createRequestUsageContext("translate");

    const first = await usage.reserveModelCallBudget(ctx, {
      provider: "gemini",
      promptText: "camera prompt",
      maxOutputTokens: 128,
    });
    const second = await usage.reserveModelCallBudget(ctx, {
      provider: "gemini",
      promptText: "camera prompt",
      maxOutputTokens: 128,
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(second.status).toBe(429);
  });

  it("blocks requests when minute token budget is exceeded", async () => {
    process.env.USAGE_MAX_MODEL_CALLS_TRANSLATE = "3";
    process.env.USAGE_TOKEN_BUDGET_PER_MINUTE = "20";

    const usage = loadUsageModule();
    const ctx = usage.createRequestUsageContext("translate");

    const result = await usage.reserveModelCallBudget(ctx, {
      provider: "gemini",
      promptText: "x".repeat(120),
      maxOutputTokens: 256,
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(429);
    expect(result.retryAfterSec).toBeGreaterThanOrEqual(1);
  });

  it("records request usage summary for failure rate", async () => {
    process.env.USAGE_WINDOW_SEC = "600";
    process.env.USAGE_TOKEN_BUDGET_PER_MINUTE = "100000";

    const usage = loadUsageModule();
    const successCtx = usage.createRequestUsageContext("refine_prompt");
    await usage.reserveModelCallBudget(successCtx, {
      provider: "gemini_refine",
      promptText: "subject",
      maxOutputTokens: 256,
    });

    const errorCtx = usage.createRequestUsageContext("refine_prompt");
    await usage.reserveModelCallBudget(errorCtx, {
      provider: "gemini_refine",
      promptText: "subject",
      maxOutputTokens: 256,
    });
    usage.markModelCallFailure(errorCtx);

    usage.recordRequestUsage("refine_prompt", {
      status: 200,
      usageContext: successCtx,
      latencyMs: 120,
    });
    const summary = usage.recordRequestUsage("refine_prompt", {
      status: 500,
      usageContext: errorCtx,
      latencyMs: 220,
    });

    expect(summary.requests).toBe(2);
    expect(summary.failures).toBe(1);
    expect(summary.failureRate).toBeGreaterThan(0);
    expect(summary.estimatedTokens).toBeGreaterThan(0);
  });

  it("uses distributed budget guard when Upstash is configured", async () => {
    process.env.USAGE_MAX_MODEL_CALLS_TRANSLATE = "3";
    process.env.USAGE_TOKEN_BUDGET_PER_MINUTE = "100";

    const usage = loadUsageModuleWithRedisStub({
      hasUpstash: () => true,
      runUpstashPipeline: async () => [{ result: 1000 }, { result: "OK" }],
    });
    const ctx = usage.createRequestUsageContext("translate");

    const result = await usage.reserveModelCallBudget(ctx, {
      provider: "gemini",
      promptText: "camera prompt",
      maxOutputTokens: 128,
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(429);
  });
});
