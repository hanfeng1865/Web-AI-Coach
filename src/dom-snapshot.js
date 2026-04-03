(function () {
  const MAX_TEXT_LENGTH = 80;
  const MAX_ITEMS = 16;
  const PREFERRED_TEXTS = [
    "本地",
    "AI 可见度",
    "AI PR",
    "流量与市场",
    "内容",
    "Copilot AI",
    "文件夹",
    "SEO",
    "广告",
    "Markets",
    "Portfolio",
    "Activity",
    "Rewards",
    "Trade",
    "Positions",
    "Sports",
    "Politics",
    "Crypto",
    "持仓",
    "未成交订单",
    "历史记录",
    "订单",
    "交易"
  ];

  function isVisible(element) {
    if (!(element instanceof Element)) {
      return false;
    }

    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom >= 0 &&
      rect.right >= 0
    );
  }

  function cleanText(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .replace(/[|·•]/g, " ")
      .trim()
      .slice(0, MAX_TEXT_LENGTH);
  }

  function buildSelector(element) {
    if (!(element instanceof Element)) {
      return "";
    }

    if (element.id) {
      return `#${CSS.escape(element.id)}`;
    }

    const parts = [];
    let node = element;
    let depth = 0;

    while (node && node !== document.body && depth < 5) {
      let selector = node.tagName.toLowerCase();

      if (node.classList.length) {
        const safeClass = Array.from(node.classList).find((item) => /^[a-z0-9_-]+$/i.test(item));
        if (safeClass) {
          selector += `.${safeClass}`;
          parts.unshift(selector);
          break;
        }
      }

      const siblings = Array.from(node.parentElement?.children || []).filter(
        (sibling) => sibling.tagName === node.tagName
      );

      if (siblings.length > 1) {
        selector += `:nth-of-type(${siblings.indexOf(node) + 1})`;
      }

      parts.unshift(selector);
      node = node.parentElement;
      depth += 1;
    }

    return parts.join(" > ");
  }

  function dedupe(items) {
    const seen = new Set();
    return items.filter((item) => {
      const key = `${item.label}|${item.selector}`;
      if (!item.label || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  function collectElements(selectors) {
    return selectors
      .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
      .filter(isVisible);
  }

  function collectTextItems(elements) {
    return dedupe(
      elements
        .map((element) => ({
          label: cleanText(element.innerText || element.textContent),
          selector: buildSelector(element)
        }))
        .filter((item) => item.label && item.label.length >= 2)
    ).slice(0, MAX_ITEMS);
  }

  function collectVisibleModules() {
    const matchedElements = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);

    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!isVisible(node)) {
        continue;
      }

      const text = cleanText(node.innerText || node.textContent);
      if (!text || text.length > 40) {
        continue;
      }

      if (PREFERRED_TEXTS.includes(text)) {
        matchedElements.push(node);
      }
    }

    const genericElements = collectElements([
      "h1",
      "h2",
      "h3",
      "h4",
      "[role='heading']",
      "button",
      "a",
      "[role='tab']",
      "[role='menuitem']",
      "nav a",
      "nav button",
      "aside a",
      "aside button",
      "[data-testid]"
    ]);

    return collectTextItems([...matchedElements, ...genericElements]);
  }

  function collectBreadcrumbs() {
    const elements = collectElements([
      "[aria-label*='breadcrumb' i] a",
      "[aria-label*='breadcrumb' i] span",
      "nav[aria-label*='breadcrumb' i] a",
      "nav[aria-label*='breadcrumb' i] span"
    ]);

    return collectTextItems(elements).map((item) => item.label).slice(0, 5);
  }

  function collectLeftNavItems() {
    const elements = collectElements(["aside a", "aside button", "nav a", "nav button"]);
    return collectTextItems(elements).slice(0, 12);
  }

  function collectPrimaryActions() {
    const elements = collectElements([
      "button",
      "[role='button']",
      "a[role='button']",
      "input[type='submit']"
    ]);

    return collectTextItems(elements).slice(0, 8);
  }

  function collectNotices() {
    const elements = collectElements([
      "[role='alert']",
      "[aria-live]",
      ".notice",
      ".alert",
      ".banner",
      ".toast"
    ]);

    return collectTextItems(elements).slice(0, 6);
  }

  function getSiteName() {
    const hostname = window.location.hostname.toLowerCase();
    if (hostname.includes("semrush") || hostname.endsWith("3ue.co")) {
      return "SEMrush";
    }
    if (hostname.includes("polymarket")) {
      return "Polymarket";
    }
    return hostname;
  }

  const api = {
    createSnapshot() {
      return {
        url: window.location.href,
        title: cleanText(document.title),
        siteName: getSiteName(),
        breadcrumbs: collectBreadcrumbs(),
        leftNavItems: collectLeftNavItems(),
        visibleModules: collectVisibleModules(),
        primaryActions: collectPrimaryActions(),
        notices: collectNotices()
      };
    }
  };

  window.PageCoachDom = api;
  window.SemrushCoachDom = api;
})();
