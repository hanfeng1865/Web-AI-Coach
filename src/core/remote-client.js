import { QUICK_PROMPTS } from "./knowledge.js";

const DEFAULT_API_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
const DEFAULT_MODEL = "qwen-vl-plus";
const DEFAULT_TIMEOUT_MS = 180000;
const DEFAULT_TRIAL_LIMIT = 15;
const DEFAULT_TRIAL_API_URL = "";

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

function escapeJsonStringControls(value) {
  return value.replace(/[\u0000-\u001f]/g, (char) => {
    if (char === "\n") return "\\n";
    if (char === "\r") return "\\r";
    if (char === "\t") return "\\t";
    return `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`;
  });
}

function isEscapedAt(value, index) {
  let slashCount = 0;
  for (let i = index - 1; i >= 0 && value[i] === "\\"; i -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function escapeBareJsonStringQuotes(value) {
  let escaped = "";
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (char === "\"" && !isEscapedAt(value, i)) {
      escaped += "\\\"";
    } else {
      escaped += char;
    }
  }
  return escaped;
}

function decodeJsonishString(value) {
  const withoutClosingQuote = value.trimEnd().replace(/(?<!\\)"$/, "");
  const cleaned = escapeBareJsonStringQuotes(escapeJsonStringControls(withoutClosingQuote));
  try {
    return JSON.parse(`"${cleaned}"`);
  } catch {
    return withoutClosingQuote
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, "\"");
  }
}

function parseStringFieldFromLooseJson(block, key, nextKey) {
  const keyPattern = new RegExp(`"${key}"\\s*:\\s*"`);
  const match = keyPattern.exec(block);
  if (!match) {
    return "";
  }

  const valueStart = match.index + match[0].length;
  const delimiterPattern = nextKey
    ? new RegExp(`,\\s*"${nextKey}"\\s*:`)
    : /\s*}\s*$/;
  const delimiterMatch = delimiterPattern.exec(block.slice(valueStart));
  if (!delimiterMatch) {
    return "";
  }

  return decodeJsonishString(block.slice(valueStart, valueStart + delimiterMatch.index));
}

function repairPageSummaryJson(block) {
  const requiredKeys = ["pageSummary", "summaryMarkdown", "mindmapMermaid"];
  if (!requiredKeys.every((key) => block.includes(`"${key}"`))) {
    return null;
  }

  return {
    pageSummary: parseStringFieldFromLooseJson(block, "pageSummary", "summaryMarkdown"),
    summaryMarkdown: parseStringFieldFromLooseJson(block, "summaryMarkdown", "mindmapMermaid"),
    mindmapMermaid: parseStringFieldFromLooseJson(block, "mindmapMermaid", null)
  };
}

export function safeParseModelJson(text) {
  const block = extractJsonBlock(text);
  try {
    return JSON.parse(block);
  } catch (e) {
    try {
      const cleaned = escapeJsonStringControls(block);
      return JSON.parse(cleaned);
    } catch (err) {
      const repairedPageSummary = repairPageSummaryJson(block);
      if (repairedPageSummary) {
        return repairedPageSummary;
      }
      throw e;
    }
  }
}

function hasDirectRemoteSettings(settings) {
  return Boolean(settings?.remoteEnabled && settings?.apiUrl && settings?.apiKey);
}

function hasTrialRemoteSettings(settings) {
  return Boolean(settings?.remoteEnabled && settings?.trialEnabled && settings?.trialApiUrl);
}

