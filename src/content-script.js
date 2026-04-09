(function () {
  if (window.__pageCoachMounted) {
    return;
  }
  window.__pageCoachMounted = true;

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
    remoteEnabled: true,
    trialEnabled: true,
    trialApiUrl: "",
    freeTrialLimit: 15,
    apiUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    model: "qwen-vl-max",
    apiKey: "",
    fallbackToLocal: true,
    allowedHosts: DEFAULT_ALLOWED_HOSTS
  };

  const QUICK_PROMPTS = [];

  const state = {
    open: false,
    expanded: false,
    loading: false,
    history: [],
    lastUrl: window.location.href,
    highlightTimer: null,
    settings: { ...DEFAULT_SETTINGS },
    mode: "local",
    settingsOpen: false,
    toolsMenuOpen: false,
    attachment: null,
    siteEnabled: true,
    selectionActive: false,
    selectionCleanup: null,
    focusMode: {
      active: false,
      host: null,
      theme: "dark"
    }
  };

  const root = document.createElement("div");
  root.className = "semrush-coach-root";
  document.body.appendChild(root);

  root.innerHTML = `
    <button class="semrush-coach-bubble" type="button" aria-label="打开页面 AI 教练">AI</button>
    <section class="semrush-coach-panel semrush-coach-hidden" aria-live="polite">
      <header class="semrush-coach-header">
        <div>
          <p class="semrush-coach-eyebrow">页面 AI 教练</p>
          <h2>看懂当前页面，告诉你下一步</h2>
        </div>
        <div class="semrush-coach-header-actions">
          <button class="semrush-coach-settings-toggle" type="button">体验 / API 设置</button>
          <button class="semrush-coach-close" type="button" aria-label="关闭">×</button>
        </div>
      </header>
      <div class="semrush-coach-page-chip">正在读取当前页面…</div>
      <section class="semrush-coach-settings semrush-coach-hidden">
        <div class="semrush-coach-settings-grid">
          <label class="semrush-coach-setting-full semrush-coach-admin-only">
            <span>体验服务地址</span>
            <input class="semrush-coach-setting-trial-api-url" type="text" placeholder="https://your-domain.com/api/trial" />
          </label>
          <label class="semrush-coach-setting-full semrush-coach-admin-only">
            <span>服务商</span>
            <select class="semrush-coach-setting-provider">
              <option value="qianwen" selected>通义千问 (Qianwen)</option>
              <option value="doubao">豆包 / 火山引擎</option>
              <option value="custom">自定义 (Custom)</option>
            </select>
          </label>
          <label class="semrush-coach-setting-full semrush-coach-admin-only">
            <span>API URL</span>
            <input class="semrush-coach-setting-api-url" type="text" placeholder="https://..." />
          </label>
          <label class="semrush-coach-setting-full semrush-coach-admin-only">
            <span>模型 (需支持视觉)</span>
            <select class="semrush-coach-setting-model-select"></select>
            <input class="semrush-coach-setting-model-input semrush-coach-hidden" type="text" placeholder="输入自定义模型名称，如 ep-202xxx" />
          </label>
          <label class="semrush-coach-setting-full">
            <span>你的 Qwen API Key（可选，免费次数用完后使用）</span>
            <input class="semrush-coach-setting-api-key" type="password" placeholder="填写通义千问 / Qwen 的 API Key" />
          </label>
          <label class="semrush-coach-setting-full">
            <span>启用网站列表（每行一个域名）</span>
            <textarea class="semrush-coach-setting-hosts" rows="5" placeholder="semrush.com&#10;polymarket.com&#10;*.example.com"></textarea>
          </label>
        </div>
        <div class="semrush-coach-settings-actions">
          <button class="semrush-coach-settings-save" type="button">保存</button>
          <button class="semrush-coach-settings-add-site" type="button">添加当前网站</button>
          <span class="semrush-coach-settings-status">远程模型未启用。</span>
        </div>
      </section>
      <div class="semrush-coach-history"></div>
      <div class="semrush-coach-quick-prompts"></div>
      <form class="semrush-coach-form">
        <textarea class="semrush-coach-input" rows="3" placeholder="直接输入你的问题，或者先上传/粘贴截图再提问。"></textarea>
        <input class="semrush-coach-file-input" type="file" accept="image/*" hidden />
        <div class="semrush-coach-attachment semrush-coach-hidden"></div>
        <div class="semrush-coach-form-row">
          <div class="semrush-coach-form-tools">
            <button class="semrush-coach-paste-text" type="button">粘贴文本</button>
            <button class="semrush-coach-format-markdown" type="button">转 Markdown</button>
            <button class="semrush-coach-attach" type="button">上传图片</button>
            <button class="semrush-coach-extract-ui" type="button">🎨 提取UI规范</button>
            <button class="semrush-coach-generate-prd" type="button">📄 生成PRD</button>
            <button class="semrush-coach-generate-summary" type="button">🧠 总结+脑图</button>
          </div>
          <button class="semrush-coach-submit" type="submit">提问</button>
        </div>
      </form>
    </section>
    <section class="semrush-coach-mindmap-modal semrush-coach-hidden" aria-hidden="true">
      <div class="semrush-coach-mindmap-modal-backdrop"></div>
      <div class="semrush-coach-mindmap-modal-dialog">
        <div class="semrush-coach-mindmap-modal-header">
          <p class="semrush-coach-card-title" style="margin:0;">脑图预览</p>
          <button class="semrush-coach-mindmap-modal-close" type="button" aria-label="关闭">×</button>
        </div>
        <div class="semrush-coach-mindmap-modal-body"></div>
      </div>
    </section>
  `;

  const bubble = root.querySelector(".semrush-coach-bubble");
  const panel = root.querySelector(".semrush-coach-panel");
  const mindmapModalEl = root.querySelector(".semrush-coach-mindmap-modal");
  const mindmapModalBodyEl = root.querySelector(".semrush-coach-mindmap-modal-body");
  const mindmapModalCloseEl = root.querySelector(".semrush-coach-mindmap-modal-close");
  const closeButton = root.querySelector(".semrush-coach-close");
  const historyEl = root.querySelector(".semrush-coach-history");
  const chipEl = root.querySelector(".semrush-coach-page-chip");
  const inputEl = root.querySelector(".semrush-coach-input");
  const formEl = root.querySelector(".semrush-coach-form");
  const submitButton = root.querySelector(".semrush-coach-submit");
  const promptEl = root.querySelector(".semrush-coach-quick-prompts");
  const settingsToggleEl = root.querySelector(".semrush-coach-settings-toggle");
  const settingsPanelEl = root.querySelector(".semrush-coach-settings");
  const settingsStatusEl = root.querySelector(".semrush-coach-settings-status");
  const saveSettingsEl = root.querySelector(".semrush-coach-settings-save");
  const addCurrentSiteEl = root.querySelector(".semrush-coach-settings-add-site");
  const attachmentEl = root.querySelector(".semrush-coach-attachment");
  const fileInputEl = root.querySelector(".semrush-coach-file-input");
  const pasteTextButtonEl = root.querySelector(".semrush-coach-paste-text");
  const formatMarkdownButtonEl = root.querySelector(".semrush-coach-format-markdown");
  const attachButtonEl = root.querySelector(".semrush-coach-attach");
  const generateSummaryButtonEl = root.querySelector(".semrush-coach-generate-summary");
  const formToolsEl = root.querySelector(".semrush-coach-form-tools");
  const focusModeButtonEl = document.createElement("button");
  focusModeButtonEl.className = "semrush-coach-focus-mode";
  focusModeButtonEl.type = "button";
  focusModeButtonEl.textContent = "沉浸式阅读";
  formToolsEl?.appendChild(focusModeButtonEl);
  const toolsMenuWrapEl = document.createElement("div");
  toolsMenuWrapEl.className = "semrush-coach-tools-menu-wrap";
  toolsMenuWrapEl.innerHTML = `
    <button class="semrush-coach-tools-toggle" type="button" aria-expanded="false">
      <span class="semrush-coach-tools-toggle-icon" aria-hidden="true">
        <svg viewBox="0 0 20 20" focusable="false">
          <path d="M8.4 3.2a1 1 0 0 1 1 1v1.1a5 5 0 0 1 1.2.5l.8-.8a1 1 0 0 1 1.4 0l1.2 1.2a1 1 0 0 1 0 1.4l-.8.8c.2.4.4.8.5 1.2H16a1 1 0 1 1 0 2h-1.1a5 5 0 0 1-.5 1.2l.8.8a1 1 0 0 1 0 1.4l-1.2 1.2a1 1 0 0 1-1.4 0l-.8-.8a5 5 0 0 1-1.2.5V16a1 1 0 1 1-2 0v-1.1a5 5 0 0 1-1.2-.5l-.8.8a1 1 0 0 1-1.4 0L3 14a1 1 0 0 1 0-1.4l.8-.8a5 5 0 0 1-.5-1.2H2.2a1 1 0 1 1 0-2h1.1a5 5 0 0 1 .5-1.2L3 6.6a1 1 0 0 1 0-1.4l1.2-1.2a1 1 0 0 1 1.4 0l.8.8a5 5 0 0 1 1.2-.5V4.2a1 1 0 0 1 1-1Zm.6 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z"></path>
        </svg>
      </span>
      <span>工具</span>
    </button>
    <div class="semrush-coach-tools-menu semrush-coach-hidden">
      <button class="semrush-coach-tools-item" type="button" data-tool="selection-analysis">框选分析</button>
      <button class="semrush-coach-tools-item" type="button" data-tool="markdown">转 Markdown</button>
      <button class="semrush-coach-tools-item" type="button" data-tool="extract-ui">提取UI规范</button>
      <button class="semrush-coach-tools-item" type="button" data-tool="generate-prd">生成PRD</button>
    </div>
  `;
  formToolsEl?.appendChild(toolsMenuWrapEl);
  const toolsToggleButtonEl = toolsMenuWrapEl.querySelector(".semrush-coach-tools-toggle");
  const toolsMenuEl = toolsMenuWrapEl.querySelector(".semrush-coach-tools-menu");
  const toolsMenuItems = Array.from(toolsMenuEl?.querySelectorAll(".semrush-coach-tools-item") || []);
  if (generateSummaryButtonEl) {
    generateSummaryButtonEl.textContent = "总结";
  }
  toolsMenuItems.forEach((item) => {
    const tool = item.getAttribute("data-tool");
    if (tool === "selection-analysis") {
      item.textContent = "框选分析";
    } else if (tool === "markdown") {
      item.textContent = "转 Markdown";
    } else if (tool === "extract-ui") {
      item.textContent = "提取UI规范";
    } else if (tool === "generate-prd") {
      item.textContent = "生成PRD";
    }
  });
  
  const providerSelectEl = root.querySelector(".semrush-coach-setting-provider");
  const modelSelectEl = root.querySelector(".semrush-coach-setting-model-select");

  const settingsFormEls = {
    trialApiUrl: root.querySelector(".semrush-coach-setting-trial-api-url"),
    apiUrl: root.querySelector(".semrush-coach-setting-api-url"),
    modelInput: root.querySelector(".semrush-coach-setting-model-input"),
    apiKey: root.querySelector(".semrush-coach-setting-api-key"),
    allowedHosts: root.querySelector(".semrush-coach-setting-hosts")
  };

  const PROVIDERS = {
    qianwen: {
      url: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
      models: [
        "qwen-vl-max-latest", 
        "qwen-vl-max", 
        "qwen-omni-turbo",
        "qwen-max-latest",
        "qwen-vl-plus"
      ]
    },
    doubao: {
      url: "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
      models: ["doubao-1.5-vision-pro-32k", "doubao-vision-pro-32k", "ep-"]
    }
  };

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function normalizeHostPattern(value) {
    return String(value || "")
      .trim()
      .replace(/^https?:\/\//i, "")
      .replace(/\/.*$/, "")
      .toLowerCase();
  }

  function parseAllowedHosts(value) {
    const raw = Array.isArray(value) ? value : String(value || "").split(/\r?\n/);
    return [...new Set(raw.map(normalizeHostPattern).filter(Boolean))];
  }

  function hostMatchesPattern(hostname, pattern) {
    const safeHost = normalizeHostPattern(hostname);
    const safePattern = normalizeHostPattern(pattern);
    if (!safePattern) {
      return false;
    }
    if (safePattern.startsWith("*.")) {
      const suffix = safePattern.slice(1);
      return safeHost.endsWith(suffix);
    }
    return safeHost === safePattern;
  }

  function getCurrentHostname() {
    return window.location.hostname.toLowerCase();
  }

  function isCurrentSiteEnabled(settings) {
    return parseAllowedHosts(settings.allowedHosts).some((pattern) =>
      hostMatchesPattern(getCurrentHostname(), pattern)
    );
  }

  function getDomApi() {
    return window.PageCoachDom || window.SemrushCoachDom;
  }

  function isExtensionContextInvalidError(error) {
    const message = String(error?.message || error || "").toLowerCase();
    return message.includes("extension context invalidated");
  }

  function scrollHistoryToBottom() {
    window.requestAnimationFrame(() => {
      historyEl.scrollTop = historyEl.scrollHeight;
      panel.scrollTop = panel.scrollHeight;
    });
  }

  function wait(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function escapeAttribute(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function isLikelyTitle(text) {
    const trimmed = String(text || "").trim();
    return (
      trimmed.length > 0 &&
      trimmed.length <= 32 &&
      !/[\u3002\uff01\uff1f.!?:\uff1a]$/.test(trimmed) &&
      !/^[-*+]\s/.test(trimmed) &&
      !/^\d+[.)\u3001]/.test(trimmed)
    );
  }

  function normalizeMarkdownLine(line) {
    return String(line || "").replace(/\s+/g, " ").trim();
  }

  function convertPlainTextToMarkdown(sourceText) {
    const normalized = String(sourceText || "")
      .replace(/\r\n?/g, "\n")
      .replace(/\u00a0/g, " ");
    const lines = normalized.split("\n");
    const blocks = [];
    let paragraphBuffer = [];
    let firstMeaningfulLineHandled = false;

    const flushParagraph = () => {
      if (!paragraphBuffer.length) {
        return;
      }
      blocks.push(paragraphBuffer.join(" "));
      paragraphBuffer = [];
    };

    const pushBlock = (text) => {
      flushParagraph();
      blocks.push(text);
    };

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        flushParagraph();
        continue;
      }

      if (!firstMeaningfulLineHandled && isLikelyTitle(line)) {
        pushBlock(`# ${normalizeMarkdownLine(line)}`);
        firstMeaningfulLineHandled = true;
        continue;
      }

      firstMeaningfulLineHandled = true;

      if (/^(```|~~~)/.test(line)) {
        pushBlock(line);
        continue;
      }

      if (/^(#{1,6}\s|>\s|\|.+\||[-*+]\s|\d+\.\s)/.test(line)) {
        pushBlock(line);
        continue;
      }

      let match = line.match(/^[-*+\u2022\u00b7\u25cf\u25cb\u25aa\u25ab\u25e6\u2023]\s*(.+)$/);
      if (match) {
        pushBlock(`- ${normalizeMarkdownLine(match[1])}`);
        continue;
      }

      match = line.match(/^(\d+)[.)\u3001]\s*(.+)$/);
      if (match) {
        pushBlock(`${match[1]}. ${normalizeMarkdownLine(match[2])}`);
        continue;
      }

      match = line.match(/^(?:\u7b2c)?([\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\u767e\u5343\u4e07]+)[\u3001.\uff0e]\s*(.+)$/);
      if (match) {
        pushBlock(`## ${normalizeMarkdownLine(match[2])}`);
        continue;
      }

      match = line.match(/^[\uff08(]([\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\d]+)[\uff09)]\s*(.+)$/);
      if (match) {
        pushBlock(`### ${normalizeMarkdownLine(match[2])}`);
        continue;
      }

      match = line.match(/^(.{1,24}?)[\uff1a:]\s*$/);
      if (match) {
        pushBlock(`### ${normalizeMarkdownLine(match[1])}`);
        continue;
      }

      match = line.match(/^(.{1,16}?)[\uff1a:]\s*(.+)$/);
      if (match && !/[\u3002\uff01\uff1f.!?]$/.test(match[1])) {
        pushBlock(`- **${normalizeMarkdownLine(match[1])}**：${normalizeMarkdownLine(match[2])}`);
        continue;
      }

      paragraphBuffer.push(normalizeMarkdownLine(line));
    }

    flushParagraph();

    return blocks.join("\n\n").trim();
  }

  function buildMarkdownPreview(markdown) {
    return String(markdown || "")
      .split(/\n+/)
      .slice(0, 6)
      .join("\n");
  }

  function parseMindmapLabel(line) {
    const trimmed = String(line || "").trim();
    if (!trimmed) {
      return "";
    }

    if (/^root\b/i.test(trimmed)) {
      const match = trimmed.match(/^root(?:\((.+)\)|\s+(.+))$/i);
      return (match?.[1] || match?.[2] || "主题").trim();
    }

    const parenMatch = trimmed.match(/^[a-z0-9_-]+\((.+)\)$/i);
    if (parenMatch?.[1]) {
      return parenMatch[1].trim();
    }

    return trimmed
      .replace(/^[|丨│┆┊└├─—•·:：\-*#\s]+/, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseMindmapMermaid(source) {
    const lines = String(source || "")
      .replace(/```mermaid|```/gi, "")
      .split("\n")
      .map((line) => line.replace(/\t/g, "  "))
      .filter((line) => line.trim());

    const rootLineIndex = lines.findIndex((line) => /^root\b/i.test(line.trim()));
    if (rootLineIndex < 0) {
      return null;
    }

    const root = {
      label: parseMindmapLabel(lines[rootLineIndex]),
      children: []
    };

    const stack = [{ depth: -1, node: root }];
    for (const rawLine of lines.slice(rootLineIndex + 1)) {
      const trimmed = rawLine.trim();
      if (!trimmed || /^mindmap$/i.test(trimmed)) {
        continue;
      }

      const depth = Math.max(0, Math.floor((rawLine.match(/^ */)?.[0].length || 0) / 2));
      const node = {
        label: parseMindmapLabel(trimmed),
        children: []
      };
      if (!node.label) {
        continue;
      }

      while (stack.length && stack[stack.length - 1].depth >= depth) {
        stack.pop();
      }

      const parent = stack[stack.length - 1]?.node || root;
      parent.children.push(node);
      stack.push({ depth, node });
    }

    return root;
  }

  function layoutMindmapTree(rootNode) {
    if (!rootNode) {
      return null;
    }

    const nodes = [];
    const links = [];
    const branchColors = ["#2f6fed", "#e05a47", "#8358ff", "#119d67", "#d57d12", "#cc4fa8"];
    const siblingGap = 34;
    const horizontalGap = 224;
    const rootGap = 146;
    const padding = 54;

    const countUnits = (text) =>
      Array.from(String(text || "")).reduce((sum, char) => {
        if (/\s/.test(char)) {
          return sum + 0.35;
        }
        return sum + (/[\u0000-\u00ff]/.test(char) ? 0.62 : 1);
      }, 0);

    const splitLabel = (label, maxUnits = 16) => {
      const source = String(label || "").trim();
      if (!source) {
        return [""];
      }

      const tokens = /\s/.test(source)
        ? source.split(/(\s+)/).filter(Boolean)
        : Array.from(source);
      const lines = [];
      let current = "";
      let currentUnits = 0;

      for (const token of tokens) {
        const tokenUnits = countUnits(token);
        if (current && currentUnits + tokenUnits > maxUnits) {
          lines.push(current.trim());
          current = token;
          currentUnits = tokenUnits;
        } else {
          current += token;
          currentUnits += tokenUnits;
        }
      }

      if (current.trim()) {
        lines.push(current.trim());
      }

      return lines.slice(0, 4);
    };

    const prepareNode = (node, depth = 0) => {
      node.depth = depth;
      node.lines = splitLabel(node.label, depth === 0 ? 22 : 17);
      const maxUnits = Math.max(...node.lines.map((line) => countUnits(line)), 5);
      node.width = Math.max(depth === 0 ? 280 : 136, Math.min(depth === 0 ? 420 : 250, 40 + maxUnits * (depth === 0 ? 14.5 : 13)));
      node.height = Math.max(depth === 0 ? 74 : 50, 20 + node.lines.length * (depth === 0 ? 22 : 18));

      node.children.forEach((child) => prepareNode(child, depth + 1));

      if (!node.children.length) {
        node.subtreeHeight = node.height;
        return;
      }

      const childrenHeight =
        node.children.reduce((sum, child) => sum + child.subtreeHeight, 0) +
        siblingGap * Math.max(0, node.children.length - 1);
      node.subtreeHeight = Math.max(node.height, childrenHeight);
    };

    const layoutSubtree = (node, side, depth, top, centerX) => {
      node.side = side;
      node.x =
        side === "right"
          ? centerX + rootGap + (depth - 1) * horizontalGap
          : centerX - rootGap - (depth - 1) * horizontalGap - node.width;
      node.y = top + (node.subtreeHeight - node.height) / 2;
      nodes.push(node);

      if (!node.children.length) {
        return;
      }

      const childrenTotalHeight =
        node.children.reduce((sum, child) => sum + child.subtreeHeight, 0) +
        siblingGap * Math.max(0, node.children.length - 1);
      let childTop = node.y + node.height / 2 - childrenTotalHeight / 2;

      node.children.forEach((child) => {
        child.branchIndex = node.branchIndex;
        links.push({
          from: node,
          to: child,
          branchIndex: child.branchIndex
        });
        layoutSubtree(child, side, depth + 1, childTop, centerX);
        childTop += child.subtreeHeight + siblingGap;
      });
    };

    prepareNode(rootNode, 0);

    const leftChildren = [];
    const rightChildren = [];
    let leftLoad = 0;
    let rightLoad = 0;

    rootNode.children.forEach((child, index) => {
      child.branchIndex = index;
      const weight = child.subtreeHeight + siblingGap;
      if (leftLoad <= rightLoad) {
        leftChildren.push(child);
        leftLoad += weight;
      } else {
        rightChildren.push(child);
        rightLoad += weight;
      }
    });

    const sumHeight = (items) =>
      items.length
        ? items.reduce((sum, child) => sum + child.subtreeHeight, 0) + siblingGap * (items.length - 1)
        : 0;

    const leftHeight = sumHeight(leftChildren);
    const rightHeight = sumHeight(rightChildren);
    const totalHeight = Math.max(420, leftHeight, rightHeight, rootNode.height) + padding * 2;
    const centerX = 0;

    rootNode.x = centerX - rootNode.width / 2;
    rootNode.y = totalHeight / 2 - rootNode.height / 2;
    nodes.push(rootNode);

    let leftTop = totalHeight / 2 - leftHeight / 2;
    leftChildren.forEach((child) => {
      links.push({ from: rootNode, to: child, branchIndex: child.branchIndex });
      layoutSubtree(child, "left", 1, leftTop, centerX);
      leftTop += child.subtreeHeight + siblingGap;
    });

    let rightTop = totalHeight / 2 - rightHeight / 2;
    rightChildren.forEach((child) => {
      links.push({ from: rootNode, to: child, branchIndex: child.branchIndex });
      layoutSubtree(child, "right", 1, rightTop, centerX);
      rightTop += child.subtreeHeight + siblingGap;
    });

    const minX = Math.min(...nodes.map((node) => node.x)) - padding;
    const minY = Math.min(...nodes.map((node) => node.y)) - padding;
    const maxX = Math.max(...nodes.map((node) => node.x + node.width)) + padding;
    const maxY = Math.max(...nodes.map((node) => node.y + node.height)) + padding;

    nodes.forEach((node) => {
      node.x -= minX;
      node.y -= minY;
    });

    return {
      nodes,
      links,
      width: Math.max(880, maxX - minX),
      height: Math.max(460, maxY - minY),
      branchColors
    };
  }

  function renderMindmapSvg(source, modal = false) {
    const tree = parseMindmapMermaid(source);
    const layout = layoutMindmapTree(tree);
    if (!layout) {
      return `<div class="semrush-coach-mindmap-empty">脑图暂时无法渲染</div>`;
    }

    const svg = `
      <svg class="semrush-coach-mindmap-svg${modal ? " semrush-coach-mindmap-svg-modal" : ""}" viewBox="0 0 ${layout.width} ${layout.height}" width="${layout.width}" height="${layout.height}" role="img" aria-label="脑图预览">
        <defs>
          <filter id="semrushMindmapShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="rgba(18,31,28,0.12)"/>
          </filter>
        </defs>
        ${layout.links
          .map((link) => {
            const isRight = (link.to.side || "right") === "right";
            const startX = isRight ? link.from.x + link.from.width : link.from.x;
            const startY = link.from.y + link.from.height / 2;
            const endX = isRight ? link.to.x : link.to.x + link.to.width;
            const endY = link.to.y + link.to.height / 2;
            const curve = Math.max(42, Math.abs(endX - startX) * 0.45);
            const stroke = layout.branchColors[link.branchIndex % layout.branchColors.length];
            const cp1x = isRight ? startX + curve : startX - curve;
            const cp2x = isRight ? endX - curve : endX + curve;
            return `
              <path d="M ${startX} ${startY} C ${cp1x} ${startY}, ${cp2x} ${endY}, ${endX} ${endY}" fill="none" stroke="${stroke}" stroke-opacity="0.18" stroke-width="${link.from.depth === 0 ? 8 : 5}" stroke-linecap="round"/>
              <path d="M ${startX} ${startY} C ${cp1x} ${startY}, ${cp2x} ${endY}, ${endX} ${endY}" fill="none" stroke="${stroke}" stroke-width="${link.from.depth === 0 ? 4 : 2.6}" stroke-linecap="round"/>
            `;
          })
          .join("")}
        ${layout.nodes
          .map((node) => {
            const branchColor = layout.branchColors[node.branchIndex % layout.branchColors.length];
            const fill = node.depth === 0 ? "#0c5e50" : "#ffffff";
            const stroke = node.depth === 0 ? "#0c5e50" : "rgba(64, 78, 72, 0.10)";
            const textColor = node.depth === 0 ? "#f5fbf8" : "#20312c";
            const fontSize = node.depth === 0 ? 19 : 14;
            const lineHeight = node.depth === 0 ? 22 : 19;
            const textStartY =
              node.y + node.height / 2 - ((node.lines.length - 1) * lineHeight) / 2 + 5;
            return `
              <g filter="url(#semrushMindmapShadow)">
                <rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="${node.depth === 0 ? 22 : 18}" fill="${fill}" stroke="${stroke}" stroke-width="${node.depth === 0 ? 0 : 1.1}"></rect>
                ${node.depth === 0 ? "" : `<rect x="${node.x + 10}" y="${node.y + 10}" width="4" height="${Math.max(18, node.height - 20)}" rx="999" fill="${branchColor}" opacity="0.92"></rect>`}
                <text fill="${textColor}" font-size="${fontSize}" font-weight="${node.depth === 0 ? 700 : 500}" font-family="Manrope, PingFang SC, Microsoft YaHei, sans-serif">
                  ${node.lines
                    .map(
                      (line, index) =>
                        `<tspan x="${node.x + (node.depth === 0 ? 18 : 24)}" y="${textStartY + index * lineHeight}">${escapeHtml(line)}</tspan>`
                    )
                    .join("")}
                </text>
              </g>
            `;
          })
          .join("")}
      </svg>
    `;

    return `
      <div class="semrush-coach-mindmap-viewer${modal ? " semrush-coach-mindmap-viewer-modal" : ""}" data-width="${layout.width}" data-height="${layout.height}">
        <div class="semrush-coach-mindmap-toolbar">
          <span class="semrush-coach-mindmap-hint">滚轮缩放，拖拽移动</span>
          <div class="semrush-coach-mindmap-toolbar-actions">
            <button class="semrush-coach-mindmap-tool" data-action="zoom-out" type="button">-</button>
            <button class="semrush-coach-mindmap-tool semrush-coach-mindmap-tool-label" data-action="fit" type="button">适应</button>
            <button class="semrush-coach-mindmap-tool" data-action="zoom-in" type="button">+</button>
            ${modal ? "" : `<button class="semrush-coach-mindmap-tool semrush-coach-mindmap-tool-label" data-action="fullscreen" data-source="${escapeAttribute(source)}" type="button">全屏</button>`}
          </div>
        </div>
        <div class="semrush-coach-mindmap-canvas${modal ? " semrush-coach-mindmap-canvas-modal" : ""}">
          <div class="semrush-coach-mindmap-stage-wrap">
            <div class="semrush-coach-mindmap-stage">
              ${svg}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function updateMindmapTransform(viewer, nextState) {
    const stage = viewer.querySelector(".semrush-coach-mindmap-stage");
    if (!stage) {
      return;
    }

    const stateRef = viewer.__mindmapState || (viewer.__mindmapState = {});
    stateRef.scale = nextState.scale;
    stateRef.x = nextState.x;
    stateRef.y = nextState.y;
    stage.style.transform = `translate(${nextState.x}px, ${nextState.y}px) scale(${nextState.scale})`;
  }

  function fitMindmapViewer(viewer) {
    const canvas = viewer.querySelector(".semrush-coach-mindmap-canvas");
    const width = Number(viewer.dataset.width) || 800;
    const height = Number(viewer.dataset.height) || 480;
    if (!canvas) {
      return;
    }

    const scale = Math.min(
      1,
      Math.max(0.42, Math.min((canvas.clientWidth - 24) / width, (canvas.clientHeight - 24) / height))
    );
    const x = (canvas.clientWidth - width * scale) / 2;
    const y = (canvas.clientHeight - height * scale) / 2;
    updateMindmapTransform(viewer, { scale, x, y });
  }

  function zoomMindmapViewer(viewer, delta, anchorPoint = null) {
    const canvas = viewer.querySelector(".semrush-coach-mindmap-canvas");
    const stateRef = viewer.__mindmapState;
    if (!canvas || !stateRef) {
      return;
    }

    const nextScale = Math.max(0.35, Math.min(2.4, stateRef.scale * delta));
    if (Math.abs(nextScale - stateRef.scale) < 0.001) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const point = anchorPoint || { x: rect.width / 2, y: rect.height / 2 };
    const worldX = (point.x - stateRef.x) / stateRef.scale;
    const worldY = (point.y - stateRef.y) / stateRef.scale;
    const x = point.x - worldX * nextScale;
    const y = point.y - worldY * nextScale;
    updateMindmapTransform(viewer, { scale: nextScale, x, y });
  }

  function initializeMindmapViewer(viewer) {
    if (!viewer || viewer.dataset.mindmapReady === "true") {
      return;
    }
    viewer.dataset.mindmapReady = "true";

    const canvas = viewer.querySelector(".semrush-coach-mindmap-canvas");
    if (!canvas) {
      return;
    }

    fitMindmapViewer(viewer);

    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    canvas.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        const rect = canvas.getBoundingClientRect();
        zoomMindmapViewer(viewer, event.deltaY < 0 ? 1.12 : 0.9, {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top
        });
      },
      { passive: false }
    );

    canvas.addEventListener("pointerdown", (event) => {
      if (event.target instanceof HTMLElement && event.target.closest(".semrush-coach-mindmap-tool")) {
        return;
      }
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      canvas.classList.add("semrush-coach-mindmap-canvas-dragging");
      canvas.setPointerCapture?.(event.pointerId);
    });

    canvas.addEventListener("pointermove", (event) => {
      if (!dragging) {
        return;
      }
      const stateRef = viewer.__mindmapState;
      updateMindmapTransform(viewer, {
        scale: stateRef.scale,
        x: stateRef.x + (event.clientX - lastX),
        y: stateRef.y + (event.clientY - lastY)
      });
      lastX = event.clientX;
      lastY = event.clientY;
    });

    const stopDragging = (event) => {
      if (!dragging) {
        return;
      }
      dragging = false;
      canvas.classList.remove("semrush-coach-mindmap-canvas-dragging");
      canvas.releasePointerCapture?.(event.pointerId);
    };

    canvas.addEventListener("pointerup", stopDragging);
    canvas.addEventListener("pointercancel", stopDragging);
    canvas.addEventListener("pointerleave", stopDragging);
  }

  function initializeMindmapViewers(scope) {
    (scope || document)
      .querySelectorAll(".semrush-coach-mindmap-viewer")
      .forEach((viewer) => initializeMindmapViewer(viewer));
  }

  function openMindmapModal(source) {
    if (!mindmapModalEl || !mindmapModalBodyEl) {
      return;
    }
    mindmapModalBodyEl.innerHTML = renderMindmapSvg(source, true);
    mindmapModalEl.classList.remove("semrush-coach-hidden");
    mindmapModalEl.setAttribute("aria-hidden", "false");
    initializeMindmapViewers(mindmapModalEl);
  }

  function closeMindmapModal() {
    if (!mindmapModalEl || !mindmapModalBodyEl) {
      return;
    }
    mindmapModalEl.classList.add("semrush-coach-hidden");
    mindmapModalEl.setAttribute("aria-hidden", "true");
    mindmapModalBodyEl.innerHTML = "";
  }

  async function revealAssistantMessage(finalData) {
    const entry = {
      role: "assistant",
      pageSummary: finalData.pageSummary || "当前页面",
      answer: "",
      suggestedNextSteps: [],
      confidence: finalData.confidence ?? 0.72,
      elementHints: [],
      renderAsCode: Boolean(finalData.renderAsCode),
      renderAsMindmap: Boolean(finalData.renderAsMindmap),
      streaming: true
    };

    state.history.push(entry);
    renderHistory();

    const fullAnswer = String(finalData.answer || "");
    const chunkSize = Math.max(4, Math.ceil(Math.max(fullAnswer.length, 1) / 24));

    if (!fullAnswer) {
      entry.answer = "暂时没有可展示的回答。";
      entry.streaming = false;
      entry.suggestedNextSteps = finalData.suggestedNextSteps || [];
      entry.elementHints = finalData.elementHints || [];
      renderHistory();
      return entry;
    }

    for (let index = chunkSize; index < fullAnswer.length + chunkSize; index += chunkSize) {
      entry.answer = fullAnswer.slice(0, index);
      renderHistory();
      await wait(28);
    }

    entry.answer = fullAnswer;
    entry.suggestedNextSteps = finalData.suggestedNextSteps || [];
    entry.elementHints = finalData.elementHints || [];
    entry.confidence = finalData.confidence ?? entry.confidence;
    entry.renderAsCode = Boolean(finalData.renderAsCode);
    entry.renderAsMindmap = Boolean(finalData.renderAsMindmap);
    entry.streaming = false;
    renderHistory();

    return entry;
  }

  function applyUsageMeta(usageMeta) {
    if (!usageMeta || !Number.isFinite(Number(usageMeta.remainingFreeUses))) {
      return;
    }

    state.settings.trialStatus = {
      enabled: true,
      remainingFreeUses: Number(usageMeta.remainingFreeUses),
      freeTrialLimit: Number(usageMeta.freeTrialLimit || state.settings.freeTrialLimit || 15)
    };

    fillSettingsForm();
  }

  function setModeLabel(mode) {
    state.mode = mode;
  }

  function openPanel(expanded = false) {
    state.open = true;
    state.expanded = expanded;
    panel.classList.remove("semrush-coach-hidden");
    panel.classList.toggle("semrush-coach-panel-expanded", expanded);
    bubble.classList.add("semrush-coach-bubble-active");
  }

  function closePanel() {
    state.open = false;
    closeToolsMenu();
    panel.classList.add("semrush-coach-hidden");
    bubble.classList.remove("semrush-coach-bubble-active");
    if (state.selectionActive) {
      cleanupFocusSelection();
    }
  }

  function toggleSettings(open) {
    state.settingsOpen = open;
    settingsPanelEl.classList.toggle("semrush-coach-hidden", !open);
    panel.classList.toggle("semrush-coach-settings-view", open);
    settingsToggleEl.classList.toggle("semrush-coach-settings-toggle-active", open);
  }

  function closeToolsMenu() {
    state.toolsMenuOpen = false;
    toolsMenuEl?.classList.add("semrush-coach-hidden");
    toolsToggleButtonEl?.setAttribute("aria-expanded", "false");
    toolsMenuWrapEl?.classList.remove("semrush-coach-tools-menu-wrap-open");
  }

  function toggleToolsMenu(open) {
    state.toolsMenuOpen = open;
    toolsMenuEl?.classList.toggle("semrush-coach-hidden", !open);
    toolsToggleButtonEl?.setAttribute("aria-expanded", open ? "true" : "false");
    toolsMenuWrapEl?.classList.toggle("semrush-coach-tools-menu-wrap-open", open);
  }

  function setLoading(loading) {
    state.loading = loading;
    submitButton.disabled = loading || !state.siteEnabled;
    submitButton.textContent = loading ? "思考中…" : "提问";
  }

  function fillSettingsForm() {
    const defaultUrl = state.settings.apiUrl || PROVIDERS.qianwen.url;
    settingsFormEls.trialApiUrl.value = state.settings.trialApiUrl || "";
    settingsFormEls.apiUrl.value = defaultUrl;
    settingsFormEls.apiKey.value = state.settings.apiKey || "";
    settingsFormEls.allowedHosts.value = parseAllowedHosts(state.settings.allowedHosts).join("\n");
    settingsStatusEl.textContent = formatTrialStatus(state.settings);
    
    // 匹配 Provider
    let matchedProvider = "custom";
    for (const [key, details] of Object.entries(PROVIDERS)) {
      if (details.url === defaultUrl) {
        matchedProvider = key;
        break;
      }
    }
    
    providerSelectEl.value = matchedProvider;
    updateProviderUI(matchedProvider, state.settings.model);
  }

  function updateProviderUI(providerKey, currentModel) {
    if (providerKey === "custom") {
      modelSelectEl.classList.add("semrush-coach-hidden");
      settingsFormEls.modelInput.classList.remove("semrush-coach-hidden");
      settingsFormEls.modelInput.value = currentModel || "";
      settingsFormEls.apiUrl.readOnly = false;
      return;
    }

    const details = PROVIDERS[providerKey];
    if (details) {
      settingsFormEls.apiUrl.value = details.url;
      settingsFormEls.apiUrl.readOnly = false;
      
      modelSelectEl.classList.remove("semrush-coach-hidden");
      settingsFormEls.modelInput.classList.add("semrush-coach-hidden");
      
      modelSelectEl.innerHTML = details.models
        .map(m => `<option value="${m}">${m === "ep-" ? "火山引擎接入点 (填下面)" : m}</option>`)
        .join("");

      if (currentModel && details.models.includes(currentModel)) {
        modelSelectEl.value = currentModel;
      } else if (currentModel && currentModel.startsWith("ep-") && providerKey === "doubao") {
        modelSelectEl.value = "ep-";
        settingsFormEls.modelInput.classList.remove("semrush-coach-hidden");
        settingsFormEls.modelInput.value = currentModel;
      } else {
        modelSelectEl.value = details.models[0];
      }
      
      handleModelSelectChange();
    }
  }

  function handleModelSelectChange() {
    if (modelSelectEl.value === "ep-") {
      settingsFormEls.modelInput.classList.remove("semrush-coach-hidden");
      if (!settingsFormEls.modelInput.value.startsWith("ep-")) {
        settingsFormEls.modelInput.value = "ep-";
      }
    } else if (providerSelectEl.value !== "custom") {
      settingsFormEls.modelInput.classList.add("semrush-coach-hidden");
    }
  }

  function getActiveModel() {
    if (providerSelectEl.value === "custom" || modelSelectEl.value === "ep-") {
      return settingsFormEls.modelInput.value.trim();
    }
    return modelSelectEl.value;
  }

  function hasTrialAccess(settings = state.settings) {
    return Boolean(settings.remoteEnabled && settings.trialEnabled && settings.trialApiUrl);
  }

  function hasUserApiAccess(settings = state.settings) {
    return Boolean(settings.remoteEnabled && settings.apiUrl && settings.apiKey);
  }

  function hasConfiguredRemoteAccess(settings = state.settings) {
    return hasTrialAccess(settings) || hasUserApiAccess(settings);
  }

  function formatTrialStatus(settings = state.settings) {
    const trialStatus = settings.trialStatus;
    if (trialStatus?.enabled && Number.isFinite(trialStatus.remainingFreeUses)) {
      return `免费体验剩余 ${trialStatus.remainingFreeUses}/${trialStatus.freeTrialLimit || settings.freeTrialLimit || 15} 次。`;
    }
    if (trialStatus?.error) {
      return `体验服务状态：${trialStatus.error}`;
    }
    if (hasTrialAccess(settings)) {
      return "已开启免费体验通道，优先使用体验额度。";
    }
    if (hasUserApiAccess(settings)) {
      return "已配置你自己的 API Key。";
    }
    return "请先填写体验服务地址，或填写你自己的 API Key。";
  }

  function getCurrentSiteDisplayName() {
    return getCurrentHostname();
  }

  function renderDisabledSiteCard() {
    const currentHost = getCurrentSiteDisplayName();
    historyEl.innerHTML = `
      <article class="semrush-coach-card">
        <p class="semrush-coach-card-title">当前网站还没启用</p>
        <p>这个面板已经能出现在当前页面，但 <strong>${escapeHtml(currentHost)}</strong> 还不在你的启用网站列表里，所以我先不对这个网站执行页面指导。</p>
        <p>你可以点下方按钮一键把当前网站加入配置，之后这个网站就会正常使用。</p>
        <div class="semrush-coach-hints">
          <button class="semrush-coach-hint semrush-coach-enable-current-site" type="button">添加当前网站</button>
          <button class="semrush-coach-hint semrush-coach-open-settings" type="button">打开设置</button>
        </div>
      </article>
    `;
    scrollHistoryToBottom();
  }

  function renderEmptyState() {
    historyEl.innerHTML = `
      <article class="semrush-coach-welcome-card" aria-hidden="true">
        <div class="semrush-coach-welcome-hero">
          <div class="semrush-coach-welcome-orbit"></div>
          <div class="semrush-coach-welcome-window">
            <div class="semrush-coach-welcome-window-bar"></div>
            <div class="semrush-coach-welcome-window-line semrush-coach-welcome-window-line-short"></div>
            <div class="semrush-coach-welcome-window-line"></div>
            <div class="semrush-coach-welcome-window-grid">
              <span></span>
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
          <div class="semrush-coach-welcome-badge">AI</div>
        </div>
      </article>
    `;
    scrollHistoryToBottom();
  }

  function renderHistory() {
    if (!state.siteEnabled) {
      renderDisabledSiteCard();
      return;
    }

    if (!state.history.length) {
      renderEmptyState();
      return;
    }

    historyEl.innerHTML = state.history
      .map((item) => {
        if (item.role === "user") {
          const preview = item.attachment?.dataUrl
            ? `
              <div style="margin-top:8px;">
                <img
                  src="${item.attachment.dataUrl}"
                  alt="${escapeHtml(item.attachment.name || "用户截图")}"
                  style="display:block;width:72px;height:72px;object-fit:cover;border-radius:12px;border:1px solid rgba(23,33,29,0.08);"
                />
              </div>
            `
            : "";

          return `
            <article class="semrush-coach-message semrush-coach-message-user">
              <div>${escapeHtml(item.text)}</div>
              ${preview}
            </article>
          `;
        }

        const answerParagraphs = item.renderAsMindmap
          ? `
            <div class="semrush-coach-mindmap-wrap">
              ${renderMindmapSvg(item.answer || "")}
            </div>
          `
          : item.renderAsCode
              ? `<pre class="semrush-coach-code-block"><code>${escapeHtml(String(item.answer || ""))}</code></pre>`
              : String(item.answer || "")
                  .split(/\n+/)
                  .map((line) => line.trim())
                  .filter(Boolean)
                  .map((line) => `<p>${escapeHtml(line)}</p>`)
                  .join("");

        const steps = item.renderAsMindmap ? "" : (item.suggestedNextSteps || []).map((step) => `<li>${escapeHtml(step)}</li>`).join("");
        const encodedAnswer = escapeAttribute(item.answer || "");
        const actionButton = item.renderAsMindmap
          ? `<button class="semrush-coach-mindmap-open-btn" data-answer="${encodedAnswer}" type="button">全屏查看</button>`
          : `<button class="semrush-coach-copy-btn" data-answer="${encodedAnswer}" title="一键复制">📋 复制</button>`;

        return `
          <article class="semrush-coach-card">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap: 8px;">
              <p class="semrush-coach-card-title" style="margin:0;">${escapeHtml(item.pageSummary || "当前页面")}</p>
              ${actionButton}
            </div>
            ${answerParagraphs || "<p>暂时没有可展示的回答。</p>"}
            ${steps ? `<ol class="semrush-coach-steps">${steps}</ol>` : ""}
          </article>
        `;
      })
      .join("");
    initializeMindmapViewers(historyEl);
    scrollHistoryToBottom();
  }

  function renderQuickPrompts(prompts) {
    promptEl.innerHTML = "";
    promptEl.style.display = "none";
  }

  function clearHighlight() {
    document.querySelectorAll(".semrush-coach-highlight-target").forEach((element) => {
      element.classList.remove("semrush-coach-highlight-target");
    });
  }

  function highlightHint(hint) {
    clearHighlight();

    let target = null;
    if (hint.selector) {
      target = document.querySelector(hint.selector);
    }

    if (!target && hint.text) {
      const candidates = Array.from(document.querySelectorAll("h1, h2, h3, h4, a, button, span, div"));
      target = candidates.find((element) => (element.innerText || "").trim() === hint.text);
    }

    if (!target) {
      return;
    }

    target.classList.add("semrush-coach-highlight-target");
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    window.clearTimeout(state.highlightTimer);
    state.highlightTimer = window.setTimeout(clearHighlight, 3200);
  }

  function getSnapshot() {
    const domApi = getDomApi();
    const baseSnapshot = domApi?.createSnapshot
      ? domApi.createSnapshot()
      : {
          url: window.location.href,
          title: document.title,
          breadcrumbs: [],
          leftNavItems: [],
          visibleModules: [],
          primaryActions: [],
          notices: []
        };

    return {
      ...baseSnapshot,
      locale: document.documentElement.lang || "zh-CN"
    };
  }

  function collectVisibleTextBySelectors(selectors, limit, filter) {
    const results = [];
    const seen = new Set();
    const elements = Array.from(document.querySelectorAll(selectors));

    for (const element of elements) {
      if (!(element instanceof HTMLElement)) {
        continue;
      }

      const rect = element.getBoundingClientRect();
      const text = String(element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
      if (!text || text.length < 2) {
        continue;
      }
      if (rect.width <= 0 || rect.height <= 0) {
        continue;
      }
      if (filter && !filter(text, element)) {
        continue;
      }
      if (seen.has(text)) {
        continue;
      }

      seen.add(text);
      results.push(text.slice(0, 240));
      if (results.length >= limit) {
        break;
      }
    }

    return results;
  }

  function collectCurrentViewportSummaryChunk(scrollY) {
    const headings = collectVisibleTextBySelectors(
      "h1, h2, h3, h4, [role='heading']",
      12
    );
    const keyPoints = collectVisibleTextBySelectors(
      "strong, b, summary, blockquote, .highlight, .callout, .tip, .note",
      12
    );
    const paragraphs = collectVisibleTextBySelectors(
      "p, article li, section li, main li",
      18,
      (text) => text.length >= 12
    );
    const listItems = collectVisibleTextBySelectors(
      "ul li, ol li",
      24,
      (text) => text.length >= 4
    );

    const tables = Array.from(document.querySelectorAll("table"))
      .map((table) => {
        const rows = Array.from(table.querySelectorAll("tr"))
          .slice(0, 6)
          .map((row) =>
            Array.from(row.querySelectorAll("th, td"))
              .map((cell) => String(cell.innerText || cell.textContent || "").replace(/\s+/g, " ").trim())
              .filter(Boolean)
              .slice(0, 6)
          )
          .filter((row) => row.length);

        if (!rows.length) {
          return null;
        }

        const caption = table.querySelector("caption")?.textContent?.trim() || "";
        return {
          caption: caption.slice(0, 120),
          headers: rows[0] || [],
          rows: rows.slice(1, 5)
        };
      })
      .filter(Boolean)
      .slice(0, 4);

    return {
      y: Math.round(scrollY),
      headings,
      keyPoints,
      paragraphs,
      listItems,
      tables,
      texts: [...headings, ...keyPoints, ...paragraphs, ...listItems].slice(0, 20)
    };
  }

  async function collectScrollablePageSummarySource() {
    const originalY = window.scrollY;
    const doc = document.documentElement;
    const viewportHeight = window.innerHeight || 900;
    const maxScrollY = Math.max(0, (doc?.scrollHeight || document.body.scrollHeight || 0) - viewportHeight);
    const step = Math.max(480, Math.floor(viewportHeight * 0.85));
    const positions = [];

    for (let y = 0; y <= maxScrollY; y += step) {
      positions.push(y);
    }
    if (!positions.length || positions[positions.length - 1] !== maxScrollY) {
      positions.push(maxScrollY);
    }

    const samples = [];
    const seenTexts = new Set();
    const headings = [];
    const keyPoints = [];
    const paragraphs = [];
    const listItems = [];
    const tables = [];

    const mergeUnique = (target, source, limit, bucket) => {
      for (const item of source || []) {
        const normalized = String(item || "").trim();
        const key = `${bucket}:${normalized}`;
        if (!normalized || seenTexts.has(key)) {
          continue;
        }
        if (target.includes(normalized)) {
          continue;
        }
        target.push(normalized);
        seenTexts.add(key);
        if (target.length >= limit) {
          break;
        }
      }
    };

    try {
      for (const y of positions.slice(0, 12)) {
        window.scrollTo(0, y);
        await wait(220);
        const chunk = collectCurrentViewportSummaryChunk(y);
        samples.push({ y: chunk.y, texts: chunk.texts });
        mergeUnique(headings, chunk.headings, 24, "heading");
        mergeUnique(keyPoints, chunk.keyPoints, 30, "keyPoint");
        mergeUnique(paragraphs, chunk.paragraphs, 36, "paragraph");
        mergeUnique(listItems, chunk.listItems, 40, "listItem");

        for (const table of chunk.tables) {
          const signature = JSON.stringify(table);
          if (!tables.some((item) => JSON.stringify(item) === signature)) {
            tables.push(table);
          }
          if (tables.length >= 6) {
            break;
          }
        }
      }
    } finally {
      window.scrollTo(0, originalY);
      await wait(120);
    }

    return {
      pageHeight: doc?.scrollHeight || document.body.scrollHeight || 0,
      viewportHeight,
      sampleCount: samples.length,
      headings,
      keyPoints,
      paragraphs,
      listItems,
      tables,
      samples
    };
  }

  function extractComputedStyles() {
    const result = { body: {}, headings: [], buttons: [], inputs: [], cards: [], links: [] };
    try {
      const bodyStyle = window.getComputedStyle(document.body);
      result.body = {
        fontFamily: bodyStyle.fontFamily,
        fontSize: bodyStyle.fontSize,
        lineHeight: bodyStyle.lineHeight,
        color: bodyStyle.color,
        backgroundColor: bodyStyle.backgroundColor
      };

      const sample = (sel, arr, max = 3) => {
        const els = document.querySelectorAll(sel);
        let count = 0;
        for (const el of els) {
          if (count >= max) break;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          const s = window.getComputedStyle(el);
          arr.push({
            tag: el.tagName.toLowerCase(),
            text: (el.innerText || "").slice(0, 40),
            fontSize: s.fontSize, fontWeight: s.fontWeight,
            lineHeight: s.lineHeight, color: s.color,
            backgroundColor: s.backgroundColor,
            borderRadius: s.borderRadius, border: s.border,
            padding: s.padding, margin: s.margin,
            boxShadow: s.boxShadow, fontFamily: s.fontFamily,
            width: r.width + "px", height: r.height + "px"
          });
          count++;
        }
      };

      sample("h1, h2, h3", result.headings, 4);
      sample("button, [role='button'], input[type='submit']", result.buttons, 4);
      sample("input[type='text'], input[type='email'], input[type='password'], textarea, select", result.inputs, 3);
      sample(".card, [class*='card'], article, section > div", result.cards, 3);
      sample("a", result.links, 3);
    } catch (e) {
      console.warn("extractComputedStyles error:", e);
    }
    return result;
  }

  function updatePageChip(snapshot) {
    const labels = (snapshot.visibleModules || []).slice(0, 3).map((item) => item.label);
    const sitePrefix = state.siteEnabled ? "当前页面" : "当前网站未启用";
    chipEl.textContent = labels.length
      ? `${sitePrefix}：${snapshot.title || snapshot.siteName || "当前网站"} · 模块 ${labels.join(" / ")}`
      : `${sitePrefix}：${snapshot.title || snapshot.siteName || "当前网站"}`;
  }

  function renderAttachment() {
    if (!state.attachment) {
      attachmentEl.classList.add("semrush-coach-hidden");
      attachmentEl.innerHTML = "";
      return;
    }

    attachmentEl.classList.remove("semrush-coach-hidden");
    attachmentEl.innerHTML = `
      <div class="semrush-coach-attachment-card">
        <img src="${state.attachment.dataUrl}" alt="附加截图" class="semrush-coach-attachment-preview" />
        <div class="semrush-coach-attachment-meta">
          <strong>${escapeHtml(state.attachment.name || "截图")}</strong>
          <span>这张图片只会在远程视觉模式下发送给模型。</span>
        </div>
        <button class="semrush-coach-attachment-remove" type="button">移除</button>
      </div>
    `;
  }

  function createProgressCard({ title, steps, initialPercent = 6, eyebrow = "AI Flow" }) {
    const progressCard = document.createElement("article");
    progressCard.className = "semrush-coach-card semrush-coach-progress-card";
    progressCard.innerHTML = `
      <div class="semrush-coach-progress-head">
        <span class="semrush-coach-progress-eyebrow">${escapeHtml(eyebrow)}</span>
        <span class="semrush-coach-progress-percent">${Math.round(initialPercent)}%</span>
      </div>
      <p class="semrush-coach-card-title semrush-coach-progress-title">${escapeHtml(title)}</p>
      <p class="semrush-coach-progress-step">${escapeHtml(steps[0] || "处理中…")}</p>
      <div class="semrush-coach-progress-bar-wrap">
        <div class="semrush-coach-progress-bar-glow"></div>
        <div class="semrush-coach-progress-bar" style="width: ${initialPercent}%"></div>
      </div>
      <div class="semrush-coach-progress-dots" aria-hidden="true">
        ${steps.map((_, index) => `<span class="${index === 0 ? "is-active" : ""}"></span>`).join("")}
      </div>
    `;
    historyEl.appendChild(progressCard);
    scrollHistoryToBottom();

    const progressBar = progressCard.querySelector(".semrush-coach-progress-bar");
    const progressStepEl = progressCard.querySelector(".semrush-coach-progress-step");
    const progressPercentEl = progressCard.querySelector(".semrush-coach-progress-percent");
    const progressDots = Array.from(progressCard.querySelectorAll(".semrush-coach-progress-dots span"));

    return {
      card: progressCard,
      update(step, percent) {
        if (progressStepEl) {
          progressStepEl.textContent = steps[step] || "";
        }
        if (progressBar) {
          progressBar.style.width = `${percent}%`;
        }
        if (progressPercentEl) {
          progressPercentEl.textContent = `${Math.round(percent)}%`;
        }
        progressDots.forEach((dot, index) => {
          dot.classList.toggle("is-active", index <= step);
        });
        scrollHistoryToBottom();
      },
      remove() {
        progressCard.remove();
      }
    };
  }

  function clearAttachment() {
    state.attachment = null;
    fileInputEl.value = "";
    renderAttachment();
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error("读取文件失败"));
      reader.readAsDataURL(file);
    });
  }

  function compressImage(dataUrl, maxSize = 1200, quality = 0.75) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxSize || h > maxSize) {
          const ratio = Math.min(maxSize / w, maxSize / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  async function setAttachmentFromFile(file) {
    if (!file || !file.type.startsWith("image/")) {
      return;
    }

    const rawDataUrl = await readFileAsDataUrl(file);
    const dataUrl = await compressImage(rawDataUrl);
    state.attachment = {
      dataUrl,
      mimeType: "image/jpeg",
      name: file.name || "image"
    };
    renderAttachment();
    openPanel(true);
  }

  function normalizeFocusRect(startX, startY, endX, endY) {
    const left = Math.min(startX, endX);
    const top = Math.min(startY, endY);
    const right = Math.max(startX, endX);
    const bottom = Math.max(startY, endY);
    return {
      left,
      top,
      right,
      bottom,
      width: right - left,
      height: bottom - top
    };
  }

  function rectsIntersect(a, b) {
    return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
  }

  function isVisibleFocusNode(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    const text = element.innerText || element.textContent || "";
    if (!text.trim()) {
      return false;
    }

    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 10 && rect.height > 10;
  }

  function cleanupFocusSelection() {
    if (typeof state.selectionCleanup === "function") {
      state.selectionCleanup();
    }
    state.selectionCleanup = null;
    state.selectionActive = false;
  }

  function deactivateFocusMode() {
    cleanupFocusSelection();
    if (typeof state.focusMode.host?.__cleanup === "function") {
      state.focusMode.host.__cleanup();
    }
    if (state.focusMode.host?.isConnected) {
      state.focusMode.host.remove();
    }
    state.focusMode.active = false;
    state.focusMode.host = null;
  }

  function getFocusContentNodes() {
    return Array.from(document.querySelectorAll("h1, h2, h3, p, li, blockquote, pre")).filter(isVisibleFocusNode);
  }

  function getFocusContainerScore(element, matchedNodes) {
    if (!(element instanceof HTMLElement) || !matchedNodes.length) {
      return -1;
    }

    const text = (element.innerText || "").replace(/\s+/g, " ").trim();
    if (text.length < 80) {
      return -1;
    }

    const tag = element.tagName.toLowerCase();
    const role = (element.getAttribute("role") || "").toLowerCase();
    const className = (element.className || "").toString().toLowerCase();
    const id = (element.id || "").toLowerCase();
    const semanticBonus =
      (tag === "article" ? 80 : 0) +
      (tag === "main" ? 60 : 0) +
      (role === "main" ? 60 : 0) +
      (/article|post|content|entry|detail|reader/.test(className) ? 40 : 0) +
      (/article|post|content|entry|detail|reader/.test(id) ? 30 : 0);

    const matchedCount = matchedNodes.filter((node) => element.contains(node)).length;
    if (!matchedCount) {
      return -1;
    }

    const ownRect = element.getBoundingClientRect();
    const areaPenalty = Math.min((ownRect.width * ownRect.height) / 50000, 120);
    return semanticBonus + matchedCount * 35 + Math.min(text.length / 120, 45) - areaPenalty;
  }

  function findBestFocusContainer(matchedNodes) {
    if (!matchedNodes.length) {
      return null;
    }

    const visited = new Set();
    const candidates = [];

    matchedNodes.forEach((node) => {
      let current = node.parentElement;
      let depth = 0;
      while (current && current !== document.body && depth < 8) {
        if (!visited.has(current)) {
          visited.add(current);
          candidates.push(current);
        }
        current = current.parentElement;
        depth += 1;
      }
    });

    let best = null;
    let bestScore = -1;
    candidates.forEach((candidate) => {
      const score = getFocusContainerScore(candidate, matchedNodes);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    });

    return best;
  }

  function buildFocusContent(selectionRect) {
    const allContentNodes = getFocusContentNodes();
    const matchedNodes = allContentNodes.filter((node) => rectsIntersect(selectionRect, node.getBoundingClientRect()));
    const bestContainer = findBestFocusContainer(matchedNodes);
    const candidates = bestContainer
      ? allContentNodes.filter((node) => bestContainer.contains(node))
      : allContentNodes;
    const seen = new Set();
    const blocks = [];
    let heading = "";

    candidates.forEach((node) => {
      const rect = node.getBoundingClientRect();
      if (!bestContainer && !rectsIntersect(selectionRect, rect)) {
        return;
      }

      const text = (node.innerText || node.textContent || "").replace(/\s+/g, " ").trim();
      if (!text || seen.has(text)) {
        return;
      }
      seen.add(text);

      const tag = node.tagName.toLowerCase();
      if (!heading && /^h[1-3]$/.test(tag)) {
        heading = text;
      }

      if (/^h[1-3]$/.test(tag)) {
        blocks.push(`<h2>${escapeHtml(text)}</h2>`);
        return;
      }

      if (tag === "li") {
        blocks.push(`<li>${escapeHtml(text)}</li>`);
        return;
      }

      if (tag === "blockquote") {
        blocks.push(`<blockquote>${escapeHtml(text)}</blockquote>`);
        return;
      }

      if (tag === "pre") {
        blocks.push(`<pre>${escapeHtml(text)}</pre>`);
        return;
      }

      blocks.push(`<p>${escapeHtml(text)}</p>`);
    });

    const html = blocks
      .join("")
      .replace(/(<li>.*?<\/li>)+/g, (match) => `<ul>${match}</ul>`);

    return {
      title: heading || document.title || "专注阅读",
      html
    };
  }

  function buildSelectionAnalysisText(selectionRect) {
    const allContentNodes = getFocusContentNodes();
    const matchedNodes = allContentNodes.filter((node) => rectsIntersect(selectionRect, node.getBoundingClientRect()));
    const bestContainer = findBestFocusContainer(matchedNodes);
    const candidates = bestContainer
      ? allContentNodes.filter((node) => bestContainer.contains(node))
      : matchedNodes;
    const seen = new Set();
    const lines = [];

    candidates.forEach((node) => {
      if (!bestContainer && !rectsIntersect(selectionRect, node.getBoundingClientRect())) {
        return;
      }
      const text = (node.innerText || node.textContent || "").replace(/\s+/g, " ").trim();
      if (!text || seen.has(text)) {
        return;
      }
      seen.add(text);
      lines.push(text);
    });

    return lines.join("\n\n").trim();
  }

  function activateFocusModeForSelection(selectionRect) {
    const content = buildFocusContent(selectionRect);
    if (!content.html) {
      cleanupFocusSelection();
      return;
    }

    deactivateFocusMode();

    const host = document.createElement("div");
    host.className = "semrush-coach-focus-host";
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: "open" });
    const currentTheme = state.focusMode.theme === "light" ? "light" : "dark";
    shadow.innerHTML = `
      <style>
        :host {
          all: initial;
        }

        .focus-shell {
          --focus-bg: #0c1311;
          --focus-glow: rgba(255, 255, 255, 0.06);
          --focus-text: #f3f7f5;
          --focus-text-soft: rgba(243, 247, 245, 0.9);
          --focus-toolbar-bg: #111a17;
          --focus-toolbar-border: rgba(255, 255, 255, 0.08);
          --focus-button-bg: #dff3ec;
          --focus-button-text: #10322b;
          --focus-button-secondary-bg: rgba(223, 243, 236, 0.14);
          --focus-button-secondary-border: rgba(223, 243, 236, 0.22);
          --focus-pre-bg: rgba(255, 255, 255, 0.06);
          position: fixed;
          inset: 0;
          z-index: 2147483646;
          background:
            radial-gradient(circle at top, var(--focus-glow), transparent 28%),
            var(--focus-bg);
          color: var(--focus-text);
          font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
          overflow-y: auto;
          overflow-x: hidden;
          overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch;
        }

        .focus-shell[data-theme="light"] {
          --focus-bg: #f7f3ea;
          --focus-glow: rgba(255, 255, 255, 0.92);
          --focus-text: #22312d;
          --focus-text-soft: rgba(34, 49, 45, 0.88);
          --focus-toolbar-bg: #f3efe6;
          --focus-toolbar-border: rgba(34, 49, 45, 0.10);
          --focus-button-bg: #0c4f43;
          --focus-button-text: #f5f8f6;
          --focus-button-secondary-bg: rgba(12, 79, 67, 0.08);
          --focus-button-secondary-border: rgba(12, 79, 67, 0.12);
          --focus-pre-bg: rgba(34, 49, 45, 0.05);
        }

        .focus-toolbar {
          position: sticky;
          top: 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 18px 20px;
          backdrop-filter: blur(18px);
          background: var(--focus-toolbar-bg);
          border-bottom: 1px solid var(--focus-toolbar-border);
        }

        .focus-toolbar strong {
          font-size: 15px;
          font-weight: 700;
          letter-spacing: 0.02em;
        }

        .focus-actions {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .focus-button {
          border: 0;
          border-radius: 999px;
          padding: 10px 16px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          color: var(--focus-button-text);
          background: var(--focus-button-bg);
        }

        .focus-button.secondary {
          background: var(--focus-button-secondary-bg);
          color: var(--focus-text);
          border: 1px solid var(--focus-button-secondary-border);
        }

        .focus-content {
          max-width: 860px;
          margin: 0 auto;
          min-height: calc(100vh - 84px);
          padding: 40px 24px 72px;
          line-height: 1.9;
          font-size: 18px;
          box-sizing: border-box;
        }

        .focus-title {
          margin: 0 0 22px;
          font-size: clamp(28px, 4vw, 42px);
          line-height: 1.15;
          font-weight: 800;
        }

        .focus-body h2 {
          margin: 30px 0 12px;
          font-size: 24px;
          line-height: 1.3;
        }

        .focus-body p,
        .focus-body li,
        .focus-body blockquote,
        .focus-body pre {
          margin: 0 0 16px;
          color: var(--focus-text-soft);
        }

        .focus-body ul {
          margin: 0 0 16px 20px;
          padding: 0;
        }

        .focus-body blockquote {
          padding-left: 16px;
          border-left: 3px solid rgba(223, 243, 236, 0.32);
        }

        .focus-body pre {
          white-space: pre-wrap;
          padding: 16px;
          border-radius: 16px;
          background: var(--focus-pre-bg);
        }

        .focus-selection-action {
          position: fixed;
          z-index: 30;
          border: 0;
          border-radius: 999px;
          padding: 10px 14px;
          background: var(--focus-button-bg);
          color: var(--focus-button-text);
          font-size: 13px;
          font-weight: 700;
          box-shadow: 0 14px 30px rgba(8, 18, 15, 0.22);
          cursor: pointer;
        }

        .focus-body.line-focus-active > * {
          opacity: 0.18;
          filter: blur(0.6px);
          transition: opacity 180ms ease, filter 180ms ease, transform 180ms ease;
        }

        .focus-body.line-focus-active > .line-focus-keep {
          opacity: 1;
          filter: none;
          position: relative;
        }

        .focus-body.line-focus-active > .line-focus-keep::before {
          content: "";
          position: absolute;
          inset: -6px -14px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.08);
          box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.06);
          z-index: -1;
        }

        .focus-shell[data-theme="light"] .focus-body.line-focus-active > .line-focus-keep::before {
          background: rgba(12, 79, 67, 0.06);
          box-shadow: 0 0 0 1px rgba(12, 79, 67, 0.08);
        }
      </style>
      <div class="focus-shell" data-theme="${currentTheme}">
        <div class="focus-toolbar">
          <strong>专注模式</strong>
          <div class="focus-actions">
            <button class="focus-button secondary focus-line-reset" type="button" data-action="clear-line-focus" style="display:none;">取消聚焦</button>
            <button class="focus-button secondary" type="button" data-action="theme">${currentTheme === "dark" ? "切到浅色" : "切到深色"}</button>
            <button class="focus-button secondary" type="button" data-action="reselect">重新框选</button>
            <button class="focus-button" type="button" data-action="exit">退出</button>
          </div>
        </div>
        <main class="focus-content">
          <h1 class="focus-title">${escapeHtml(content.title)}</h1>
          <div class="focus-body">${content.html}</div>
        </main>
      </div>
    `;

    const shellEl = shadow.querySelector(".focus-shell");
    const focusBodyEl = shadow.querySelector(".focus-body");
    const lineResetButtonEl = shadow.querySelector(".focus-line-reset");
    let selectionActionButton = null;

    const clearSelectionActionButton = () => {
      if (selectionActionButton?.isConnected) {
        selectionActionButton.remove();
      }
      selectionActionButton = null;
    };

    const clearLineFocus = () => {
      if (!(focusBodyEl instanceof HTMLElement)) {
        return;
      }
      focusBodyEl.classList.remove("line-focus-active");
      focusBodyEl.querySelectorAll(".line-focus-keep").forEach((element) => {
        element.classList.remove("line-focus-keep");
      });
      if (lineResetButtonEl instanceof HTMLElement) {
        lineResetButtonEl.style.display = "none";
      }
    };

    const applyLineFocus = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed || !(focusBodyEl instanceof HTMLElement)) {
        return;
      }

      const range = selection.getRangeAt(0);
      const selectedRect = range.getBoundingClientRect();
      if (!selectedRect.width && !selectedRect.height) {
        return;
      }

      const keepers = Array.from(focusBodyEl.children).filter((block) => {
        if (!(block instanceof HTMLElement)) {
          return false;
        }
        return rectsIntersect(selectedRect, block.getBoundingClientRect());
      });

      if (!keepers.length) {
        return;
      }

      clearLineFocus();
      focusBodyEl.classList.add("line-focus-active");
      keepers.forEach((block) => block.classList.add("line-focus-keep"));
      if (lineResetButtonEl instanceof HTMLElement) {
        lineResetButtonEl.style.display = "inline-flex";
      }
      clearSelectionActionButton();
      selection.removeAllRanges();
    };

    const updateSelectionAction = () => {
      clearSelectionActionButton();
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed || !(focusBodyEl instanceof HTMLElement)) {
        return;
      }

      const range = selection.getRangeAt(0);
      const commonNode = range.commonAncestorContainer;
      const owner = commonNode.nodeType === Node.TEXT_NODE ? commonNode.parentNode : commonNode;
      if (!(owner instanceof Node) || !focusBodyEl.contains(owner)) {
        return;
      }

      const rect = range.getBoundingClientRect();
      if (!rect.width && !rect.height) {
        return;
      }

      selectionActionButton = document.createElement("button");
      selectionActionButton.className = "focus-selection-action";
      selectionActionButton.type = "button";
      selectionActionButton.textContent = "聚焦阅读";
      selectionActionButton.style.left = `${Math.max(16, Math.min(window.innerWidth - 120, rect.left))}px`;
      selectionActionButton.style.top = `${Math.max(16, rect.top - 48)}px`;
      selectionActionButton.addEventListener("click", (event) => {
        event.preventDefault();
        applyLineFocus();
      });
      shadow.appendChild(selectionActionButton);
    };

    const syncThemeButton = () => {
      const themeButton = shadow.querySelector('[data-action="theme"]');
      if (!(themeButton instanceof HTMLElement)) {
        return;
      }
      themeButton.textContent = state.focusMode.theme === "dark" ? "切到浅色" : "切到深色";
    };

    shadow.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const action = target.getAttribute("data-action");
      if (action === "theme") {
        state.focusMode.theme = state.focusMode.theme === "dark" ? "light" : "dark";
        if (shellEl instanceof HTMLElement) {
          shellEl.dataset.theme = state.focusMode.theme;
        }
        syncThemeButton();
      } else if (action === "clear-line-focus") {
        clearLineFocus();
      } else if (action === "exit") {
        deactivateFocusMode();
      } else if (action === "reselect") {
        deactivateFocusMode();
        startFocusModeSelection();
      }
    });

    const handleSelectionChange = () => {
      window.setTimeout(updateSelectionAction, 10);
    };

    shadow.addEventListener("mouseup", handleSelectionChange);
    window.addEventListener("mouseup", handleSelectionChange, true);
    document.addEventListener("selectionchange", handleSelectionChange);

    shadow.addEventListener("mousedown", (event) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest(".focus-selection-action")) {
        return;
      }
      clearSelectionActionButton();
    });

    shellEl?.addEventListener(
      "scroll",
      () => {
        clearSelectionActionButton();
      },
      { passive: true }
    );

    host.__cleanup = () => {
      clearSelectionActionButton();
      document.removeEventListener("selectionchange", handleSelectionChange);
      window.removeEventListener("mouseup", handleSelectionChange, true);
      shadow.removeEventListener("mouseup", handleSelectionChange);
    };

    syncThemeButton();
    state.focusMode.active = true;
    state.focusMode.host = host;
    cleanupFocusSelection();
  }

  function startFocusModeSelection() {
    deactivateFocusMode();

    if (state.selectionActive) {
      cleanupFocusSelection();
      return;
    }

    state.selectionActive = true;

    const overlay = document.createElement("div");
    overlay.className = "semrush-coach-selection-overlay";
    overlay.innerHTML = `
      <div class="semrush-coach-selection-hint">拖动框选你想专注阅读的区域，按 Esc 取消</div>
      <div class="semrush-coach-selection-box semrush-coach-hidden"></div>
    `;
    document.body.appendChild(overlay);

    const box = overlay.querySelector(".semrush-coach-selection-box");
    let startX = 0;
    let startY = 0;
    let dragging = false;

    const updateBox = (rect) => {
      if (!(box instanceof HTMLElement)) {
        return;
      }
      box.classList.remove("semrush-coach-hidden");
      box.style.left = `${rect.left}px`;
      box.style.top = `${rect.top}px`;
      box.style.width = `${rect.width}px`;
      box.style.height = `${rect.height}px`;
    };

    const handleMouseDown = (event) => {
      if (event.button !== 0) {
        return;
      }
      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      updateBox(normalizeFocusRect(startX, startY, startX, startY));
      event.preventDefault();
    };

    const handleMouseMove = (event) => {
      if (!dragging) {
        return;
      }
      updateBox(normalizeFocusRect(startX, startY, event.clientX, event.clientY));
      event.preventDefault();
    };

    const handleMouseUp = (event) => {
      if (!dragging) {
        return;
      }
      dragging = false;
      const rect = normalizeFocusRect(startX, startY, event.clientX, event.clientY);
      if (rect.width < 36 || rect.height < 36) {
        cleanupFocusSelection();
        return;
      }
      activateFocusModeForSelection(rect);
      event.preventDefault();
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        cleanupFocusSelection();
      }
    };

    state.selectionCleanup = () => {
      window.removeEventListener("mousemove", handleMouseMove, true);
      window.removeEventListener("mouseup", handleMouseUp, true);
      window.removeEventListener("keydown", handleKeyDown, true);
      overlay.removeEventListener("mousedown", handleMouseDown, true);
      overlay.remove();
    };

    overlay.addEventListener("mousedown", handleMouseDown, true);
    window.addEventListener("mousemove", handleMouseMove, true);
    window.addEventListener("mouseup", handleMouseUp, true);
    window.addEventListener("keydown", handleKeyDown, true);
  }

  function startSelectionAnalysis() {
    deactivateFocusMode();

    if (state.selectionActive) {
      cleanupFocusSelection();
      return;
    }

    state.selectionActive = true;

    const overlay = document.createElement("div");
    overlay.className = "semrush-coach-selection-overlay";
    overlay.innerHTML = `
      <div class="semrush-coach-selection-hint">拖动框选你想分析的正文区域，按 Esc 取消</div>
      <div class="semrush-coach-selection-box semrush-coach-hidden"></div>
    `;
    document.body.appendChild(overlay);

    const box = overlay.querySelector(".semrush-coach-selection-box");
    let startX = 0;
    let startY = 0;
    let dragging = false;

    const updateBox = (rect) => {
      if (!(box instanceof HTMLElement)) {
        return;
      }
      box.classList.remove("semrush-coach-hidden");
      box.style.left = `${rect.left}px`;
      box.style.top = `${rect.top}px`;
      box.style.width = `${rect.width}px`;
      box.style.height = `${rect.height}px`;
    };

    const handleMouseDown = (event) => {
      if (event.button !== 0) {
        return;
      }
      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      updateBox(normalizeFocusRect(startX, startY, startX, startY));
      event.preventDefault();
    };

    const handleMouseMove = (event) => {
      if (!dragging) {
        return;
      }
      updateBox(normalizeFocusRect(startX, startY, event.clientX, event.clientY));
      event.preventDefault();
    };

    const handleMouseUp = (event) => {
      if (!dragging) {
        return;
      }
      dragging = false;
      const rect = normalizeFocusRect(startX, startY, event.clientX, event.clientY);
      if (rect.width < 36 || rect.height < 36) {
        cleanupFocusSelection();
        return;
      }

      const selectedText = buildSelectionAnalysisText(rect);
      cleanupFocusSelection();

      if (!selectedText) {
        state.history.push({
          role: "assistant",
          pageSummary: "框选分析",
          answer: "这一块我没抓到可分析的正文内容。你可以框大一点，尽量包含段落文字。",
          suggestedNextSteps: ["重新框选更完整的正文区域"],
          confidence: 0.4,
          elementHints: []
        });
        renderHistory();
        openPanel(true);
        return;
      }

      openPanel(true);
      askQuestion(`请分析我框选的这段内容，提炼关键信息、核心观点、风险点和可执行结论：\n\n${selectedText}`);
      event.preventDefault();
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        cleanupFocusSelection();
      }
    };

    state.selectionCleanup = () => {
      window.removeEventListener("mousemove", handleMouseMove, true);
      window.removeEventListener("mouseup", handleMouseUp, true);
      window.removeEventListener("keydown", handleKeyDown, true);
      overlay.removeEventListener("mousedown", handleMouseDown, true);
      overlay.remove();
    };

    overlay.addEventListener("mousedown", handleMouseDown, true);
    window.addEventListener("mousemove", handleMouseMove, true);
    window.addEventListener("mouseup", handleMouseUp, true);
    window.addEventListener("keydown", handleKeyDown, true);
  }

  function toggleFocusMode() {
    if (state.selectionActive) {
      cleanupFocusSelection();
      return;
    }

    if (state.focusMode.active) {
      deactivateFocusMode();
      return;
    }

    startFocusModeSelection();
  }

  async function loadSettings() {
    const response = await chrome.runtime.sendMessage({ type: "SEMRUSH_COACH_LOAD_SETTINGS" });
    if (response?.ok) {
      state.settings = { ...DEFAULT_SETTINGS, ...response.data };
      state.siteEnabled = isCurrentSiteEnabled(state.settings);
      setModeLabel(state.settings.remoteEnabled ? "remote" : "local");
    }

    fillSettingsForm();
    renderHistory();
    renderQuickPrompts(QUICK_PROMPTS);
    updatePageChip(getSnapshot());
    setLoading(false);
  }

  async function saveSettings({ collapseAfterSave = true } = {}) {
    settingsStatusEl.textContent = "正在保存…";
    const payload = {
      remoteEnabled: true,
      trialEnabled: true,
      fallbackToLocal: true,
      trialApiUrl: settingsFormEls.trialApiUrl.value.trim(),
      apiUrl: settingsFormEls.apiUrl.value.trim(),
      model: getActiveModel(),
      apiKey: settingsFormEls.apiKey.value.trim(),
      allowedHosts: parseAllowedHosts(settingsFormEls.allowedHosts.value)
    };

    const response = await chrome.runtime.sendMessage({
      type: "SEMRUSH_COACH_SAVE_SETTINGS",
      payload
    });

    if (!response?.ok) {
      settingsStatusEl.textContent = `保存失败：${response?.error || "未知错误"}`;
      return false;
    }

    state.settings = { ...DEFAULT_SETTINGS, ...response.data };
    state.siteEnabled = isCurrentSiteEnabled(state.settings);
    fillSettingsForm();
    renderHistory();
    renderQuickPrompts(QUICK_PROMPTS);
    updatePageChip(getSnapshot());
    setModeLabel(state.settings.remoteEnabled ? "remote" : "local");
    settingsStatusEl.textContent = state.siteEnabled
      ? formatTrialStatus(state.settings)
      : "已保存，但当前网站还没被启用。";

    if (collapseAfterSave) {
      window.setTimeout(() => toggleSettings(false), 500);
    }

    return true;
  }

  async function addCurrentSite() {
    const nextHosts = parseAllowedHosts([
      ...parseAllowedHosts(state.settings.allowedHosts),
      getCurrentHostname()
    ]);
    settingsFormEls.allowedHosts.value = nextHosts.join("\n");
    await saveSettings({ collapseAfterSave: false });
    settingsStatusEl.textContent = `已把 ${getCurrentHostname()} 加入启用列表。`;
  }

  async function testConnection() {
    settingsStatusEl.textContent = "正在测试…";
    const saved = await saveSettings({ collapseAfterSave: false });
    if (!saved) {
      return;
    }

    const response = await chrome.runtime.sendMessage({ type: "SEMRUSH_COACH_TEST_CONNECTION" });
    if (!response?.ok) {
      settingsStatusEl.textContent = `连接失败：${response?.error || "未知错误"}`;
      return;
    }

    if (response.data?.mode === "trial") {
      settingsStatusEl.textContent = `体验服务可用，剩余 ${response.data.remainingFreeUses}/${response.data.freeTrialLimit} 次。`;
    } else {
      settingsStatusEl.textContent = `连接成功：${response.data.model || state.settings.model}`;
    }
    window.setTimeout(() => toggleSettings(false), 800);
  }

  async function extractUISpec() {
    if (!state.siteEnabled) {
      renderDisabledSiteCard();
      openPanel(true);
      return;
    }

    if (!hasConfiguredRemoteAccess()) {
      state.history.push({
        role: "assistant",
        pageSummary: "提示",
        answer: "提取 UI 规范需要先配置体验服务地址，或者填写你自己的 API Key。",
        suggestedNextSteps: ["点击右上角“体验 / API 设置”完成配置"],
        confidence: 0.9,
        elementHints: []
      });
      renderHistory();
      openPanel(true);
      return;
    }

    const snapshot = getSnapshot();
    updatePageChip(snapshot);
    setLoading(true);
    const extractBtn = root.querySelector(".semrush-coach-extract-ui");
    if (extractBtn) {
      extractBtn.disabled = true;
      extractBtn.textContent = "🎨 分析中…";
    }

    state.history.push({
      role: "user",
      text: "🎨 提取当前页面的 UI 规范"
    });
    renderHistory();

    // ── 进度条 ──
    const progressSteps = [
      "📸 正在截取页面画面…",
      "🔍 正在采集 DOM 样式数据…",
      "🤖 正在调用 AI 视觉模型分析…",
      "📝 正在生成规范文档…"
    ];
    let currentStep = 0;

    const progressCard = document.createElement("article");
    progressCard.className = "semrush-coach-card semrush-coach-progress-card";
    progressCard.innerHTML = `
      <p class="semrush-coach-card-title">UI 规范提取中</p>
      <p class="semrush-coach-progress-step">${progressSteps[0]}</p>
      <div class="semrush-coach-progress-bar-wrap">
        <div class="semrush-coach-progress-bar" style="width: 5%"></div>
      </div>
    `;
    historyEl.appendChild(progressCard);
    scrollHistoryToBottom();

    const progressBar = progressCard.querySelector(".semrush-coach-progress-bar");
    const progressStepEl = progressCard.querySelector(".semrush-coach-progress-step");

    const updateProgress = (step, percent) => {
      currentStep = step;
      if (progressStepEl) progressStepEl.textContent = progressSteps[step] || "";
      if (progressBar) progressBar.style.width = percent + "%";
      scrollHistoryToBottom();
    };

    // Step 0: 截屏
    let screenshotData = null;
    try {
      const captureRes = await chrome.runtime.sendMessage({ type: "SEMRUSH_COACH_CAPTURE_TAB" });
      if (captureRes?.ok && captureRes.dataUrl) {
        screenshotData = await compressImage(captureRes.dataUrl, 1200, 0.7);
      }
    } catch (e) {
      console.warn("截屏失败:", e);
    }
    updateProgress(1, 20);

    try {
      // Step 1: 采集样式
      const computedStyles = extractComputedStyles();
      updateProgress(2, 35);

      // Step 2: 模拟进度推进（实际等待 API）
      const progressTimer = window.setInterval(() => {
        const bar = progressCard.querySelector(".semrush-coach-progress-bar");
        if (bar) {
          const cur = parseFloat(bar.style.width) || 35;
          if (cur < 90) bar.style.width = (cur + 1.2) + "%";
        }
      }, 800);

      const response = await chrome.runtime.sendMessage({
        type: "SEMRUSH_COACH_UI_SPEC",
        payload: {
          pageSnapshot: snapshot,
          screenshot: screenshotData ? { dataUrl: screenshotData } : null,
          computedStyles
        }
      });

      window.clearInterval(progressTimer);
      updateProgress(3, 95);

      if (!response?.ok) {
        throw new Error(response?.error || "插件后台请求失败");
      }

      applyUsageMeta(response.data?.usageMeta);
      openPanel(true);
      const spec = response.data;

      const formatSpec = (spec) => {
        const lines = [];
        lines.push(`═══ UI 规范文档 ═══`);
        lines.push(`网站: ${snapshot.url}`);
        lines.push("");

        if (spec.colorSystem) {
          lines.push("━━ 1. 核心色系定位");
          lines.push(`色系分类: ${spec.colorSystem.classification || "未识别"}`);
          const p = spec.colorSystem.palette || {};
          lines.push(`Primary: ${p.primary || "-"} | Secondary: ${p.secondary || "-"}`);
          lines.push(`Background: ${p.background || "-"} | Card: ${p.surfaceCard || "-"}`);
          lines.push(`Text: ${p.textHeading || "-"} / ${p.textBody || "-"} / ${p.textMuted || "-"}`);
          lines.push(`Border: ${p.border || "-"}`);
          lines.push(`Status: Success ${p.statusSuccess || "-"} | Error ${p.statusError || "-"} | Warning ${p.statusWarning || "-"}`);
          lines.push("");
        }

        if (spec.typography) {
          lines.push("━━ 2. 文字系统");
          lines.push(`字体: ${spec.typography.fontFamily || "-"} (${spec.typography.style || "-"})`);
          lines.push(`开源替代: ${(spec.typography.openSourceAlternatives || []).join(", ") || "-"}`);
          const sc = spec.typography.scale || {};
          for (const [level, detail] of Object.entries(sc)) {
            lines.push(`  ${level}: ${detail.sizePx || "?"}px / ${detail.weight || "?"} / 行高 ${detail.lineHeight || "?"}`);
          }
          lines.push("");
        }

        if (spec.spacingAndShapes) {
          lines.push("━━ 3. 空间与形状");
          lines.push(`基准单位: ${spec.spacingAndShapes.baseUnit || "-"}`);
          const sp = spec.spacingAndShapes.spacingExamples || {};
          lines.push(`间距: 区域 ${sp.sectionGap || "-"} | 卡片 ${sp.cardPadding || "-"} | 元素 ${sp.elementGap || "-"}`);
          const br = spec.spacingAndShapes.borderRadius || {};
          lines.push(`圆角: 按钮 ${br.buttons || "-"} | 卡片 ${br.cards || "-"} | 输入框 ${br.inputs || "-"}`);
          lines.push(`阴影: ${spec.spacingAndShapes.elevation || "-"}`);
          if (spec.spacingAndShapes.shadowExample) lines.push(`  ${spec.spacingAndShapes.shadowExample}`);
          lines.push("");
        }

        if (spec.components) {
          lines.push("━━ 4. 关键 UI 组件");
          const btn = spec.components.buttons || {};
          lines.push(`按钮: 高度 ${btn.heightPx || "?"}px | 内边距 ${btn.paddingH || "?"}/${btn.paddingV || "?"} | 圆角 ${btn.borderRadius || "?"}`);
          lines.push(`  背景 ${btn.primaryBg || "-"} | 文字 ${btn.primaryText || "-"} | Hover: ${btn.hoverEffect || "-"}`);
          const inp = spec.components.inputs || {};
          lines.push(`输入框: 高度 ${inp.heightPx || "?"}px | 边框 ${inp.borderWidth || "?"}/${inp.borderColor || "-"} | 圆角 ${inp.borderRadius || "?"}`);
          const crd = spec.components.cards || {};
          lines.push(`卡片: 内边距 ${crd.padding || "?"} | 圆角 ${crd.borderRadius || "?"} | 背景 ${crd.background || "-"}`);
          lines.push("");
        }

        if (spec.iconStyle) lines.push(`图标风格: ${spec.iconStyle}`);
        if (spec.contentLayout) {
          const cl = spec.contentLayout;
          lines.push(`布局: ${cl.type || "-"} | 侧栏 ${cl.sidebarWidthPx || "?"}px | 主内容最大宽 ${cl.mainContentMaxWidthPx || "?"}px | Header ${cl.headerHeightPx || "?"}px`);
        }
        if (spec.brandVibe) lines.push(`品牌调性: ${spec.brandVibe}`);
        lines.push("");

        if (spec.tailwindConfig) {
          lines.push("━━ 5. Tailwind 配置");
          lines.push(spec.tailwindConfig);
        }

        return lines.join("\n");
      };

      await revealAssistantMessage({
        pageSummary: `UI 规范分析 · ${snapshot.title || snapshot.url}`,
        answer: formatSpec(spec),
        suggestedNextSteps: [
          "将上述色值复制到设计系统中",
          "根据 Tailwind 配置块初始化项目",
          "用提取的规范做竞品分析或重新设计"
        ],
        confidence: 0.88,
        elementHints: []
      });
    } catch (error) {
      state.history.push({
        role: "assistant",
        pageSummary: "UI 规范提取失败",
        answer: `提取失败：${error instanceof Error ? error.message : "未知错误"}`,
        suggestedNextSteps: ["检查 API 配置是否正确", "确认模型支持视觉输入"],
        confidence: 0.15,
        elementHints: []
      });
      renderHistory();
      openPanel(true);
    } finally {
      progressCard?.remove();
      setLoading(false);
      if (extractBtn) {
        extractBtn.disabled = false;
        extractBtn.textContent = "🎨 提取UI规范";
      }
    }
  }

  async function generatePRD() {
    if (!state.siteEnabled) {
      renderDisabledSiteCard();
      openPanel(true);
      return;
    }
    
    if (!hasConfiguredRemoteAccess()) {
      state.history.push({
        role: "assistant",
        pageSummary: "提示",
        answer: "生成 PRD 需要先配置体验服务地址，或者填写你自己的 API Key。",
        suggestedNextSteps: ["点击右上角“体验 / API 设置”完成配置"],
        confidence: 0.9,
        elementHints: []
      });
      renderHistory();
      openPanel(true);
      return;
    }

    const snapshot = getSnapshot();
    updatePageChip(snapshot);
    setLoading(true);
    formEl.style.display = "none";

    state.history.push({
      role: "user",
      text: "📄 生成当前网页的产品需求文档 (PRD)"
    });
    renderHistory();

    const progressSteps = [
      "📸 正在抓取页面结构与截图…",
      "🤖 正在调用 AI 模型深层提取特征…",
      "📝 正在整理 PRD 文档…"
    ];
    let currentStep = 0;

    const progressCard = document.createElement("article");
    progressCard.className = "semrush-coach-card semrush-coach-progress-card";
    progressCard.innerHTML = `
      <p class="semrush-coach-card-title">产品需求文档生成中</p>
      <p class="semrush-coach-progress-step" style="font-size:13px; color:#68736d; margin: 4px 0">${progressSteps[0]}</p>
      <div class="semrush-coach-progress-bar-wrap">
        <div class="semrush-coach-progress-bar" style="width: 5%"></div>
      </div>
    `;
    historyEl.appendChild(progressCard);
    scrollHistoryToBottom();

    const progressBar = progressCard.querySelector(".semrush-coach-progress-bar");
    const progressStepEl = progressCard.querySelector(".semrush-coach-progress-step");

    const updateProgress = (step, percent) => {
      currentStep = step;
      if (progressStepEl) progressStepEl.textContent = progressSteps[step] || "";
      if (progressBar) progressBar.style.width = percent + "%";
      scrollHistoryToBottom();
    };

    let screenshotData = null;
    try {
      const captureRes = await chrome.runtime.sendMessage({ type: "SEMRUSH_COACH_CAPTURE_TAB" });
      if (captureRes?.ok && captureRes.dataUrl) {
        screenshotData = await compressImage(captureRes.dataUrl, 1200, 0.7);
      }
    } catch (e) {
      console.warn("截屏失败:", e);
    }
    
    updateProgress(1, 15);

    let progressTimer;
    try {
      progressTimer = window.setInterval(() => {
        if (progressBar) {
          const cur = parseFloat(progressBar.style.width) || 15;
          if (cur < 93) progressBar.style.width = (cur + 1.4) + "%";
        }
      }, 800);

      const response = await chrome.runtime.sendMessage({
        type: "SEMRUSH_COACH_PRD_DOCUMENT",
        payload: {
          pageSnapshot: snapshot,
          screenshot: screenshotData ? { dataUrl: screenshotData } : null
        }
      });
      
      window.clearInterval(progressTimer);
      updateProgress(2, 98);

      if (!response?.ok) {
        throw new Error(response?.error || "插件后台请求失败");
      }

      applyUsageMeta(response.data?.usageMeta);
      openPanel(true);

      await revealAssistantMessage({
        pageSummary: response.data.pageSummary || `产品需求文档 (PRD) · ${snapshot.title || snapshot.url}`,
        answer: response.data.answer || "文档生成失败",
        suggestedNextSteps: [],
        confidence: 0.95,
        elementHints: []
      });
    } catch (error) {
      window.clearInterval(progressTimer);
      state.history.push({
        role: "assistant",
        pageSummary: "PRD 生成失败",
        answer: `生成失败：${error instanceof Error ? error.message : "未知错误"}`,
        suggestedNextSteps: ["检查 API 配置是否正确"],
        confidence: 0.15,
        elementHints: []
      });
      renderHistory();
      openPanel(true);
    } finally {
      window.clearInterval(progressTimer);
      progressCard?.remove();
      formEl.style.display = "";
      setLoading(false);
    }
  }

  async function generatePageSummaryAndMindmap() {
    if (!state.siteEnabled) {
      renderDisabledSiteCard();
      openPanel(true);
      return;
    }

    if (!hasConfiguredRemoteAccess()) {
      state.history.push({
        role: "assistant",
        pageSummary: "提示",
        answer: "生成总结和脑图需要先配置体验服务地址，或者填写你自己的 API Key。",
        suggestedNextSteps: ["点击右上角“体验 / API 设置”完成配置"],
        confidence: 0.9,
        elementHints: []
      });
      renderHistory();
      openPanel(true);
      return;
    }

    const snapshot = getSnapshot();
    updatePageChip(snapshot);
    setLoading(true);

    if (generateSummaryButtonEl) {
      generateSummaryButtonEl.disabled = true;
      generateSummaryButtonEl.textContent = "总结中…";
    }

    state.history.push({
      role: "user",
      text: "🧠 请帮我总结当前页面并同步生成脑图"
    });
    renderHistory();

    const progressSteps = [
      "正在滚动采样页面内容…",
      "正在提取整页要点、列表和表格…",
      "正在调用 AI 生成总结与脑图…",
      "正在整理结果…"
    ];

    const progressCard = document.createElement("article");
    progressCard.className = "semrush-coach-card semrush-coach-progress-card";
    progressCard.innerHTML = `
      <p class="semrush-coach-card-title">页面总结与脑图生成中</p>
      <p class="semrush-coach-progress-step">${progressSteps[0]}</p>
      <div class="semrush-coach-progress-bar-wrap">
        <div class="semrush-coach-progress-bar" style="width: 8%"></div>
      </div>
    `;
    historyEl.appendChild(progressCard);
    scrollHistoryToBottom();

    const progressBar = progressCard.querySelector(".semrush-coach-progress-bar");
    const progressStepEl = progressCard.querySelector(".semrush-coach-progress-step");
    const updateProgress = (step, percent) => {
      if (progressStepEl) {
        progressStepEl.textContent = progressSteps[step] || "";
      }
      if (progressBar) {
        progressBar.style.width = `${percent}%`;
      }
      scrollHistoryToBottom();
    };

    let screenshotData = null;
    let summarySource = null;
    let progressTimer;

    try {
      summarySource = await collectScrollablePageSummarySource();
      updateProgress(1, 28);

      try {
        const captureRes = await chrome.runtime.sendMessage({ type: "SEMRUSH_COACH_CAPTURE_TAB" });
        if (captureRes?.ok && captureRes.dataUrl) {
          screenshotData = await compressImage(captureRes.dataUrl, 1200, 0.7);
        }
      } catch (e) {
        console.warn("页面总结截图失败:", e);
      }

      updateProgress(2, 44);
      progressTimer = window.setInterval(() => {
        const current = parseFloat(progressBar?.style.width || "44") || 44;
        if (current < 92 && progressBar) {
          progressBar.style.width = `${current + 1.1}%`;
        }
      }, 900);

      const response = await chrome.runtime.sendMessage({
        type: "SEMRUSH_COACH_PAGE_SUMMARY",
        payload: {
          pageSnapshot: snapshot,
          screenshot: screenshotData ? { dataUrl: screenshotData } : null,
          summarySource
        }
      });

      window.clearInterval(progressTimer);
      updateProgress(3, 98);

      if (!response?.ok) {
        throw new Error(response?.error || "插件后台请求失败");
      }

      const data = response.data || {};
      const summaryMarkdown = String(data.summaryMarkdown || "").trim();
      const mindmapMermaid = String(data.mindmapMermaid || "").trim();
      applyUsageMeta(data.usageMeta);

      if (summaryMarkdown) {
        await revealAssistantMessage({
          pageSummary: data.pageSummary || `页面总结 · ${snapshot.title || snapshot.url}`,
          answer: summaryMarkdown,
          suggestedNextSteps: [],
          confidence: 0.94,
          elementHints: [],
          renderAsCode: true
        });
      }

      if (mindmapMermaid) {
        state.history.push({
          role: "assistant",
          pageSummary: "页面脑图",
          answer: mindmapMermaid,
          suggestedNextSteps: [],
          confidence: 0.92,
          elementHints: [],
          renderAsMindmap: true
        });
      }

      renderHistory();
      openPanel(true);
    } catch (error) {
      window.clearInterval(progressTimer);
      state.history.push({
        role: "assistant",
        pageSummary: "页面总结生成失败",
        answer: `生成失败：${error instanceof Error ? error.message : "未知错误"}`,
        suggestedNextSteps: [
          "检查 API 配置是否可用",
          "如果页面是懒加载内容，先手动滚动一遍再重试"
        ],
        confidence: 0.15,
        elementHints: []
      });
      renderHistory();
      openPanel(true);
    } finally {
      window.clearInterval(progressTimer);
      progressCard?.remove();
      setLoading(false);
      if (generateSummaryButtonEl) {
        generateSummaryButtonEl.disabled = false;
        generateSummaryButtonEl.textContent = "总结";
      }
    }
  }

  async function pasteTextFromClipboard() {
    try {
      const clipboardText = await navigator.clipboard.readText();
      if (!clipboardText.trim()) {
        state.history.push({
          role: "assistant",
          pageSummary: "粘贴失败",
          answer: "剪贴板里暂时没有可用文本。你可以先复制一段文字，再点一次“粘贴文本”。",
          suggestedNextSteps: ["复制文本后重新点击“粘贴文本”"],
          confidence: 0.92,
          elementHints: []
        });
        renderHistory();
        openPanel(true);
        return;
      }

      inputEl.value = clipboardText;
      inputEl.focus();
      inputEl.setSelectionRange(clipboardText.length, clipboardText.length);
      openPanel(true);
    } catch (error) {
      state.history.push({
        role: "assistant",
        pageSummary: "粘贴失败",
        answer: "当前页面不允许直接读取剪贴板。你可以手动粘贴到输入框里，然后点“转 Markdown”。",
        suggestedNextSteps: ["手动粘贴文本", "点击“转 Markdown”生成结果"],
        confidence: 0.6,
        elementHints: []
      });
      renderHistory();
      openPanel(true);
    }
  }

  async function formatInputAsMarkdown() {
    const rawText = inputEl.value.trim();
    if (!rawText) {
      state.history.push({
        role: "assistant",
        pageSummary: "缺少内容",
        answer: "先粘贴一段文字，再点击“转 Markdown”。",
        suggestedNextSteps: ["点击“粘贴文本”", "或者手动把文字粘贴进输入框"],
        confidence: 0.95,
        elementHints: []
      });
      renderHistory();
      openPanel(true);
      return;
    }

    const markdown = convertPlainTextToMarkdown(rawText);
    inputEl.value = markdown || rawText;
    state.history.push({
      role: "user",
      text: buildMarkdownPreview(rawText) || "已粘贴待转换文本"
    });
    state.history.push({
      role: "assistant",
      pageSummary: "Markdown 转换结果",
      answer: markdown || rawText,
      suggestedNextSteps: [
        "点击右上角复制按钮，直接复制 Markdown",
        "如需继续提问，也可以在输入框里继续编辑文本"
      ],
      confidence: 0.96,
      elementHints: [],
      renderAsCode: true
    });
    renderHistory();
    openPanel(true);
  }

  async function askQuestion(question) {
    if (!state.siteEnabled) {
      renderDisabledSiteCard();
      openPanel(true);
      return;
    }

    const trimmed = question.trim();
    if (!trimmed) {
      state.history.push({
        role: "assistant",
        pageSummary: "提示",
        answer: "你还没有输入问题。可以直接输入一句话，或者先点下方快捷问题。",
        suggestedNextSteps: ["例如：这个页面怎么用？", "或者：我现在该先点哪里？"],
        confidence: 0.92,
        elementHints: []
      });
      renderHistory();
      return;
    }

    const snapshot = getSnapshot();
    updatePageChip(snapshot);
    inputEl.value = "";

    setLoading(true);

    let submittedAttachment = state.attachment
      ? {
          dataUrl: state.attachment.dataUrl,
          name: state.attachment.name || "截图"
        }
      : null;

    if (!submittedAttachment && state.settings.remoteEnabled) {
      try {
        const captureRes = await chrome.runtime.sendMessage({ type: "SEMRUSH_COACH_CAPTURE_TAB" });
        if (captureRes?.ok && captureRes.dataUrl) {
          const compressed = await compressImage(captureRes.dataUrl, 1200, 0.7);
          submittedAttachment = {
            dataUrl: compressed,
            name: "自动截屏"
          };
        }
      } catch (e) {
        console.warn("自动截屏失败:", e);
      }
    }

    clearAttachment();
    state.history.push({
      role: "user",
      text: trimmed,
      attachment: submittedAttachment
    });
    renderHistory();

    const questionProgressSteps = [
      "正在理解你的问题与目标…",
      "正在结合页面内容与截图推理…",
      "正在生成建议与下一步动作…"
    ];
    const questionProgressCard = document.createElement("article");
    questionProgressCard.className = "semrush-coach-card semrush-coach-progress-card";
    questionProgressCard.innerHTML = `
      <div class="semrush-coach-progress-head">
        <span class="semrush-coach-progress-eyebrow">AI Reasoning</span>
        <span class="semrush-coach-progress-percent">12%</span>
      </div>
      <p class="semrush-coach-card-title semrush-coach-progress-title">正在生成回答</p>
      <p class="semrush-coach-progress-step">${questionProgressSteps[0]}</p>
      <div class="semrush-coach-progress-bar-wrap">
        <div class="semrush-coach-progress-bar-glow"></div>
        <div class="semrush-coach-progress-bar" style="width: 12%"></div>
      </div>
      <div class="semrush-coach-progress-dots" aria-hidden="true">
        <span class="is-active"></span>
        <span></span>
        <span></span>
      </div>
    `;
    historyEl.appendChild(questionProgressCard);
    scrollHistoryToBottom();

    const questionProgressBar = questionProgressCard.querySelector(".semrush-coach-progress-bar");
    const questionProgressStepEl = questionProgressCard.querySelector(".semrush-coach-progress-step");
    const questionProgressPercentEl = questionProgressCard.querySelector(".semrush-coach-progress-percent");
    const questionProgressDots = Array.from(questionProgressCard.querySelectorAll(".semrush-coach-progress-dots span"));
    const updateQuestionProgress = (step, percent) => {
      if (questionProgressStepEl) {
        questionProgressStepEl.textContent = questionProgressSteps[step] || "";
      }
      if (questionProgressBar) {
        questionProgressBar.style.width = `${percent}%`;
      }
      if (questionProgressPercentEl) {
        questionProgressPercentEl.textContent = `${Math.round(percent)}%`;
      }
      questionProgressDots.forEach((dot, index) => {
        dot.classList.toggle("is-active", index <= step);
      });
      scrollHistoryToBottom();
    };
    updateQuestionProgress(0, 12);
    const questionProgressTimer = window.setInterval(() => {
      const current = parseFloat(questionProgressBar?.style.width || "12") || 12;
      if (current < 91 && questionProgressBar) {
        const next = current < 40 ? current + 3.4 : current < 72 ? current + 1.6 : current + 0.7;
        questionProgressBar.style.width = `${Math.min(next, 91)}%`;
        if (questionProgressPercentEl) {
          questionProgressPercentEl.textContent = `${Math.round(Math.min(next, 91))}%`;
        }
      }
    }, 780);

    try {
      updateQuestionProgress(1, 34);
      const response = await chrome.runtime.sendMessage({
        type: "SEMRUSH_COACH_GUIDANCE",
        payload: {
          question: trimmed,
          locale: snapshot.locale,
          pageSnapshot: snapshot,
          screenshot: submittedAttachment,
          conversationHistory: state.history
            .filter((item) => item.role === "user")
            .slice(-6)
            .map((item) => ({ role: item.role, text: item.text }))
        }
      });

      if (!response?.ok) {
        throw new Error(response?.error || "插件后台请求失败");
      }

      updateQuestionProgress(2, 97);

      const needsExpanded =
        (response.data.suggestedNextSteps || []).length >= 3 ||
        String(response.data.answer || "").length > 80;
      openPanel(needsExpanded);

      setModeLabel(response.meta?.mode || (state.settings.remoteEnabled ? "remote" : "local"));
      applyUsageMeta(response.meta?.usageMeta || response.data?.usageMeta);
      const assistantEntry = await revealAssistantMessage(response.data);
      renderQuickPrompts(response.data.quickPrompts || QUICK_PROMPTS);

      if (assistantEntry.elementHints?.length) {
        highlightHint(assistantEntry.elementHints[0]);
      }
    } catch (error) {
      const isContextInvalid = isExtensionContextInvalidError(error);
      state.history.push({
        role: "assistant",
        pageSummary: isContextInvalid ? "插件需要刷新" : "插件异常",
        answer: isContextInvalid
          ? "插件刚刚被重载或更新了，但当前网页还没刷新，所以旧页面里的脚本已经失效。请直接刷新当前网页，然后再重新提问。"
          : `请求失败：${error instanceof Error ? error.message : "未知错误"}`,
        suggestedNextSteps: isContextInvalid
          ? [
              "刷新当前网页。",
              "刷新后重新打开右下角 AI 气泡，再提问一次。"
            ]
          : [
              "检查 API 配置是否正确。",
              "如果你附加了图片，请确认远程模型支持视觉输入。"
            ],
        confidence: 0.15,
        elementHints: []
      });
      renderHistory();
      openPanel(true);
    } finally {
      window.clearInterval(questionProgressTimer);
      questionProgressCard.remove();
      setLoading(false);
    }
  }

  bubble.addEventListener("click", () => {
    if (state.open) {
      closePanel();
      return;
    }
    openPanel(!state.siteEnabled);
  });

  closeButton.addEventListener("click", closePanel);
  mindmapModalCloseEl?.addEventListener("click", closeMindmapModal);
  mindmapModalEl?.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.classList.contains("semrush-coach-mindmap-modal-backdrop")) {
      closeMindmapModal();
    }
  });
  settingsToggleEl.addEventListener("click", () => {
    toggleSettings(!state.settingsOpen);
    openPanel(true);
  });
  saveSettingsEl.addEventListener("click", () => {
    saveSettings();
  });
  addCurrentSiteEl.addEventListener("click", () => {
    addCurrentSite();
  });
  pasteTextButtonEl.addEventListener("click", () => {
    pasteTextFromClipboard();
  });
  formatMarkdownButtonEl.addEventListener("click", () => {
    formatInputAsMarkdown();
  });
  attachButtonEl.addEventListener("click", () => {
    fileInputEl.click();
  });

  toolsToggleButtonEl?.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleToolsMenu(!state.toolsMenuOpen);
  });

  toolsMenuEl?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const item = target.closest(".semrush-coach-tools-item");
    if (!(item instanceof HTMLElement)) {
      return;
    }

    const tool = item.getAttribute("data-tool");
    closeToolsMenu();
    if (tool === "selection-analysis") {
      startSelectionAnalysis();
    } else if (tool === "markdown") {
      formatInputAsMarkdown();
    } else if (tool === "extract-ui") {
      extractUISpec();
    } else if (tool === "generate-prd") {
      generatePRD();
    }
  });

  const extractUIBtn = root.querySelector(".semrush-coach-extract-ui");
  if (extractUIBtn) {
    extractUIBtn.addEventListener("click", () => {
      extractUISpec();
    });
  }

  const generatePRDBtn = root.querySelector(".semrush-coach-generate-prd");
  if (generatePRDBtn) {
    generatePRDBtn.addEventListener("click", () => {
      generatePRD();
    });
  }

  if (generateSummaryButtonEl) {
    generateSummaryButtonEl.addEventListener("click", () => {
      generatePageSummaryAndMindmap();
    });
  }

  focusModeButtonEl.addEventListener("click", () => {
    toggleFocusMode();
  });

  providerSelectEl.addEventListener("change", (e) => {
    updateProviderUI(e.target.value);
  });

  modelSelectEl.addEventListener("change", handleModelSelectChange);

  fileInputEl.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (file) {
      await setAttachmentFromFile(file);
    }
  });

  attachmentEl.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.classList.contains("semrush-coach-attachment-remove")) {
      clearAttachment();
    }
  });

  inputEl.addEventListener("paste", async (event) => {
    const items = Array.from(event.clipboardData?.items || []);
    const imageItem = items.find((item) => item.type.startsWith("image/"));
    if (!imageItem) {
      return;
    }

    const file = imageItem.getAsFile();
    if (!file) {
      return;
    }

    event.preventDefault();
    await setAttachmentFromFile(file);
  });

  inputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      askQuestion(inputEl.value);
    }
  });

  formEl.addEventListener("submit", (event) => {
    event.preventDefault();
    askQuestion(inputEl.value);
  });

  promptEl.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.classList.contains("semrush-coach-prompt")) {
      return;
    }
    askQuestion(target.textContent || "");
  });

  document.addEventListener("click", (event) => {
    if (!state.toolsMenuOpen) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Node) || !toolsMenuWrapEl.contains(target)) {
      closeToolsMenu();
    }
  });

  historyEl.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const copyBtn = target.closest(".semrush-coach-copy-btn");
    if (copyBtn) {
      const textToCopy = copyBtn.getAttribute("data-answer") || "";
      try {
        await navigator.clipboard.writeText(textToCopy);
        const originalText = copyBtn.textContent;
        copyBtn.textContent = "✅ 已复制";
        window.setTimeout(() => {
          copyBtn.textContent = originalText;
        }, 2000);
      } catch (err) {
        console.warn("复制失败", err);
      }
      return;
    }

    const mindmapBtn = target.closest(".semrush-coach-mindmap-open-btn");
    if (mindmapBtn) {
      openMindmapModal(mindmapBtn.getAttribute("data-answer") || "");
      return;
    }

    const mindmapTool = target.closest(".semrush-coach-mindmap-tool");
    if (mindmapTool) {
      const viewer = mindmapTool.closest(".semrush-coach-mindmap-viewer");
      const action = mindmapTool.getAttribute("data-action");
      if (viewer && action === "fit") {
        fitMindmapViewer(viewer);
      } else if (viewer && action === "zoom-in") {
        zoomMindmapViewer(viewer, 1.15);
      } else if (viewer && action === "zoom-out") {
        zoomMindmapViewer(viewer, 0.87);
      } else if (action === "fullscreen") {
        openMindmapModal(mindmapTool.getAttribute("data-source") || "");
      }
      return;
    }

    if (target.classList.contains("semrush-coach-enable-current-site")) {
      addCurrentSite();
      return;
    }

    if (target.classList.contains("semrush-coach-open-settings")) {
      toggleSettings(true);
      openPanel(true);
      return;
    }

    if (!target.classList.contains("semrush-coach-hint")) {
      return;
    }

    const assistantMessages = state.history.filter((item) => item.role === "assistant");
    const latest = assistantMessages[assistantMessages.length - 1];
    const index = Number(target.dataset.hintIndex);
    if (latest?.elementHints?.[index]) {
      highlightHint(latest.elementHints[index]);
    }
  });

  mindmapModalEl?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const mindmapTool = target.closest(".semrush-coach-mindmap-tool");
    if (!mindmapTool) {
      return;
    }

    const viewer = mindmapTool.closest(".semrush-coach-mindmap-viewer");
    const action = mindmapTool.getAttribute("data-action");
    if (viewer && action === "fit") {
      fitMindmapViewer(viewer);
    } else if (viewer && action === "zoom-in") {
      zoomMindmapViewer(viewer, 1.15);
    } else if (viewer && action === "zoom-out") {
      zoomMindmapViewer(viewer, 0.87);
    }
  });

  window.setInterval(() => {
    if (window.location.href !== state.lastUrl) {
      state.lastUrl = window.location.href;
      const snapshot = getSnapshot();
      updatePageChip(snapshot);
      if (!state.history.length) {
        renderHistory();
      }
    }
  }, 1200);

  renderHistory();
  renderAttachment();
  renderQuickPrompts(QUICK_PROMPTS);
  updatePageChip(getSnapshot());
  loadSettings().catch(() => {
    fillSettingsForm();
    renderHistory();
  });
})();
