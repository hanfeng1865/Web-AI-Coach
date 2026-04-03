import { buildPageSummary, classifyPage, getSiteId } from "./classifier.js";
import {
  QUICK_PROMPTS,
  UNSUPPORTED_MESSAGE,
  getModulesForSite,
  getPageGuide,
  getSiteNameFromUrl
} from "./knowledge.js";

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function includesAny(question, keywords) {
  const normalized = normalizeText(question);
  return keywords.some((keyword) => normalized.includes(normalizeText(keyword)));
}

function detectIntent(question) {
  if (includesAny(question, ["区别", "不同", "哪个好", "分别", "差异"])) {
    return "compare";
  }

  if (includesAny(question, ["下一步", "点哪里", "先点", "先用哪个", "从哪开始", "怎么做"])) {
    return "next_step";
  }

  if (includesAny(question, ["怎么看", "如何看", "结果怎么看", "数据怎么看", "这是什么意思"])) {
    return "interpret";
  }

  return "explain";
}

function findMentionedModules(question, snapshot, siteId) {
  const normalized = normalizeText(question);
  const knowledge = getModulesForSite(siteId);
  const matches = [];

  for (const [label, meta] of Object.entries(knowledge)) {
    const candidates = [label, ...(meta.aliases || [])];
    if (candidates.some((item) => normalized.includes(normalizeText(item)))) {
      matches.push(label);
    }
  }

  if (matches.length) {
    return [...new Set(matches)];
  }

  const visible = (snapshot.visibleModules || [])
    .map((item) => item.label)
    .filter((label) => normalized.includes(normalizeText(label)));

  return [...new Set(visible)];
}

function findElementHints(snapshot, labels) {
  const labelSet = new Set(labels);
  return (snapshot.visibleModules || [])
    .filter((item) => labelSet.has(item.label))
    .slice(0, 3)
    .map((item) => ({
      label: item.label,
      selector: item.selector,
      text: item.label,
      reason: `可以先关注“${item.label}”这个区域。`
    }));
}

function moduleExplainResponse(siteId, moduleName) {
  const module = getModulesForSite(siteId)[moduleName];
  if (!module) {
    return "";
  }
  return `“${moduleName}”主要用来${module.purpose}`;
}

function compareModules(siteId, moduleNames) {
  const knowledge = getModulesForSite(siteId);
  const explanations = moduleNames
    .map((name) => {
      const module = knowledge[name];
      if (!module) {
        return "";
      }
      return `“${name}”偏向${module.purpose}`;
    })
    .filter(Boolean);

  return explanations.join("；");
}

function chooseNextSteps(siteId, pageKind, moduleNames, question) {
  const knowledge = getModulesForSite(siteId);

  if (moduleNames.length) {
    return moduleNames
      .map((name) => knowledge[name]?.nextStep)
      .filter(Boolean)
      .slice(0, 3);
  }

  if (siteId === "semrush" && includesAny(question, ["内容seo", "内容", "文章", "博客"])) {
    return [
      "先进入“内容”模块，确认你要做的是选题、写作还是优化已有内容。",
      "再看和主题相关的关键词或内容机会。",
      "最后把结果整理成明确的内容任务。"
    ];
  }

  if (siteId === "polymarket" && includesAny(question, ["买", "卖", "yes", "no", "交易", "下单"])) {
    return [
      "先进入具体市场页，不要只停留在总览页。",
      "先看事件规则和结算条件，再决定买 YES 还是买 NO。",
      "确认价格、仓位和风险后再操作。"
    ];
  }

  return getPageGuide(siteId, pageKind).nextSteps || [];
}

function buildConfidence(pageKind, mentionedModules) {
  if (pageKind === "unsupported") {
    return 0.1;
  }

  if (pageKind === "login") {
    return 0.95;
  }

  if (mentionedModules.length >= 1) {
    return 0.9;
  }

  if (pageKind === "home" || pageKind === "market" || pageKind === "portfolio") {
    return 0.84;
  }

  return 0.72;
}