function normalizeTrialApiUrl(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

function buildTrialEndpoint(baseUrl, path) {
  return `${normalizeTrialApiUrl(baseUrl)}${path}`;
}

function buildResponseErrorMessage(status, data, fallbackText) {
  const message =
    data?.error?.message ||
    data?.message ||
    data?.error ||
    fallbackText ||
    `API ${status}`;
  return `API ${status}: ${String(message).slice(0, 240)}`;
}

function createTrialQuotaError(data) {
  const error = new Error(
    data?.error?.message ||
      data?.message ||
      "免费体验次数已用完，请填写你自己的 API Key 后继续使用。"
  );
  error.code = "TRIAL_QUOTA_EXCEEDED";
  error.remainingFreeUses = Number(data?.remainingFreeUses ?? data?.error?.remainingFreeUses ?? 0) || 0;
  error.freeTrialLimit = Number(data?.freeTrialLimit ?? data?.error?.freeTrialLimit ?? DEFAULT_TRIAL_LIMIT) || DEFAULT_TRIAL_LIMIT;
  return error;
}

async function parseJsonSafely(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function requestDirectCompletion({ settings, requestBody, timeoutMs }) {
  const response = await postJsonWithTimeout(
    settings.apiUrl || DEFAULT_API_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify(requestBody)
    },
    timeoutMs
  );

  if (!response.ok) {
    const data = await parseJsonSafely(response);
    throw new Error(buildResponseErrorMessage(response.status, data, await response.text().catch(() => "")));
  }

  return response.json();
}

async function requestTrialCompletion({ settings, feature, requestBody, timeoutMs }) {
  const response = await postJsonWithTimeout(
    buildTrialEndpoint(settings.trialApiUrl, "/chat"),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        installId: settings.installId || "",
        feature,
        request: requestBody
      })
    },
    timeoutMs
  );

  const data = await parseJsonSafely(response);
  if (!response.ok) {
    if (response.status === 402 || data?.error?.code === "TRIAL_QUOTA_EXCEEDED") {
      throw createTrialQuotaError(data);
    }
    throw new Error(buildResponseErrorMessage(response.status, data));
  }

  return data;
}

async function requestModelCompletion({ settings, feature, requestBody, timeoutMs }) {
  const trialAvailable = hasTrialRemoteSettings(settings);
  const directAvailable = hasDirectRemoteSettings(settings);

  if (trialAvailable) {
    try {
      return await requestTrialCompletion({ settings, feature, requestBody, timeoutMs });
    } catch (error) {
      if (error?.code === "TRIAL_QUOTA_EXCEEDED" && directAvailable) {
        return requestDirectCompletion({ settings, requestBody, timeoutMs });
      }

      if (!directAvailable) {
        throw error;
      }
    }
  }

  if (directAvailable) {
    return requestDirectCompletion({ settings, requestBody, timeoutMs });
  }

  throw new Error("请先配置体验服务地址，或填写你自己的 API Key。");
}

