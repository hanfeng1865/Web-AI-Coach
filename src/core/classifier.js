import { getPageGuide, getSiteIdFromUrl, getSiteNameFromUrl } from "./knowledge.js";

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, "");
}

function collectLabels(snapshot) {
  return [
    snapshot.title,
    ...(snapshot.breadcrumbs || []),
    ...((snapshot.leftNavItems || []).map((item) => item.label)),
    ...((snapshot.visibleModules || []).map((item) => item.label)),
    ...((snapshot.primaryActions || []).map((item) => item.label)),
    ...((snapshot.notices || []).map((item) => item.label))
  ]
    .filter(Boolean)
    .join(" ");
}

function hasLabel(snapshot, values) {
  const haystack = normalizeText(collectLabels(snapshot));
  return values.some((value) => haystack.includes(normalizeText(value)));
}

function isLoginPage(snapshot, pathname) {
  return (
    pathname.includes("/login") ||
    pathname.includes("/signin") ||
    pathname.includes("/sign-in") ||
    pathname.includes("/auth") ||
    hasLabel(snapshot, ["登录", "sign in", "connect wallet", "连接钱包", "authorize", "授权"])
  );
}

function classifySemrushPage(snapshot, pathname) {
  if (
    pathname.includes("/home") ||
    hasLabel(snapshot, ["本地", "ai 可见度", "ai pr", "流量与市场", "内容", "copilot ai"])
  ) {
    return "home";
  }

  if (hasLabel(snapshot, ["关键词", "keyword"])) {
    return "keywords";
  }

  if (hasLabel(snapshot, ["流量", "市场", "竞争", "traffic", "market", "competitor"])) {
    return "competitive";
  }

  if (hasLabel(snapshot, ["内容", "content"])) {
    return "content";
  }

  if (hasLabel(snapshot, ["文件夹", "项目", "folder", "project"])) {
    return "folders";
  }

  if ((snapshot.leftNavItems || []).length >= 4) {
    return "navigation";
  }

  return "generic";
}

function classifyPolymarketPage(snapshot, pathname) {
  if (
    pathname.includes("/event/") ||
    pathname.includes("/market/") ||
    pathname.includes("/markets/") ||
    hasLabel(snapshot, ["buy", "sell", "yes", "no", "chance", "outcome", "trade"])
  ) {
    return "market";
  }

  if (
    pathname.includes("/portfolio") ||
    pathname.includes("/profile") ||
    hasLabel(snapshot, ["portfolio", "positions", "持仓", "仓位", "holdings"])
  ) {
    return "portfolio";
  }

  if (pathname.includes("/activity") || hasLabel(snapshot, ["activity", "history", "记录", "成交历史"])) {
    return "activity";
  }

  if (pathname.includes("/rewards") || hasLabel(snapshot, ["rewards", "积分", "奖励", "incentives"])) {
    return "rewards";
  }

  if (hasLabel(snapshot, ["markets", "trending", "discover", "sports", "politics", "crypto", "市场"])) {
    return "home";
  }

  if ((snapshot.leftNavItems || []).length >= 4) {
    return "navigation";
  }

  return "generic";
}

export function isSupportedUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function getSiteId(snapshotOrUrl) {
  if (typeof snapshotOrUrl === "string") {
    return getSiteIdFromUrl(snapshotOrUrl);
  }

  return getSiteIdFromUrl(snapshotOrUrl?.url || "");
}

export function classifyPage(snapshot) {
  const url = snapshot?.url || "";
  if (!isSupportedUrl(url)) {
    return "unsupported";
  }

  const siteId = getSiteId(snapshot);
  let pathname = "";
  try {
    pathname = new URL(url).pathname.toLowerCase();
  } catch {
    pathname = "";
  }

  if (isLoginPage(snapshot, pathname)) {
    return "login";
  }

  if (siteId === "semrush") {
    return classifySemrushPage(snapshot, pathname);
  }

  if (siteId === "polymarket") {
    return classifyPolymarketPage(snapshot, pathname);
  }

  if ((snapshot.leftNavItems || []).length >= 4) {
    return "navigation";
  }

  return "generic";
}

export function buildPageSummary(pageKind, snapshot) {
  const siteId = getSiteId(snapshot);
  const siteName =
    getSiteNameFromUrl(snapshot.url || "") ||
    (() => {
      try {
        return new URL(snapshot.url || "").hostname;
      } catch {
        return "当前网站";
      }
    })();
  const guide = getPageGuide(siteId, pageKind);
  const visibleLabels = (snapshot.visibleModules || []).map((item) => item.label).slice(0, 5);
  const actions = (snapshot.primaryActions || []).map((item) => item.label).slice(0, 3);
  const pieces = [guide.summary || `这是 ${siteName} 的当前页面。`];

  if (visibleLabels.length) {
    pieces.push(`我当前能看到的主要模块有：${visibleLabels.join("、")}。`);
  }

  if (actions.length) {
    pieces.push(`页面上比较明显的操作包括：${actions.join("、")}。`);
  }

  return pieces.join(" ");
}
