import { generateGuidance } from "./core/guidance-engine.js";
import { getDefaultRemoteSettings, generateRemoteGuidance, testRemoteConnection, generateUISpecAnalysis, generatePRDAnalysis } from "./core/remote-client.js";
import { buildRedactionSummary, redactArray, redactText } from "./core/redaction.js";

const DEFAULT_ALLOWED_HOSTS = [
  "semrush.com",
  "*.semrush.com",
  "*.semrush.com.cn",
  "sem.3ue.co",
  "*.3ue.co",
  "polymarket.com",
  "*.polymarket.com"
];

const DEFAULT_SETTINGS = {
  locale: "zh-CN",
  allowedHosts: DEFAULT_ALLOWED_HOSTS,
  ...getDefaultRemoteSettings()
};

function sanitizeSnapshot(snapshot) {
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

function buildScreenshotFallback(localDraft) {
  return {
    ...localDraft,
    answer:
      "我检测到你附加了截图，但当前没有启用可看图的远程模型，所以这次我不能真正理解图片内容。请启用远程 API 并使用支持视觉的模型。" +
      (localDraft.answer ? ` 当前基于页面摘要的保守回答：${localDraft.answer}` : ""),
    confidence: Math.min(localDraft.confidence || 0.5, 0.45)
  };
}

async function getSettings() {
  const data = await chrome.storage.local.get("semrushCoachSettings");
  return {
    ...DEFAULT_SETTINGS,
    ...(data.semrushCoachSettings || {})
  };
}

async function saveSettings(nextSettings) {
  const merged = {
    ...(await getSettings()),
    ...nextSettings
  };

  await chrome.storage.local.set({
    semrushCoachSettings: merged
  });

  return merged;
}

const LEGACY_API_URLS = [
  "https://api.openai.com/v1/chat/completions",
  "https://open.bigmodel.cn/api/paas/v4/chat/completions"
];

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get("semrushCoachSettings");
  const prev = existing.semrushCoachSettings || {};

  // 如果旧配置用的是已知不可用的默认 URL 且没有填过 Key，迁移到新默认
  if (!prev.apiUrl || LEGACY_API_URLS.includes(prev.apiUrl)) {
    prev.apiUrl = DEFAULT_SETTINGS.apiUrl;
    prev.model = DEFAULT_SETTINGS.model;
  }

  await chrome.storage.local.set({
    semrushCoachSettings: {
      ...DEFAULT_SETTINGS,
      ...prev
    }
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "SEMRUSH_COACH_LOAD_SETTINGS") {
    getSettings()
      .then((settings) => sendResponse({ ok: true, data: settings }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "SEMRUSH_COACH_SAVE_SETTINGS") {
    saveSettings(message.payload || {})
      .then((settings) => sendResponse({ ok: true, data: settings }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "SEMRUSH_COACH_TEST_CONNECTION") {
    getSettings()
      .then((settings) => testRemoteConnection(settings))
      .then((result) => sendResponse({ ok: true, data: result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "SEMRUSH_COACH_CAPTURE_TAB") {
    chrome.tabs.captureVisibleTab(null, { format: "jpeg", quality: 80 })
      .then((dataUrl) => sendResponse({ ok: true, dataUrl }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "SEMRUSH_COACH_UI_SPEC") {
    (async () => {
      try {
        const settings = await getSettings();
        if (!settings.remoteEnabled || !settings.apiKey || !settings.apiUrl) {
          sendResponse({ ok: false, error: "请先配置远程模型 API" });
          return;
        }
        const payload = {
          ...message.payload,
          pageSnapshot: sanitizeSnapshot(message.payload.pageSnapshot)
        };
        console.log("[AI Coach] 开始 UI 规范提取...");
        const specData = await generateUISpecAnalysis({ payload, settings });
        console.log("[AI Coach] UI 规范提取完成");
        sendResponse({ ok: true, data: specData });
      } catch (error) {
        console.error("[AI Coach] UI 规范提取失败:", error);
        sendResponse({ ok: false, error: error instanceof Error ? error.message : "Unknown error" });
      }
    })();
    return true;
  }

  if (message?.type === "SEMRUSH_COACH_PRD_DOCUMENT") {
    (async () => {
      try {
        const settings = await getSettings();
        if (!settings.remoteEnabled || !settings.apiKey || !settings.apiUrl) {
          sendResponse({ ok: false, error: "请先配置远程模型 API" });
          return;
        }
        const payload = {
          ...message.payload,
          pageSnapshot: sanitizeSnapshot(message.payload.pageSnapshot)
        };
        console.log("[AI Coach] 开始 PRD 文档生成...");
        const prdData = await generatePRDAnalysis({ payload, settings });
        console.log("[AI Coach] PRD 文档生成完成");
        sendResponse({ ok: true, data: prdData });
      } catch (error) {
        console.error("[AI Coach] PRD 文档生成失败:", error);
        sendResponse({ ok: false, error: error instanceof Error ? error.message : "Unknown error" });
      }
    })();
    return true;
  }

  if (message?.type !== "SEMRUSH_COACH_GUIDANCE") {
    return false;
  }

  (async () => {
    try {
      const settings = await getSettings();
      const payload = {
        ...message.payload,
        pageSnapshot: sanitizeSnapshot(message.payload.pageSnapshot)
      };

      let localDraft = generateGuidance(payload);

      if (payload.screenshot?.dataUrl) {
        localDraft = buildScreenshotFallback(localDraft);
      }

      if (settings.remoteEnabled && settings.apiKey && settings.apiUrl) {
        try {
          const imgSize = payload.screenshot?.dataUrl?.length || 0;
          console.log(`[AI Coach] 正在调用远程 API: ${settings.apiUrl}, 模型: ${settings.model}, 图片大小: ${Math.round(imgSize / 1024)}KB`);
          const remoteData = await generateRemoteGuidance({
            payload,
            settings,
            localDraft
          });
          console.log("[AI Coach] 远程 API 调用成功");
          sendResponse({ ok: true, data: remoteData, meta: { mode: "remote" } });
          return;
        } catch (error) {
          console.error("[AI Coach] 远程 API 调用失败:", error);
          if (!settings.fallbackToLocal) {
            throw error;
          }
          // 在兜底回复中显式加上远程请求失败的具体原因，方便排查
          localDraft.answer = `【系统提示：尝试调用大模型 API 时发生错误，已自动降级为本地规则。如果你传了图片，本地规则是看不懂截图的。错误详情：${error.message}】\n\n` + localDraft.answer;
        }
      }

      sendResponse({ ok: true, data: localDraft, meta: { mode: "local" } });
    } catch (error) {
           sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  })();

  return true;
});
