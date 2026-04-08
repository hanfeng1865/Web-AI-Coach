import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateGuidance } from "../src/core/guidance-engine.js";
import { buildRedactionSummary, redactArray, redactText } from "../src/core/redaction.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const defaultTrialStoreFile = resolve(process.env.TRIAL_STORE_FILE || `${__dirname}/data/trial-usage.json`);

export const trialLimit = Number(process.env.TRIAL_MAX_REQUESTS || 15);
export const upstreamApiUrl =
  process.env.TRIAL_UPSTREAM_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
export const upstreamApiKey = process.env.TRIAL_UPSTREAM_API_KEY || "";
export const upstreamModel = process.env.TRIAL_UPSTREAM_MODEL || "qwen-vl-max-latest";

const redisUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const redisToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
const isVercelRuntime = Boolean(process.env.VERCEL);
const memoryStore = globalThis.__aiCoachTrialMemoryStore || { installs: {} };
globalThis.__aiCoachTrialMemoryStore = memoryStore;

function getStoreMode() {
  if (redisUrl && redisToken) {
    return "redis";
  }
  if (isVercelRuntime) {
    return "memory";
  }
  return "file";
}

export function createJsonResponse(status, data) {
  return {
    status,
    body: data
  };
}

export function sanitizeSnapshot(snapshot) {
  const sanitized = {
    ...snapshot,
    title: redactText(snapshot.title),
    breadcrumbs: (snapshot.breadcrumbs || []).map((item) => redactText(item)).filter(Boolean),
    leftNavItems: redactArray(snapshot.leftNavItems),
    visibleModules: redactArray(snapshot.visibleModules),
    primaryActions: redactArray(snapshot.primaryActions, 8),
    notices: redactArray(snapshot.notices, 6)
  };

  return {
    ...sanitized,
    redactionSummary: buildRedactionSummary(sanitized)
  };
}

export async function readRequestJson(req) {
  if (typeof req?.body === "object" && req.body !== null) {
    return req.body;
  }

  if (typeof req?.json === "function") {
    return req.json();
  }

  let body = "";
  for await (const chunk of req) {
    body += chunk;
  }
  return JSON.parse(body || "{}");
}

async function ensureTrialStore() {
  await mkdir(dirname(defaultTrialStoreFile), { recursive: true });
  try {
    await readFile(defaultTrialStoreFile, "utf8");
  } catch {
    await writeFile(defaultTrialStoreFile, JSON.stringify({ installs: {} }, null, 2), "utf8");
  }
}

async function loadFileStore() {
  await ensureTrialStore();
  const raw = await readFile(defaultTrialStoreFile, "utf8");
  return JSON.parse(raw || '{"installs":{}}');
}

async function saveFileStore(store) {
  await ensureTrialStore();
  await writeFile(defaultTrialStoreFile, JSON.stringify(store, null, 2), "utf8");
}

async function redisCommand(command) {
  const response = await fetch(`${redisUrl}/${command.join("/")}`, {
    headers: {
      Authorization: `Bearer ${redisToken}`
    }
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error || `Redis request failed with ${response.status}`);
  }

  return data?.result;
}

function getRedisKey(installId) {
  return `trial_usage:${installId}`;
}

export function normalizeInstallId(value) {
  return String(value || "").trim().slice(0, 120) || "anonymous";
}

async function getUsageRecordFromRedis(installId) {
  const raw = await redisCommand(["get", getRedisKey(installId)]);
  if (!raw) {
    return { used: 0, features: {} };
  }
  return JSON.parse(raw);
}

async function setUsageRecordToRedis(installId, record) {
  await redisCommand(["set", getRedisKey(installId), JSON.stringify(record)]);
}

async function loadUsageRecord(installId) {
  if (getStoreMode() === "redis") {
    return getUsageRecordFromRedis(installId);
  }

  if (getStoreMode() === "memory") {
    return memoryStore.installs?.[installId] || { used: 0, features: {} };
  }

  const store = await loadFileStore();
  return store.installs?.[installId] || { used: 0, features: {} };
}

async function saveUsageRecord(installId, record) {
  if (getStoreMode() === "redis") {
    await setUsageRecordToRedis(installId, record);
    return;
  }

  if (getStoreMode() === "memory") {
    memoryStore.installs = memoryStore.installs || {};
    memoryStore.installs[installId] = record;
    return;
  }

  const store = await loadFileStore();
  store.installs = store.installs || {};
  store.installs[installId] = record;
  await saveFileStore(store);
}

export async function getTrialUsage(installId) {
  const record = await loadUsageRecord(installId);
  const used = Number(record.used || 0);
  return {
    installId,
    usedFreeUses: used,
    remainingFreeUses: Math.max(0, trialLimit - used),
    freeTrialLimit: trialLimit,
    storeMode: getStoreMode()
  };
}

export async function consumeTrialUsage(installId, feature) {
  const current = await loadUsageRecord(installId);
  const used = Number(current.used || 0);

  if (used >= trialLimit) {
    return {
      allowed: false,
      usedFreeUses: used,
      remainingFreeUses: 0,
      freeTrialLimit: trialLimit
    };
  }

  const nextUsed = used + 1;
  await saveUsageRecord(installId, {
    used: nextUsed,
    updatedAt: new Date().toISOString(),
    features: {
      ...(current.features || {}),
      [feature]: Number(current.features?.[feature] || 0) + 1
    }
  });

  return {
    allowed: true,
    usedFreeUses: nextUsed,
    remainingFreeUses: Math.max(0, trialLimit - nextUsed),
    freeTrialLimit: trialLimit
  };
}

export async function proxyTrialChat(requestBody) {
  if (!upstreamApiKey) {
    throw new Error("Missing TRIAL_UPSTREAM_API_KEY");
  }

  const response = await fetch(upstreamApiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${upstreamApiKey}`
    },
    body: JSON.stringify({
      ...requestBody,
      model: requestBody.model || upstreamModel
    })
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
        data?.message ||
        `Upstream API ${response.status}`
    );
  }

  return data;
}

export async function handleGuidanceRequest(payload) {
  const response = generateGuidance({
    ...payload,
    pageSnapshot: sanitizeSnapshot(payload.pageSnapshot || {})
  });

  return createJsonResponse(200, response);
}

export async function handleTrialStatusRequest(installId) {
  const safeInstallId = normalizeInstallId(installId);
  return createJsonResponse(200, await getTrialUsage(safeInstallId));
}

export async function handleTrialChatRequest(payload) {
  const installId = normalizeInstallId(payload.installId);
  const feature = String(payload.feature || "unknown").slice(0, 50);
  const quota = await getTrialUsage(installId);

  if (quota.remainingFreeUses <= 0) {
    return createJsonResponse(402, {
      error: {
        code: "TRIAL_QUOTA_EXCEEDED",
        message: "免费体验次数已用完，请填写你自己的 API Key 后继续使用。"
      },
      ...quota
    });
  }

  const upstream = await proxyTrialChat(payload.request || {});
  const consumed = await consumeTrialUsage(installId, feature);

  return createJsonResponse(200, {
    ...upstream,
    usageMeta: {
      mode: "trial",
      ...consumed
    }
  });
}