export async function getTrialStatus(settings) {
  if (!hasTrialRemoteSettings(settings)) {
    return {
      enabled: false,
      remainingFreeUses: 0,
      freeTrialLimit: settings?.freeTrialLimit || DEFAULT_TRIAL_LIMIT
    };
  }

  const query = new URLSearchParams({
    installId: settings.installId || ""
  });

  const response = await postJsonWithTimeout(
    `${buildTrialEndpoint(settings.trialApiUrl, "/status")}?${query.toString()}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json"
      }
    },
    15000
  );

  const data = await parseJsonSafely(response);
  if (!response.ok) {
    throw new Error(buildResponseErrorMessage(response.status, data));
  }

  return {
    enabled: true,
    remainingFreeUses: Number(data?.remainingFreeUses ?? 0) || 0,
    freeTrialLimit: Number(data?.freeTrialLimit ?? settings?.freeTrialLimit ?? DEFAULT_TRIAL_LIMIT) || DEFAULT_TRIAL_LIMIT,
    usedFreeUses: Number(data?.usedFreeUses ?? 0) || 0
  };
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

function attachUsageMeta(result, data) {
  if (data?.usageMeta) {
    result.usageMeta = data.usageMeta;
  }
  return result;
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
    selectedRegion: payload.pageSnapshot?.selectedRegion || null,
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
    trialEnabled: true,
    trialApiUrl: DEFAULT_TRIAL_API_URL,
    freeTrialLimit: DEFAULT_TRIAL_LIMIT,
    installId: "",
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

  const requestBody = {
    model: settings.model || DEFAULT_MODEL,
    temperature: 0.2,
    messages: buildMessages(payload, localDraft)
  };

  try {
    let data;

    try {
      data = await requestModelCompletion({
        settings,
        feature: "guidance",
        requestBody,
        timeoutMs
      });
    } catch (error) {
      if (!isTimeoutError(error)) {
        throw error;
      }

      data = await requestModelCompletion({
        settings,
        feature: "guidance",
        requestBody,
        timeoutMs: timeoutMs + 120000
      });
    }

    const content = data?.choices?.[0]?.message?.content;
    const parsed = safeParseModelJson(content);
    return attachUsageMeta(normalizeRemoteResponse(parsed, payload.pageSnapshot), data);
  } catch (error) {
    throw error;
  }
}

export async function testRemoteConnection(settings) {
  if (hasTrialRemoteSettings(settings)) {
    const trialStatus = await getTrialStatus(settings);
    return {
      ok: true,
      mode: "trial",
      model: settings.model || DEFAULT_MODEL,
      remainingFreeUses: trialStatus.remainingFreeUses,
      freeTrialLimit: trialStatus.freeTrialLimit
    };
  }

  if (!hasDirectRemoteSettings(settings)) {
    throw new Error("请先填写你自己的 API Key，或配置体验服务地址。");
  }

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
  "- 禁止感性描述，只说技术事实",
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

  const data = await requestModelCompletion({
    settings,
    feature: "ui_spec",
    requestBody: {
      model: settings.model || DEFAULT_MODEL,
      temperature: 0.1,
      messages
    },
    timeoutMs
  });
  const content = data?.choices?.[0]?.message?.content;
  return attachUsageMeta(safeParseModelJson(content), data);
}

const PRD_SYSTEM_PROMPT = [
  "你是一个资深产品经理。用户将提供网页的快照信息及截图。",
  "你需要逆向分析该网页的功能架构，并输出一份简明的产品需求文档（PRD）。",
  "规则：",
  "1. 主要功能模块：请做稍微详细的技术或业务介绍。",
  "2. 次要功能模块：列出核心功能点即可，一句话带过。",
  "3. 文档使用 Markdown 格式。",
  "4. 务必在文末用友好的口气提示用户：如果想了解某个具体功能的详情或技术实现，可以继续跟我对话讨论。",
  "5. 返回纯 JSON，禁止包含 markdown 代码块外壳。",
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

  const data = await requestModelCompletion({
    settings,
    feature: "prd",
    requestBody: {
      model: settings.model || DEFAULT_MODEL,
      temperature: 0.3,
      messages
    },
    timeoutMs
  });
  const content = data?.choices?.[0]?.message?.content;
  return attachUsageMeta(safeParseModelJson(content), data);
}

const PAGE_SUMMARY_SYSTEM_PROMPT = [
  "你是一个顶级信息萃取与知识架构助手。",
  "用户会给你当前网页的结构化快照以及页面截图。",
  "你的任务是榨干当前网页里的核心观点、方法论、步骤、实操技巧，并产出一份适合直接阅读和复制的 Markdown 总结，以及一份 Mermaid mindmap 脑图代码。",
  "",
  "输出要求：",
  "1. 全部使用中文。",
  "2. summaryMarkdown 必须是清晰的 Markdown，至少包含：页面主题、核心观点、方法论/框架、实操技巧、易忽略细节、行动建议。",
  "3. summaryMarkdown 中必须包含项目符号列表，并至少包含 1 个 Markdown 表格。",
  "4. 如果页面信息不足，不要编造；要明确写出哪些内容是页面明确提到的，哪些只是谨慎推断。",
  "5. mindmapMermaid 必须且只能使用 Mermaid mindmap 语法，以 mindmap 开头，第二行必须是 root((页面主题))。",
  "6. 禁止输出 graph TD、flowchart、A-->B、节点 ID、箭头、方括号节点语法；节点文本必须是给普通用户看的中文短语。",
  "7. 脑图根节点应是页面主题，向下展开 3-5 个一级分支，每个一级分支下再展开关键要点或技巧。",
  "8. 脑图尽量克制：总节点不超过 18 个，层级不超过 3 层，每个一级分支最多 4 个子点。",
  "9. 只返回严格 JSON，不要加代码块；三个字段的值都必须是合法 JSON 字符串，Markdown/Mermaid 里的换行必须写成 \\n，双引号必须转义成 \\\"。",
  'Schema: {"pageSummary":"string","summaryMarkdown":"string","mindmapMermaid":"string"}'
].join("\n");

export async function generatePageSummaryAnalysis({ payload, settings }) {
  const timeoutMs = Math.max(settings.timeoutMs || DEFAULT_TIMEOUT_MS, 240000);

  const userContent = [
    {
      type: "text",
      text: JSON.stringify({
        task: "PAGE_SUMMARY_AND_MINDMAP",
        url: payload.pageSnapshot?.url || "",
        title: payload.pageSnapshot?.title || "",
        pageSnapshot: payload.pageSnapshot,
        summarySource: payload.summarySource || null
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
    { role: "system", content: PAGE_SUMMARY_SYSTEM_PROMPT },
    { role: "user", content: userContent }
  ];

  const data = await requestModelCompletion({
    settings,
    feature: "page_summary",
    requestBody: {
      model: settings.model || DEFAULT_MODEL,
      temperature: 0.2,
      messages
    },
    timeoutMs
  });
  const content = data?.choices?.[0]?.message?.content;
  return attachUsageMeta(safeParseModelJson(content), data);
}

const PAGE_DIFF_SYSTEM_PROMPT = [
  "你是一个资深产品经理，正在输出正式的竞品分析报告。",
  "用户会给你当前页面，加上 1 到 3 个竞品页面的结构化快照、整页采样摘要，以及当前页面截图。",
  "你的任务不是随意点评，而是产出一份结构完整、表格优先、可直接阅读的多竞品分析报告。",
  "",
  "输出要求：",
  "1. 全部使用中文。",
  "2. 只返回 JSON，不要加代码块。",
  "3. answer 必须是简洁的纯文本段落，不要使用 Markdown 标题、列表、表格。",
  "4. comparisonTables 必须是表格数组，至少给出 4 张表，能表格化的内容尽量都放进表格。",
  "5. 每张表包含 title、columns、rows，rows 中每一行都要和 columns 列数一致。",
  "6. 报告结构尽量参考正式竞品分析报告，优先覆盖这些模块：竞品基本信息、目标用户/场景、信息架构、核心功能体验、非核心功能/差异化能力、运营与商业动作、优劣势总结、可借鉴建议。",
  "7. 如果行业/市场数据不足，就明确写成'当前页面证据不足'，不要编造市场规模或份额。",
  "8. 如果用户提供了 focus，就优先围绕该维度展开，同时保留整体判断。",
  "9. 表格风格要像报告，不要写成 Markdown 表格语法，不要输出 |---| 这种内容。",
  "10. answer 只保留少量概述、结论、风险提醒和建议；细项对比主要放在 comparisonTables。",
  "11. 不要把页面高度、采样点数量、可见模块数量这类低价值技术统计项写进报告或表格，除非用户明确要求。",
  "12. 竞品的不足之处和优化建议只有在页面证据明确、推断链路清楚时再写；如果证据不足，就直接省略，或者明确写成'当前页面证据不足，暂不给出该项结论'。",
  "13. 当前页面本身也算 1 个竞品对象，比较时要把当前页面和其他竞品一起放进表格列中。",
  'Schema: {"pageSummary":"竞品对比","answer":"plain text","comparisonTables":[{"title":"string","columns":["string"],"rows":[["string"]]}],"suggestedNextSteps":["string"],"confidence":0.0}'
].join("\n");

export async function generatePageDiffAnalysis({ payload, settings }) {
  const timeoutMs = Math.max(settings.timeoutMs || DEFAULT_TIMEOUT_MS, 240000);

  const userContent = [
    {
      type: "text",
      text: JSON.stringify(
        {
          task: "PAGE_DIFF_ANALYSIS",
          focus: payload.focus || "",
          targetUrls: payload.targetUrls || [],
          currentPage: payload.currentPage,
          targetPages: payload.targetPages || []
        },
        null,
        2
      )
    }
  ];

  if (payload.currentScreenshot?.dataUrl) {
    userContent.push({
      type: "image_url",
      image_url: {
        url: payload.currentScreenshot.dataUrl,
        detail: "high"
      }
    });
  }

  const data = await requestModelCompletion({
    settings,
    feature: "page_diff",
    requestBody: {
      model: settings.model || DEFAULT_MODEL,
      temperature: 0.2,
      messages: [
        { role: "system", content: PAGE_DIFF_SYSTEM_PROMPT },
        { role: "user", content: userContent }
      ]
    },
    timeoutMs
  });

  const content = data?.choices?.[0]?.message?.content;
  return attachUsageMeta(safeParseModelJson(content), data);
}


const PROJECT_ASSESSMENT_SYSTEM_PROMPT = [
  "你是一个资深产品分析专家，专门根据项目或产品需求，提炼详细、结构化的功能清单，并提供技术可行性分析与合规性判断。",
  "当用户提出某个功能需求时，你首先判断该需求是否存在以下问题：",
  "1. 逻辑上不合理（例如用户操作路径冲突、需求本身不成立）",
  "2. 工程上不可行或成本极高（例如平台有强安全策略、接口有签名校验）",
  "3. 违反平台协议或政策（如抖音、微信等封闭生态平台的绕过行为）",
  "若发现问题，你必须以以下结构输出：",
  "🚨 说明与警告：",
  "[简洁指出该需求可能存在的违规/不可行风险，例如“该功能绕过了抖音客户端的随机数生成逻辑，属于逻辑注入或伪造数据行为”]",
  "❌ 问题判断：",
  "[指出需求哪部分在逻辑上或工程上不成立，例如“数字是由服务器生成并签名校验，客户端无法控制”]",
  "[如果需求成立的前提不对，明确指出]",
  "当需求可能存在的违规/不可行风险生成一条给老板和客户的回复，要简明意赅，理由充分，他们能轻松理解为什么不可行，最好初中生都能看懂",
  "此外，在未发现明显问题时，你依然提供详尽、结构化的功能清单输出，遵循以下规则：",
  "你会按模块输出完整功能点，细化到所有用户交互与后台逻辑，考虑不同角色的功能需求（如用户、管理员、平台方、教练、采购员、司机、业务员等），补全遗漏项，并按业务主线进行合理分组与排序。",
  "你的输出为 Excel 表格风格，遵循如下结构：模块、功能点、功能说明。",
  "你不会主观添加非需求描述中的功能，除非出于完整业务闭环的目的（如流程起始、交付、反馈缺失等），此时补充功能需合理、必要，并确保不偏离原始产品定位。",
  "你会深入理解需求，提炼每一个功能细节，对可能遗漏之处主动补全，包括后台管理系统的功能，即便用户未提供后台界面截图，你也应基于完整业务闭环合理推测并补全管理端功能模块。",
  "你不会输出宽泛或模糊的描述，而是尽可能具体地拆解功能点。",
  "你会将不同角色或端的功能清单分开输出，例如先输出用户端功能表格，随后再输出后台管理端功能表格，若存在司机端、采购端、业务员端等角色，也应单独列出各自功能清单，确保结构清晰、不混杂。",
  "如果涉及用户注册/登录方式中的“微信”，统一采用“微信手机号快捷注册/登录”的描述方式。",
  "后台权限管理模块为必备模块，统一命名为“账号管理”，并始终包含“账号管理 > 后台账号权限设置 > 后台用户管理 > 添加账号/分配角色，控制后台操作权限”。",
  "即便用户仅提供用户端需求或截图，你也必须主动推测并补全对应后台管理端及其他角色端功能，以保障业务闭环，并输出清晰表格。",
  "你还应识别截图中所有核心业务流程（如商品选购、自动下单、订单查看、配送时间选择、优惠券领取等），并结合不同页面内容整合成完整产品功能列表，按照“用户端”、“后台管理端”以及其他可能存在的角色端（如司机端、采购端、业务员端）分别输出。",
  "⚠️ 如果你无法明确是否存在多个移动端角色，应主动询问用户角色边界划分，确认后再继续输出对应功能清单，避免遗漏。",
  "移动端“个人中心”相关功能排在后面，后台管理端的“账号管理”、“角色管理”等权限模块也应放在最后输出，优先展示业务流程主干功能模块。",
  "最后你在检查一遍各个模块下是否有遗漏的常规功能项，在输出，像产品经理一样严谨一点。",
  "此外，你会自动抽象出可配置的结构。例如，对于“课程分类”“专栏/公开课分类”等需求，你应统一抽象为“分类管理”或“内容分类”，并理解“专栏/公开课”仅为分类下的具体名称，不必将其作为独立功能点列出。所有支持动态命名/配置的场景，应进行结构抽象并避免重复列举。",
  "另外，在输出功能清单时，像“课程管理”“分类管理”“订单管理”“消息通知管理”等具备完整功能行为与独立业务逻辑的模块，应被单独列为一级模块。",
  "同时，当存在如 “课程信息管理”与“课程内容管理”等此类名称相近、边界模糊、操作紧密关联的功能时，应合并为统一的“课程管理”一级模块，并在该模块下分设子功能项（如基本信息管理、内容结构编辑等），避免模块粒度冗余、结构重复，提高信息组织效率。",
  "同一个端，比如都是管理后台的功能，不要拆开成不同的execl表展示，放在一起，凡用户提及存在多个业务角色端（如司机、业务员、屠宰员等），GPT必须同步为后台管理端补充对应角色的管理模块，不得遗漏任何真实参与业务流程角色的后台管理能力",
  "返回结构必须是 JSON 格式，如下所示：",
  'Schema: {"pageSummary":"项目评估方案","answer":"这里写符合格式要求的内容，使用 Markdown 输出表格和警告等，注意将换行替换为 \\n","suggestedNextSteps":["如果想了解详细，可以追问细节"],"confidence":0.9}'
].join("\n");

export async function generateProjectAssessmentAnalysis({ payload, settings }) {
  const timeoutMs = Math.max(settings.timeoutMs || 180000, 240000);

  const userContent = [
    {
      type: "text",
      text: JSON.stringify({
        task: "PROJECT_ASSESSMENT",
        requirement: payload.requirement
      }, null, 2)
    }
  ];

  const messages = [
    { role: "system", content: PROJECT_ASSESSMENT_SYSTEM_PROMPT },
    { role: "user", content: userContent }
  ];

  const data = await requestModelCompletion({
    settings,
    feature: "project_assessment",
    requestBody: {
      model: settings.model || "qwen-vl-max-latest",
      temperature: 0.2,
      messages
    },
    timeoutMs
  });
  const content = data?.choices?.[0]?.message?.content;
  return attachUsageMeta(safeParseModelJson(content), data);
}

const TIMELINE_KEYWORD_SYSTEM_PROMPT = [
  "你是一个对话问题压缩助手。",
  "用户会给你一句真实提问，你要提炼出一个适合显示在时间轴节点旁边的短关键词。",
  "输出要求：",
  "1. 只输出 JSON，不要加代码块。",
  "2. keyword 必须适合快速回忆问题主题，优先保留任务对象、产品名、核心动作。",
  "3. keyword 尽量短，中文建议 4-10 个字；英文建议 1-3 个词。",
  "4. 不要写成完整问句，不要带引号，不要加句号。",
  "5. 如果原问题很泛，就提炼成最核心的主题词。",
  'Schema: {"keyword":"string"}'
].join("\n");

export async function generateTimelineKeywordAnalysis({ payload, settings }) {
  const timeoutMs = Math.min(Math.max(settings.timeoutMs || DEFAULT_TIMEOUT_MS, 15000), 45000);

  const data = await requestDirectCompletion({
    settings,
    requestBody: {
      model: settings.model || DEFAULT_MODEL,
      temperature: 0.1,
      messages: [
        { role: "system", content: TIMELINE_KEYWORD_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: JSON.stringify({
                task: "TIMELINE_KEYWORD",
                question: payload.question || ""
              }, null, 2)
            }
          ]
        }
      ]
    },
    timeoutMs
  });

  const content = data?.choices?.[0]?.message?.content;
  return attachUsageMeta(safeParseModelJson(content), data);
}



const BRD_RESEARCH_SYSTEM_PROMPT = [
  "你是一个顶级的商业分析师和产品经理。你的任务是帮用户进行完整的 BRD (Business Requirements Document) 商业调研分析，遵循 6 步流程来冷酷、客观地验证一个产品想法是否可行、是否值得投入。",
  "请按照以下结构强制输出 Markdown 报告：",
  "第一步：需求验证 ✅。验证需求是否真实存在、频率和强度如何。判断这是否是一个伪需求或者已经被巨头免费解决的需求。",
  "第二步：竞品痛点挖掘 🔍。寻找核心竞品，利用真实的差评痛点（也可以模拟）来证明现有竞品没有做好的地方，指出用户的机会点在哪里。",
  "第三步：用户画像 👤。明确这群人是谁，什么场景下会用，并评估他们的付费意愿（愿意花多少钱）。",
  "第四步：市场规模 📊。基于 TAM/SAM/SOM 框架估算市场潜力和可触达的市场（不需要极其精确，但需要基于合理的逻辑推演）。",
  "第五步：定价策略 💲。分析竞品定价，给出合理的商业模式（如 Freemium、订阅制、买断制等）及定价值建议。",
  "第六步：GO/NO-GO 决策 🎯。给出最终判断！如果不可行，明确列出 NO-GO 信号（如大厂垄断、技术门槛太高、用户没钱等）；如果可行，则给出 GO 的切入点和建议。",
  "核心原则：",
  "- 3小时调研 > 3个月弯路，直接戳破幻想。",
  "- 差评比好评值钱，指出做产品的切入点需要“划算”而不是最便宜。",
  "",
  "你必须返回一个合法的 JSON 格式数据：",
  '{"pageSummary": "商业可行性报告：xxx产品","answer": "完整的 6 步 Markdown 调研报告内容，注意换行符转移","suggestedNextSteps": ["探索竞争对手的获客渠道", "深入挖掘某类人群的具体痛点", "转而考虑其他切入点等"],"confidence": 0.95}'
].join("\n");

export async function generateBrdResearchAnalysis({ payload, settings }) {
  const timeoutMs = Math.max(settings.timeoutMs || 180000, 240000);

  const userContent = [
    {
      type: "text",
      text: JSON.stringify({
        task: "BRD_RESEARCH",
        requirement: payload.requirement
      }, null, 2)
    }
  ];

  const messages = [
    { role: "system", content: BRD_RESEARCH_SYSTEM_PROMPT },
    { role: "user", content: userContent }
  ];

  const data = await requestModelCompletion({
    settings,
    feature: "brd_research",
    requestBody: {
      model: settings.model || "qwen-vl-max-latest",
      temperature: 0.3,
      messages
    },
    timeoutMs
  });
  const content = data?.choices?.[0]?.message?.content;
  return attachUsageMeta(safeParseModelJson(content), data);
}
