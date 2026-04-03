import { QUICK_PROMPTS } from "./knowledge.js";

const DEFAULT_API_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
const DEFAULT_MODEL = "qwen-vl-max-latest";
const DEFAULT_TIMEOUT_MS = 180000;

function isTimeoutError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return error?.name === "TimeoutError" || message.includes("timed out") || message.includes("timeout");
}

async function postJsonWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === "AbortError" || error?.name === "TimeoutError") {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
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
    "你是一个网页操作教练，帮用户看懂当前页面、告诉他下一步该干什么。",
    "回答规则：",
    "- 用中文，除非用户用了其他语言",
    "- 说人话，像朋友聊天一样，禁止官腔废话",
    "- 直接说重点，不要重复描述用户已经能看到的东西",
    "- 回答控制在 3-5 句话以内，除非用户明确要求详细解释",
    "- suggestedNextSteps 最多给 3 条，每条一句话",
    "- 如果有截图，只说截图里值得注意的关键信息，不要逐像素描述",
    "- 不要说'根据您提供的截图'之类的套话，直接说结论",
    "- 禁止自动操作页面，只做指导",
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

const UI_SPEC_SYSTEM_PROMPT = [
  "你是一个像素级 UI 逆向工程专家。用户会给你一个网站的截图和从 DOM 中提取的 computed style 数据。",
  "你的任务是对这个网站进行严格的、定量的视觉技术文档输出。",
  "",
  "### 输出规则",
  "- 所有颜色必须给出精确 Hex 值",
  "- 所有尺寸必须给出 px 数值",
  "- 禁止感性描述（如'清新的''优雅的'），只说技术事实",
  "- 用中文输出",
  "- 只输出纯 JSON，不要 markdown 代码块",
  "",
  "### JSON Schema",
  JSON.stringify({
    colorSystem: {
      classification: "string, 色系分类如：高对比度深色系、莫兰迪色系、Material Design 3.0、Apple 简约灰阶等",
      palette: {
        primary: "hex",
        primaryHover: "hex",
        secondary: "hex",
        background: "hex",
        surfaceCard: "hex",
        textHeading: "hex",
        textBody: "hex",
        textMuted: "hex",
        border: "hex",
        statusSuccess: "hex",
        statusError: "hex",
        statusWarning: "hex"
      }
    },
    typography: {
      fontFamily: "string, 当前使用的字体栈",
      style: "Sans-serif | Serif | Monospace",
      openSourceAlternatives: ["推荐1-2个开源替代字体"],
      scale: {
        h1: { sizePx: 0, weight: "string", lineHeight: "string" },
        h2: { sizePx: 0, weight: "string", lineHeight: "string" },
        body: { sizePx: 0, weight: "string", lineHeight: "string" },
        small: { sizePx: 0, weight: "string", lineHeight: "string" }
      }
    },
    spacingAndShapes: {
      baseUnit: "4px | 8px | other",
      spacingExamples: { sectionGap: "px", cardPadding: "px", elementGap: "px" },
      borderRadius: { buttons: "px", cards: "px", inputs: "px", avatars: "px" },
      elevation: "无阴影扁平化 | 微阴影 | 大弥散投影",
      shadowExample: "CSS box-shadow 值"
    },
    components: {
      buttons: {
        heightPx: 0,
        paddingH: "px",
        paddingV: "px",
        fontSize: "px",
        fontWeight: "string",
        borderRadius: "px",
        primaryBg: "hex",
        primaryText: "hex",
        hoverEffect: "string"
      },
      inputs: {
        heightPx: 0,
        borderWidth: "px",
        borderColor: "hex",
        background: "hex",
        placeholderColor: "hex",
        borderRadius: "px",
        focusBorderColor: "hex"
      },
      cards: {
        padding: "px",
        borderRadius: "px",
        background: "hex",
        borderColor: "hex",
        shadow: "CSS box-shadow"
      }
    },
    iconStyle: "线性 | 填充 | 双色 | 品牌自绘",
    contentLayout: {
      type: "左右分栏 | 上下流式 | 网格 | 仪表盘",
      sidebarWidthPx: 0,
      mainContentMaxWidthPx: 0,
      headerHeightPx: 0
    },
    brandVibe: "string, 一句话总结品牌调性，如：专业商务工具风、年轻社交活力风",
    tailwindConfig: "string, 直接可用的 tailwind.config.js extend 配置代码"
  }, null, 2)
].join("\n");

export async function generateUISpecAnalysis({ payload, settings }) {
  const timeoutMs = Math.max(settings.timeoutMs || DEFAULT_TIMEOUT_MS, 240000);

  const userContent = [
    {
      type: "text",
      text: JSON.stringify({
        task: "UI_SPEC_EXTRACTION",
        url: payload.pageSnapshot?.url || "",
        title: payload.pageSnapshot?.title || "",
        computedStyles: payload.computedStyles || {},
        pageSnapshot: payload.pageSnapshot
      }, null, 2)
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

  const messages = [
    { role: "system", content: UI_SPEC_SYSTEM_PROMPT },
    { role: "user", content: userContent }
  ];

  const response = await postJsonWithTimeout(settings.apiUrl || DEFAULT_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify({
      model: settings.model || DEFAULT_MODEL,
      temperature: 0.1,
      messages
    })
  }, timeoutMs);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API ${response.status}: ${text.slice(0, 240)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  return safeParseModelJson(content);
}

const PRD_SYSTEM_PROMPT = [
  "你是一个资深产品经理。用户将提供网页的快照信息及截图。",
  "你需要逆向分析该网页的功能架构，并输出一份简明的「产品需求文档（PRD）」。",
  "规则：",
  "1. 主要功能模块：请作稍微详细的技术或业务介绍。",
  "2. 次要功能模块：列出核心功能点即可，一句话带过。",
  "3. 文档使用 Markdown 格式。",
  "4. 务必在文末用友好的口气提示用户：'如果想了解某个具体功能的详情或是技术实现，可以继续跟我对话讨论哦！'",
  "5. 返回纯 JSON，禁止包含 markdown 代码块外壳！",
  'Schema: {"pageSummary":"产品需求文档 (PRD)","answer":"这里写 Markdown 格式的 PRD 内容，注意将换行替换为 \\n"}'
].join("\n");

export async function generatePRDAnalysis({ payload, settings }) {
  const timeoutMs = Math.max(settings.timeoutMs || DEFAULT_TIMEOUT_MS, 240000);

  const userContent = [
    {
      type: "text",
      text: JSON.stringify({
        task: "PRD_GENERATION",
        url: payload.pageSnapshot?.url || "",
        title: payload.pageSnapshot?.title || "",
        pageSnapshot: payload.pageSnapshot
      }, null, 2)
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

  const messages = [
    { role: "system", content: PRD_SYSTEM_PROMPT },
    { role: "user", content: userContent }
  ];

  const response = await postJsonWithTimeout(settings.apiUrl || DEFAULT_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify({
      model: settings.model || DEFAULT_MODEL,
      temperature: 0.3,
      messages
    })
  }, timeoutMs);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API ${response.status}: ${text.slice(0, 240)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  return safeParseModelJson(content);
}
