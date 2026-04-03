import test from "node:test";
import assert from "node:assert/strict";
import { classifyPage } from "../src/core/classifier.js";
import { generateGuidance } from "../src/core/guidance-engine.js";
import { redactText } from "../src/core/redaction.js";

function makeSemrushSnapshot(overrides = {}) {
  return {
    url: "https://sem.3ue.co/home",
    title: "SEMrush Home",
    breadcrumbs: [],
    leftNavItems: [{ label: "SEO", selector: "aside a:nth-of-type(1)" }],
    visibleModules: [
      { label: "本地", selector: "div:nth-of-type(1)" },
      { label: "AI 可见度", selector: "div:nth-of-type(2)" },
      { label: "内容", selector: "div:nth-of-type(3)" }
    ],
    primaryActions: [{ label: "创建文件夹", selector: "button:nth-of-type(1)" }],
    notices: [],
    ...overrides
  };
}

function makePolymarketSnapshot(overrides = {}) {
  return {
    url: "https://polymarket.com/event/will-btc-hit-120k",
    title: "Will BTC hit 120k?",
    breadcrumbs: [],
    leftNavItems: [{ label: "Markets", selector: "nav a:nth-of-type(1)" }],
    visibleModules: [
      { label: "Trade", selector: "div:nth-of-type(1)" },
      { label: "Portfolio", selector: "div:nth-of-type(2)" },
      { label: "Positions", selector: "div:nth-of-type(3)" }
    ],
    primaryActions: [
      { label: "Buy YES", selector: "button:nth-of-type(1)" },
      { label: "Buy NO", selector: "button:nth-of-type(2)" }
    ],
    notices: [],
    ...overrides
  };
}

function makeCustomSnapshot(overrides = {}) {
  return {
    url: "https://app.example.com/dashboard",
    title: "Example Dashboard",
    breadcrumbs: [],
    leftNavItems: [{ label: "Overview", selector: "nav a:nth-of-type(1)" }],
    visibleModules: [
      { label: "Overview", selector: "section:nth-of-type(1)" },
      { label: "Reports", selector: "section:nth-of-type(2)" },
      { label: "Settings", selector: "section:nth-of-type(3)" }
    ],
    primaryActions: [{ label: "Create report", selector: "button:nth-of-type(1)" }],
    notices: [],
    ...overrides
  };
}

test("classifyPage detects SEMrush home page", () => {
  assert.equal(classifyPage(makeSemrushSnapshot()), "home");
});

test("classifyPage detects Polymarket market page", () => {
  assert.equal(classifyPage(makePolymarketSnapshot()), "market");
});

test("classifyPage keeps custom websites in generic mode", () => {
  assert.equal(classifyPage(makeCustomSnapshot()), "generic");
});

test("generateGuidance explains visible SEMrush modules", () => {
  const response = generateGuidance({
    question: "AI 可见度是干什么的",
    locale: "zh-CN",
    pageSnapshot: makeSemrushSnapshot(),
    conversationHistory: []
  });

  assert.equal(response.needsUserAction, "NONE");
  assert.match(response.answer, /AI/);
  assert.ok(response.elementHints.length >= 1);
});

test("generateGuidance explains Polymarket trade flow", () => {
  const response = generateGuidance({
    question: "我想买这个市场，下一步怎么做",
    locale: "zh-CN",
    pageSnapshot: makePolymarketSnapshot(),
    conversationHistory: []
  });

  assert.equal(response.needsUserAction, "NONE");
  assert.match(response.answer, /Polymarket|市场页|Trade|YES|NO/);
  assert.ok(response.suggestedNextSteps.length >= 1);
});

test("generateGuidance handles generic custom websites", () => {
  const response = generateGuidance({
    question: "这个页面怎么用",
    locale: "zh-CN",
    pageSnapshot: makeCustomSnapshot(),
    conversationHistory: []
  });

  assert.equal(response.needsUserAction, "NONE");
  assert.match(response.answer, /Example Dashboard|Overview|Reports|Settings/);
});

test("generateGuidance asks user to login when login page is detected", () => {
  const response = generateGuidance({
    question: "这个页面怎么用",
    locale: "zh-CN",
    pageSnapshot: makeSemrushSnapshot({
      url: "https://sem.3ue.co/login",
      title: "登录"
    }),
    conversationHistory: []
  });

  assert.equal(response.needsUserAction, "LOGIN_REQUIRED");
});

test("redactText removes domains and emails", () => {
  const redacted = redactText("contact admin@example.com and open https://demo.example.com/12345");

  assert.equal(redacted.includes("example.com"), false);
  assert.equal(redacted.includes("admin@example.com"), false);
  assert.match(redacted, /\[email\]/);
  assert.match(redacted, /\[url\]/);
});
