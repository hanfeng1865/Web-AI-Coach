import { QUICK_PROMPTS } from "./knowledge.js";

const DEFAULT_API_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4.1-mini";
const DEFAULT_TIMEOUT_MS = 180000;

function isTimeoutError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return error?.name === "TimeoutError" || message.includes("timed out") || message.includes("timeout");
}

async function postJsonWithTimeout(url, options, timeoutMs) {
  return fetch(url, {
    ...options,
    signal: AbortSignal.timeout(timeoutMs)
  });
}

function extractJsonBlock(text) {
  if (!text) {
    throw new Error("Model returned empty content");
  }

  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]+?)\s*```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  throw new Error("Model did not return JSON");
}

function safeParseModelJson(text) {
  return JSON.parse(extractJsonBlock(text));
}

function normalizeHints(rawHints, snapshot) {
  const visibleModules = snapshot.visibleModules || [];
  return (rawHints || []).slice(0, 3).map((hint) => {
    const label = hint.label || hint.text || "";
    const matched = visibleModules.find((item) => item.label === label);
    return {
      label,
      text: label,
      selector: matched?.selector || "",
      reason: hint.reason || "建议先关注这个区域"
    };
  });
}

function normalizeRemoteResponse(raw, snapshot) {
  return {
    pageSummary: raw.pageSummary || "当前页面",
    answer: raw.answer || "模型已返回结果，但没有给出完整回答。",
    suggestedNextSteps: Array.isArray(raw.suggestedNextSteps) ? raw.suggestedNextSteps.slice(0, 4) : [],
    elementHints: normalizeHints(raw.elementHints, snapshot),
    confidence: Number.isFinite(raw.confidence) ? Math.max(0, Math.min(1, raw.confidence)) : 0.72,
    needsUserAction: raw.needsUserAction || "NONE",
    quickPrompts: QUICK_PROMPTS
  };
}

function buildMessages(payload, localDraft) {
  const systemPrompt = [
    "You are a page coach for complex websites.",
    "Answer in Chinese unless the user clearly uses another language.",
    "Use only the provided page snapshot, screenshot, and question.",
    "Do not claim to see information that is not visible.",
    "If the screenshot or page data is insufficient, say so explicitly.",
    "Do not ask for passwords or secrets.",
    "Output JSON only.",
    'Schema: {"pageSummary":"string","answer":"string","suggestedNextSteps":["string"],"elementHints":[{"label":"string","reason":"string"}],"confidence":0.0,"needsUserAction":"NONE|LOGIN_REQUIRED|UNSUPPORTED_PAGE"}'
  ].join("\n");

  const textPayload = {
    userQuestion: payload.question,
    locale: payload.locale || "zh-CN",
    conversationHistory: payload.conversationHistory || [],
    pageSnapshot: payload.pageSnapshot,
    hasScreenshot: Boolean(payload.screenshot?.dataUrl),
    localDraft
  };

  const userContent = [
    {
      type: "text",
      text: JSON.stringify(textPayload, null, 2)
    }
  ];

  if (payload.screenshot?.dataUrl) {
    userContent.push({
      type: "image_url",
      image_url: {
        url: payload.screenshot.dataUrl,
        detail: "high"
      }
    });
  }

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ];
}

export function getDefaultRemoteSettings() {
  return {
    remoteEnabled: true,
    apiUrl: DEFAULT_API_URL,
    model: DEFAULT_MODEL,
    apiKey: "",
    fallbackToLocal: true,
    timeoutMs: DEFAULT_TIMEOUT_MS
  };
}

export async function generateRemoteGuidance({ payload, settings, localDraft }) {
  const timeoutMs = Math.max(
    settings.timeoutMs || DEFAULT_TIMEOUT_MS,
    payload.screenshot?.dataUrl ? 240000 : DEFAULT_TIMEOUT_MS
  );

  const requestOptions = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify({
      model: settings.model || DEFAULT_MODEL,
      temperature: 0.2,
      messages: buildMessages(payload, localDraft)
    })
  };

  try {
    let response;

    try {
      response = await postJsonWithTimeout(settings.apiUrl || DEFAULT_API_URL, requestOptions, timeoutMs);
    } catch (error) {
      if (!isTimeoutError(error)) {
        throw error;
      }

      response = await postJsonWithTimeout(
        settings.apiUrl || DEFAULT_API_URL,
        requestOptions,
        timeoutMs + 120000
      );
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`API ${response.status}: ${text.slice(0, 240)}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    const parsed = safeParseModelJson(content);
    return normalizeRemoteResponse(parsed, payload.pageSnapshot);
  } catch (error) {
    throw error;
  }
}

export async function testRemoteConnection(settings) {
  try {
    const response = await postJsonWithTimeout(settings.apiUrl || DEFAULT_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model: settings.model || DEFAULT_MODEL,
        temperature: 0,
        messages: [
          { role: "system", content: "Reply with JSON only." },
          { role: "user", content: '{"ok":true,"message":"ping"}' }
        ]
      })
    }, 30000);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`API ${response.status}: ${text.slice(0, 240)}`);
    }

    const data = await response.json();
    return {
      ok: true,
      model: data?.model || settings.model || DEFAULT_MODEL
    };
  } catch (error) {
    throw error;
  }
}