function buildUnsupportedAnswer(snapshot) {
  return {
    answer: `${UNSUPPORTED_MESSAGE} 目前已接入的网站包括 SEMrush 和 Polymarket。`,
    suggestedNextSteps: [
      "切到已接入的网站后再问我。",
      "如果你想给别的网站也加上这个能力，需要把扩展的注入域名和页面知识层一起接进去。"
    ],
    elementHints: [],
    needsUserAction: "UNSUPPORTED_PAGE"
  };
}

function buildAnswer({ siteId, pageKind, question, mentionedModules, snapshot }) {
  const siteName = getSiteNameFromUrl(snapshot.url || "") || "当前网站";
  const intent = detectIntent(question);

  if (pageKind === "login") {
    return {
      answer: `你现在在 ${siteName} 的登录、钱包连接或权限页。我不会读取密码，也不会替你登录。请先手动完成登录或授权，完成后我再根据新页面继续解释。`,
      suggestedNextSteps: ["先完成登录或授权。", "完成后回到目标页面，再直接问我这个页面怎么用。"],
      elementHints: [],
      needsUserAction: "LOGIN_REQUIRED"
    };
  }

  if (pageKind === "unsupported") {
    return buildUnsupportedAnswer(snapshot);
  }

  if (intent === "compare" && mentionedModules.length >= 2) {
    return {
      answer: compareModules(siteId, mentionedModules),
      suggestedNextSteps: chooseNextSteps(siteId, pageKind, mentionedModules, question),
      elementHints: findElementHints(snapshot, mentionedModules),
      needsUserAction: "NONE"
    };
  }

  if (mentionedModules.length >= 1) {
    const focused = mentionedModules[0];
    const explanation = moduleExplainResponse(siteId, focused);
    const interpretNote =
      intent === "interpret"
        ? "如果你已经点进更细的数据页，也可以继续把你看到的表格、按钮或截图发给我，我会按当前页继续解释。"
        : "";

    return {
      answer: `${explanation} 当前页面里它应该就是你最值得先关注的入口。${interpretNote}`.trim(),
      suggestedNextSteps: chooseNextSteps(siteId, pageKind, [focused], question),
      elementHints: findElementHints(snapshot, [focused]),
      needsUserAction: "NONE"
    };
  }

  if (intent === "next_step") {
    return {
      answer: `${buildPageSummary(pageKind, snapshot)} 如果你现在还没有很明确的任务，最稳的做法是先进入和目标最接近的一层模块，而不是在所有入口之间来回切换。`,
      suggestedNextSteps: chooseNextSteps(siteId, pageKind, [], question),
      elementHints: (snapshot.visibleModules || []).slice(0, 3).map((item) => ({
        label: item.label,
        selector: item.selector,
        text: item.label,
        reason: "这是当前页面里最像下一步入口的区域。"
      })),
      needsUserAction: "NONE"
    };
  }

  return {
    answer: `${buildPageSummary(pageKind, snapshot)} 如果你是第一次来到这个页面，建议先理解页面用途，再进入最接近你目标的那个入口。`,
    suggestedNextSteps: chooseNextSteps(siteId, pageKind, [], question),
    elementHints: (snapshot.visibleModules || []).slice(0, 3).map((item) => ({
      label: item.label,
      selector: item.selector,
      text: item.label,
      reason: "这是当前页面里最值得先理解的模块。"
    })),
    needsUserAction: "NONE"
  };
}

export function generateGuidance(request) {
  const snapshot = request.pageSnapshot || {};
  const siteId = getSiteId(snapshot);
  const pageKind = classifyPage(snapshot);
  const mentionedModules = findMentionedModules(request.question, snapshot, siteId);
  const response = buildAnswer({
    siteId,
    pageKind,
    question: request.question,
    mentionedModules,
    snapshot
  });

  return {
    pageSummary: buildPageSummary(pageKind, snapshot),
    answer: response.answer,
    suggestedNextSteps: response.suggestedNextSteps || [],
    elementHints: response.elementHints || [],
    confidence: buildConfidence(pageKind, mentionedModules),
    needsUserAction: response.needsUserAction || "NONE",
    quickPrompts: QUICK_PROMPTS
  };
}
