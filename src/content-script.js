(function () {
  if (window.__pageCoachMounted) {
    return;
  }
  const pageCoachInstanceId = `semrush-coach-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  window.__pageCoachMounted = pageCoachInstanceId;

  document.querySelectorAll(".semrush-coach-root, .semrush-coach-ai-timeline").forEach((node) => {
    if (node instanceof HTMLElement) {
      node.remove();
    }
  });

  const DEFAULT_ALLOWED_HOSTS = [
    "semrush.com",
    "*.semrush.com",
    "*.semrush.com.cn",
    "sem.3ue.co",
    "*.3ue.co",
    "polymarket.com",
    "*.polymarket.com",
    "chatgpt.com",
    "chat.openai.com",
    "gemini.google.com"
  ];

  const DEFAULT_SETTINGS = {
    remoteEnabled: true,
    trialEnabled: true,
    trialApiUrl: "",
    freeTrialLimit: 15,
    apiUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    model: "qwen-vl-plus",
    apiKey: "",
    fallbackToLocal: true,
    aiTimelineEnabled: true,
    allowedHosts: DEFAULT_ALLOWED_HOSTS
  };

  const DEFAULT_COMPARE_FOCUS = [
    "默认结构：竞品基本信息、目标用户/场景、信息架构、核心功能体验、非核心功能/差异化能力、运营与商业动作、优劣势总结、可借鉴建议。",
    "默认表格：基本信息总表、用户与场景总表、信息架构对比表、核心功能对比表、非核心能力/运营动作表、优势短板与建议表。"
  ].join("\n");

  const QUICK_PROMPTS = [];
  const TOOL_TASK_TRIGGERS = [
    "🧠 请帮我总结当前页面并同步生成脑图",
    "📄 生成当前网页的产品需求文档 (PRD)",
    "项目评估："
  ];

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
    aiTimeline: {
      signature: "",
      items: [],
      hoverIndex: -1,
      activeIndex: -1,
      activeLockUntil: 0,
      refreshQueued: false,
      keywordCache: {},
      keywordRequests: new Set(),
      markedKeys: new Set(),
      runtimeUnavailable: false
    },
    selectionActive: false,
    selectionCleanup: null,
    focusMode: {
      active: false,
      host: null,
      theme: "dark",
      scrollLock: null
    },
    settingsLoaded: false,
    hydratingSettingsForm: false,
    pageUnloading: false
  };

  const root = document.createElement("div");
  root.className = "semrush-coach-root";
  root.dataset.pageCoachInstance = pageCoachInstanceId;
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
            <input class="semrush-coach-setting-trial-api-url" type="text" placeholder="使用个人 Key 直连时，请保持此处完全空白" />
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
            <div class="semrush-coach-password-wrapper" style="display: flex; align-items: center; gap: 8px;">
              <input class="semrush-coach-setting-api-key semrush-coach-masked-input" type="text" autocomplete="off" data-lpignore="true" data-1p-ignore="true" placeholder="填写你的 API Key" style="flex: 1;" />
              <button type="button" class="semrush-coach-api-key-help-trigger">获取说明</button>
              <button type="button" class="semrush-coach-toggle-password" style="background: none; border: none; cursor: pointer; padding: 4px; font-size: 16px; opacity: 0.7;">👁️</button>
            </div>
          </label>
          <label class="semrush-coach-setting-full" style="display: none;">
            <span>启用网站列表（每行一个域名）</span>
            <textarea class="semrush-coach-setting-hosts" rows="5" placeholder="semrush.com&#10;polymarket.com&#10;*.example.com"></textarea>
          </label>
          <label class="semrush-coach-setting-full semrush-coach-setting-checkbox">
            <input class="semrush-coach-setting-ai-timeline" type="checkbox" checked />
            <span>AI 对话页时间轴（ChatGPT / Gemini）</span>
          </label>
        </div>
        <div class="semrush-coach-settings-actions">
          <button class="semrush-coach-settings-save" type="button">保存</button>
          <button class="semrush-coach-settings-add-site" type="button" style="display: none;">添加当前网站</button>
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
            <button class="semrush-coach-generate-prd" type="button">📄 网页转PRD</button>
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
    <section class="semrush-coach-project-assessment-modal semrush-coach-hidden" aria-hidden="true">
      <div class="semrush-coach-project-assessment-modal-backdrop"></div>
      <div class="semrush-coach-project-assessment-modal-dialog">
        <div class="semrush-coach-project-assessment-modal-header">
          <p class="semrush-coach-project-assessment-modal-title">
            <span class="semrush-coach-project-assessment-modal-title-prefix">AI</span>
            &nbsp;智能创建助手 功能需求输入
          </p>
          <button class="semrush-coach-project-assessment-modal-close" type="button" aria-label="关闭">×</button>
        </div>
        <div class="semrush-coach-project-assessment-modal-body">
          <textarea class="semrush-coach-project-assessment-input" placeholder="例如：我想做一个专门记录猫咪体重的App…"></textarea>
        </div>
        <div class="semrush-coach-project-assessment-modal-footer">
          <button class="semrush-coach-project-assessment-btn-cancel" type="button">取消</button>
          <button class="semrush-coach-project-assessment-btn-submit" type="button">确定</button>
        </div>
      </div>
    </section>
    <section class="semrush-coach-api-key-help-modal semrush-coach-project-assessment-modal semrush-coach-hidden" aria-hidden="true">
      <div class="semrush-coach-project-assessment-modal-backdrop"></div>
      <div class="semrush-coach-project-assessment-modal-dialog semrush-coach-api-key-help-dialog">
        <div class="semrush-coach-project-assessment-modal-header">
          <p class="semrush-coach-project-assessment-modal-title">Qwen API 获取说明</p>
          <button class="semrush-coach-api-key-help-close semrush-coach-project-assessment-modal-close" type="button" aria-label="关闭">×</button>
        </div>
        <div class="semrush-coach-project-assessment-modal-body semrush-coach-api-key-help-body">
          <p>Qwen API 获取地址在阿里云百炼这里：</p>
          <p><a href="https://bailian.console.aliyun.com/" target="_blank" rel="noreferrer noopener">https://bailian.console.aliyun.com/</a></p>
          <p>进去后开通百炼服务，创建 API Key 就行。</p>
          <p>另外记得先充值，个人测试的话充 5 元 一般就能用挺久。</p>
        </div>
      </div>
    </section>
  `;

  const aiTimelineEl = document.createElement("aside");
  aiTimelineEl.className = "semrush-coach-ai-timeline semrush-coach-hidden";
  aiTimelineEl.dataset.pageCoachInstance = pageCoachInstanceId;
  aiTimelineEl.innerHTML = `
    <div class="semrush-coach-ai-timeline-body">
      <div class="semrush-coach-ai-timeline-line"></div>
      <div class="semrush-coach-ai-timeline-items"></div>
    </div>
    <div class="semrush-coach-ai-timeline-preview semrush-coach-hidden"></div>
  `;
  document.body.appendChild(aiTimelineEl);

  function cleanupDuplicatePageCoachNodes() {
    document.querySelectorAll(".semrush-coach-root, .semrush-coach-ai-timeline").forEach((node) => {
      if (!(node instanceof HTMLElement)) {
        return;
      }
      if (node.dataset.pageCoachInstance !== pageCoachInstanceId) {
        node.remove();
      }
    });
  }

  cleanupDuplicatePageCoachNodes();

  const bubble = root.querySelector(".semrush-coach-bubble");
  const panel = root.querySelector(".semrush-coach-panel");
  const aiTimelineItemsEl = aiTimelineEl.querySelector(".semrush-coach-ai-timeline-items");
  const aiTimelinePreviewEl = aiTimelineEl.querySelector(".semrush-coach-ai-timeline-preview");
  const mindmapModalEl = root.querySelector(".semrush-coach-mindmap-modal");
  const mindmapModalBodyEl = root.querySelector(".semrush-coach-mindmap-modal-body");
  const mindmapModalCloseEl = root.querySelector(".semrush-coach-mindmap-modal-close");
  const projectAssessmentModalEl = root.querySelector(".semrush-coach-project-assessment-modal");
  const projectAssessmentCloseEl = root.querySelector(".semrush-coach-project-assessment-modal-close");
  const projectAssessmentCancelEl = root.querySelector(".semrush-coach-project-assessment-btn-cancel");
  const projectAssessmentSubmitEl = root.querySelector(".semrush-coach-project-assessment-btn-submit");
  const projectAssessmentInputEl = root.querySelector(".semrush-coach-project-assessment-input");
  const projectAssessmentBackdropEl = root.querySelector(".semrush-coach-project-assessment-modal-backdrop");
  const apiKeyHelpTriggerEl = root.querySelector(".semrush-coach-api-key-help-trigger");
  const apiKeyHelpModalEl = root.querySelector(".semrush-coach-api-key-help-modal");
  const apiKeyHelpCloseEl = root.querySelector(".semrush-coach-api-key-help-close");
  const apiKeyHelpBackdropEl = apiKeyHelpModalEl?.querySelector(".semrush-coach-project-assessment-modal-backdrop");
  let compareModalEl = root.querySelector(".semrush-coach-compare-modal");
  let compareModalCloseEl = root.querySelector(".semrush-coach-compare-modal-close");
  let compareUrlInputEls = Array.from(root.querySelectorAll(".semrush-coach-compare-url"));
  let compareFocusInputEl = root.querySelector(".semrush-coach-compare-focus");
  let compareHelperEl = root.querySelector(".semrush-coach-compare-helper");
  let compareUseNextEl = root.querySelector(".semrush-coach-compare-use-next");
  let compareSubmitEl = root.querySelector(".semrush-coach-compare-submit");
  compareModalEl?.remove();
  compareModalEl = null;
  compareModalCloseEl = null;
  compareUrlInputEls = [];
  compareFocusInputEl = null;
  compareHelperEl = null;
  compareUseNextEl = null;
  compareSubmitEl = null;
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
  const selectionCaptureButtonEl = document.createElement("button");
  selectionCaptureButtonEl.className = "semrush-coach-selection-capture";
  selectionCaptureButtonEl.type = "button";
  selectionCaptureButtonEl.setAttribute("aria-label", "框选截图");
  selectionCaptureButtonEl.setAttribute("title", "框选截图");
  selectionCaptureButtonEl.innerHTML = `
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path d="M22 10H17c-3.866 0-7 3.134-7 7v5" />
      <path d="M42 10h5c3.866 0 7 3.134 7 7v5" />
      <path d="M54 42v5c0 3.866-3.134 7-7 7h-5" />
      <path d="M22 54h-5c-3.866 0-7-3.134-7-7v-5" />
      <path d="M32 22v20" />
      <path d="M22 32h20" />
    </svg>
  `;
  formToolsEl?.insertBefore(selectionCaptureButtonEl, pasteTextButtonEl || null);
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
      <button class="semrush-coach-tools-item" type="button" data-tool="generate-prd">网页转PRD</button>
    </div>
    <section class="semrush-coach-compare-modal semrush-coach-hidden" aria-hidden="true">
      <div class="semrush-coach-compare-modal-backdrop"></div>
      <div class="semrush-coach-compare-modal-dialog">
        <div class="semrush-coach-compare-modal-header">
          <div>
            <p class="semrush-coach-card-title" style="margin:0;">竞品对比</p>
            <p class="semrush-coach-compare-modal-subtitle">当前页已经算 1 个竞品，不用重复填写当前页链接。你再补充最多 3 个竞品链接，我来一起出分析报告。</p>
          </div>
          <button class="semrush-coach-compare-modal-close" type="button" aria-label="关闭">×</button>
        </div>
        <label class="semrush-coach-compare-field">
          <span>链接 1</span>
          <input class="semrush-coach-compare-url" type="text" placeholder="https://example.com/page-b" />
        </label>
        <label class="semrush-coach-compare-field">
          <span>链接 2</span>
          <input class="semrush-coach-compare-url" type="text" placeholder="https://example.com/page-c" />
        </label>
        <label class="semrush-coach-compare-field">
          <span>链接 3</span>
          <input class="semrush-coach-compare-url" type="text" placeholder="https://example.com/page-d" />
        </label>
        <label class="semrush-coach-compare-field">
          <span>重点看什么</span>
          <textarea class="semrush-coach-compare-focus" rows="5" placeholder="默认会按竞品分析报告来写，重点会自动带上"></textarea>
        </label>
        <div class="semrush-coach-compare-helper semrush-coach-hidden"></div>
        <div class="semrush-coach-compare-actions">
          <button class="semrush-coach-compare-use-next" type="button">带入右侧标签页</button>
          <button class="semrush-coach-compare-submit" type="button">开始对比</button>
        </div>
      </div>
    </section>
  `;
  formToolsEl?.appendChild(toolsMenuWrapEl);
  if (!compareModalEl) {
    const compareModalHostEl = document.createElement("section");
    compareModalHostEl.className = "semrush-coach-compare-modal semrush-coach-hidden";
    compareModalHostEl.setAttribute("aria-hidden", "true");
    compareModalHostEl.innerHTML = `
      <div class="semrush-coach-compare-modal-backdrop"></div>
      <div class="semrush-coach-compare-modal-dialog">
        <div class="semrush-coach-compare-modal-header">
          <div>
            <p class="semrush-coach-card-title" style="margin:0;">分页对比</p>
            <p class="semrush-coach-compare-modal-subtitle">输入目标页，或一键带入当前标签页右边那个页面。</p>
          </div>
          <button class="semrush-coach-compare-modal-close" type="button" aria-label="关闭">×</button>
        </div>
        <label class="semrush-coach-compare-field">
          <span>目标页面链接</span>
          <input class="semrush-coach-compare-url" type="text" placeholder="https://example.com/page-b" />
        </label>
        <label class="semrush-coach-compare-field">
          <span>重点对比维度</span>
          <textarea class="semrush-coach-compare-focus" rows="3" placeholder="比如：信息架构、转化路径、文案 CTA"></textarea>
        </label>
        <div class="semrush-coach-compare-helper semrush-coach-hidden"></div>
        <div class="semrush-coach-compare-actions">
          <button class="semrush-coach-compare-use-next" type="button">使用右侧标签页</button>
          <button class="semrush-coach-compare-submit" type="button">开始对比</button>
        </div>
      </div>
    `;
    root.appendChild(compareModalHostEl);
    compareModalEl = compareModalHostEl;
    compareModalCloseEl = compareModalEl.querySelector(".semrush-coach-compare-modal-close");
    compareUrlInputEls = Array.from(compareModalEl.querySelectorAll(".semrush-coach-compare-url"));
    compareFocusInputEl = compareModalEl.querySelector(".semrush-coach-compare-focus");
    compareHelperEl = compareModalEl.querySelector(".semrush-coach-compare-helper");
    compareUseNextEl = compareModalEl.querySelector(".semrush-coach-compare-use-next");
    compareSubmitEl = compareModalEl.querySelector(".semrush-coach-compare-submit");
    compareModalEl.innerHTML = `
      <div class="semrush-coach-compare-modal-backdrop"></div>
      <div class="semrush-coach-compare-modal-dialog">
        <div class="semrush-coach-compare-modal-header">
          <div>
            <p class="semrush-coach-card-title" style="margin:0;">竞品对比</p>
            <p class="semrush-coach-compare-modal-subtitle">当前页已经算 1 个竞品，不用重复填写当前页链接。你再补充最多 3 个竞品链接，我来一起出分析报告。</p>
          </div>
          <button class="semrush-coach-compare-modal-close" type="button" aria-label="关闭">×</button>
        </div>
        <label class="semrush-coach-compare-field">
          <span>链接 1</span>
          <input class="semrush-coach-compare-url" type="text" placeholder="https://example.com/page-b" />
        </label>
        <label class="semrush-coach-compare-field">
          <span>链接 2</span>
          <input class="semrush-coach-compare-url" type="text" placeholder="https://example.com/page-c" />
        </label>
        <label class="semrush-coach-compare-field">
          <span>链接 3</span>
          <input class="semrush-coach-compare-url" type="text" placeholder="https://example.com/page-d" />
        </label>
        <label class="semrush-coach-compare-field">
          <span>重点看什么</span>
          <textarea class="semrush-coach-compare-focus" rows="3" placeholder="比如：信息架构、文案 CTA、转化路径"></textarea>
        </label>
        <div class="semrush-coach-compare-helper semrush-coach-hidden"></div>
        <div class="semrush-coach-compare-actions">
          <button class="semrush-coach-compare-use-next" type="button">带入右侧标签页</button>
          <button class="semrush-coach-compare-submit" type="button">开始对比</button>
        </div>
      </div>
    `;
    compareModalCloseEl = compareModalEl.querySelector(".semrush-coach-compare-modal-close");
    compareUrlInputEls = Array.from(compareModalEl.querySelectorAll(".semrush-coach-compare-url"));
    compareFocusInputEl = compareModalEl.querySelector(".semrush-coach-compare-focus");
    compareHelperEl = compareModalEl.querySelector(".semrush-coach-compare-helper");
    compareUseNextEl = compareModalEl.querySelector(".semrush-coach-compare-use-next");
    compareSubmitEl = compareModalEl.querySelector(".semrush-coach-compare-submit");
  }
  const toolsToggleButtonEl = toolsMenuWrapEl.querySelector(".semrush-coach-tools-toggle");
  const toolsMenuEl = toolsMenuWrapEl.querySelector(".semrush-coach-tools-menu");
  if (toolsMenuEl instanceof HTMLElement) {
    const comparePageItemEl = document.createElement("button");
    comparePageItemEl.className = "semrush-coach-tools-item";
    comparePageItemEl.type = "button";
    comparePageItemEl.setAttribute("data-tool", "compare-page");
    comparePageItemEl.textContent = "竞品对比";
    toolsMenuEl.insertBefore(comparePageItemEl, toolsMenuEl.children[1] || null);

    const longScreenshotItemEl = document.createElement("button");
    longScreenshotItemEl.className = "semrush-coach-tools-item";
    longScreenshotItemEl.type = "button";
    longScreenshotItemEl.setAttribute("data-tool", "long-screenshot");
    longScreenshotItemEl.textContent = "网页长截图";
    toolsMenuEl.insertBefore(longScreenshotItemEl, toolsMenuEl.children[2] || null);

    const qrCodeItemEl = document.createElement("button");
    qrCodeItemEl.className = "semrush-coach-tools-item";
    qrCodeItemEl.type = "button";
    qrCodeItemEl.setAttribute("data-tool", "page-qr");
    qrCodeItemEl.textContent = "网页二维码";
    toolsMenuEl.insertBefore(qrCodeItemEl, toolsMenuEl.children[3] || null);
    const projectAssessmentItemEl = document.createElement("button");
    projectAssessmentItemEl.className = "semrush-coach-tools-item";
    projectAssessmentItemEl.type = "button";
    projectAssessmentItemEl.setAttribute("data-tool", "project-assessment");
    projectAssessmentItemEl.textContent = "项目评估";
    toolsMenuEl.insertBefore(projectAssessmentItemEl, toolsMenuEl.children[4] || null);

  }
  toolsMenuEl?.querySelector('[data-tool="selection-analysis"]')?.remove();
  toolsMenuEl?.querySelector('[data-tool="extract-ui"]')?.remove();
  toolsMenuEl?.querySelector('[data-tool="markdown"]')?.remove();
  toolsMenuEl?.querySelector('[data-tool="page-qr"]')?.remove();
  const toolMenuOrder = [
    "project-assessment",
    "compare-page",
    "generate-prd",
    "long-screenshot"
  ];
  if (toolsMenuEl instanceof HTMLElement) {
    const orderedItems = toolMenuOrder
      .map((tool) => toolsMenuEl.querySelector(`.semrush-coach-tools-item[data-tool="${tool}"]`))
      .filter((item) => item instanceof HTMLElement);
    orderedItems.forEach((item) => toolsMenuEl.appendChild(item));
  }
  const toolsMenuItems = Array.from(toolsMenuEl?.querySelectorAll(".semrush-coach-tools-item") || []);
  const compareReportModalEl = document.createElement("section");
  compareReportModalEl.className = "semrush-coach-compare-report-modal semrush-coach-hidden";
  compareReportModalEl.setAttribute("aria-hidden", "true");
  compareReportModalEl.innerHTML = `
    <div class="semrush-coach-compare-report-modal-backdrop"></div>
    <div class="semrush-coach-compare-report-modal-dialog">
      <div class="semrush-coach-compare-report-modal-header">
        <div>
          <p class="semrush-coach-card-title" style="margin:0;">竞品分析报告</p>
          <p class="semrush-coach-compare-report-modal-subtitle">长内容放到全屏里看，会轻松很多。</p>
        </div>
        <div class="semrush-coach-compare-report-modal-actions">
          <button class="semrush-coach-compare-report-export" data-export="pdf" type="button">导出 PDF</button>
          <button class="semrush-coach-compare-report-export" data-export="word" type="button">导出 Word</button>
          <button class="semrush-coach-compare-report-modal-close" type="button" aria-label="关闭">×</button>
        </div>
      </div>
      <div class="semrush-coach-compare-report-modal-body"></div>
    </div>
  `;
  root.appendChild(compareReportModalEl);
  
  const assessmentReportModalEl = document.createElement("section");
  assessmentReportModalEl.className = "semrush-coach-assessment-report-modal semrush-coach-hidden";
  assessmentReportModalEl.setAttribute("aria-hidden", "true");
  assessmentReportModalEl.innerHTML = `
    <div class="semrush-coach-assessment-report-modal-backdrop"></div>
    <div class="semrush-coach-assessment-report-modal-dialog">
      <div class="semrush-coach-assessment-report-modal-header">
        <div>
          <p class="semrush-coach-card-title semrush-coach-assessment-report-modal-title" style="margin:0;">项目评估报告</p>
        </div>
        <div class="semrush-coach-assessment-report-modal-actions">
          <button class="semrush-coach-assessment-report-export" data-export="word" type="button">导出 Word</button>
          <button class="semrush-coach-assessment-report-modal-close" type="button" aria-label="关闭">×</button>
        </div>
      </div>
      <div class="semrush-coach-assessment-report-modal-body"></div>
    </div>
  `;
  root.appendChild(assessmentReportModalEl);
  const assessmentReportModalBodyEl = assessmentReportModalEl.querySelector(".semrush-coach-assessment-report-modal-body");
  const assessmentReportModalCloseEl = assessmentReportModalEl.querySelector(".semrush-coach-assessment-report-modal-close");
  const assessmentReportExportButtons = Array.from(assessmentReportModalEl.querySelectorAll(".semrush-coach-assessment-report-export"));
  let activeAssessmentReportPayload = "";
  let activeAssessmentReportTitle = "";

const compareReportModalBodyEl = compareReportModalEl.querySelector(".semrush-coach-compare-report-modal-body");
  const compareReportModalCloseEl = compareReportModalEl.querySelector(".semrush-coach-compare-report-modal-close");
  const compareReportExportButtons = Array.from(compareReportModalEl.querySelectorAll(".semrush-coach-compare-report-export"));
  let activeCompareReportPayload = null;
  if (generateSummaryButtonEl) {
    generateSummaryButtonEl.textContent = "总结";
  }
  toolsMenuItems.forEach((item) => {
    const tool = item.getAttribute("data-tool");
    if (tool === "selection-analysis") {
      item.textContent = "框选分析";
    } else if (tool === "long-screenshot") {
      item.textContent = "网页长截图";
    } else if (tool === "page-qr") {
      item.textContent = "网页二维码";
    } else if (tool === "markdown") {
      item.textContent = "转 Markdown";
    } else if (tool === "extract-ui") {
      item.textContent = "提取UI规范";
    } else if (tool === "generate-prd") {
      item.textContent = "网页转PRD";
    } else if (tool === "project-assessment") {
      item.textContent = "项目评估";
    }
  });
  
  const providerSelectEl = root.querySelector(".semrush-coach-setting-provider");
  const modelSelectEl = root.querySelector(".semrush-coach-setting-model-select");

  const settingsFormEls = {
    trialApiUrl: root.querySelector(".semrush-coach-setting-trial-api-url"),
    apiUrl: root.querySelector(".semrush-coach-setting-api-url"),
    modelInput: root.querySelector(".semrush-coach-setting-model-input"),
    apiKey: root.querySelector(".semrush-coach-setting-api-key"),
    allowedHosts: root.querySelector(".semrush-coach-setting-hosts"),
    aiTimelineEnabled: root.querySelector(".semrush-coach-setting-ai-timeline")
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

  const AI_TIMELINE_SITE_CONFIG = [
    {
      id: "chatgpt",
      hosts: ["chatgpt.com", "chat.openai.com"],
      messageSelectors: ['div[data-message-author-role="user"]', '[data-testid^="conversation-turn-"] [data-message-author-role="user"]'],
      textSelectors: [".whitespace-pre-wrap", "[dir='auto']"],
      minBubbleWidth: 48,
      timelineRightOffset: 72
    },
    {
      id: "gemini",
      hosts: ["gemini.google.com"],
      messageSelectors: [
        "user-query",
        ".user-query",
        ".user-query-container .user-query-container .user-query-container",
        "[data-test-id='user-query']",
        "[data-testid='user-query']"
      ],
      textSelectors: [".query-text", ".query-text-line", ".user-query-bubble-with-background", "[dir='auto']"],
      minBubbleWidth: 48
    }
  ];

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

  function getAiTimelineSiteConfig() {
    const hostname = getCurrentHostname();
    return (
      AI_TIMELINE_SITE_CONFIG.find((site) =>
        site.hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))
      ) || null
    );
  }

  function truncateTimelinePreview(text, maxLength = 120) {
    const normalized = String(text || "").replace(/\s+/g, " ").trim();
    if (normalized.length <= maxLength) {
      return normalized;
    }
    return `${normalized.slice(0, maxLength - 1).trim()}…`;
  }

  function normalizeTimelineText(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .replace(/^(你说|你问|你提问了|you said|you asked)\s*[:：]?\s*/i, "")
      .trim();
  }

  function extractTimelineNodeText(node, siteConfig = null) {
    if (!(node instanceof HTMLElement)) {
      return "";
    }

    const preferredSelectors = [
      ...(Array.isArray(siteConfig?.textSelectors) ? siteConfig.textSelectors : []),
      ".query-text",
      ".query-text-line",
      ".user-query-bubble-with-background",
      ".whitespace-pre-wrap",
      "[dir='auto']"
    ];

    for (const selector of preferredSelectors) {
      const match = node.querySelector(selector);
      const text = normalizeTimelineText(String(match?.innerText || match?.textContent || ""));
      if (text) {
        return text;
      }
    }

    return normalizeTimelineText(String(node.innerText || node.textContent || ""));
  }

  function collectAiTimelineItems() {
    const siteConfig = getAiTimelineSiteConfig();
    if (!siteConfig) {
      return [];
    }

    const mainRoot =
      document.querySelector("main") ||
      document.querySelector("[role='main']") ||
      document.body;
    const visited = new Set();

    const nodes = Array.from(
      document.querySelectorAll(siteConfig.messageSelectors.join(","))
    ).filter((node) => node instanceof HTMLElement);

    const candidates = nodes
      .map((node) => {
        const rawElement = node instanceof HTMLElement ? node : null;
        const element = getTimelineBubbleContainer(rawElement, mainRoot);
        if (!element || !element.isConnected) {
          return null;
        }

        if (visited.has(element)) {
          return null;
        }
        visited.add(element);

        const rect = element.getBoundingClientRect();
        const minBubbleWidth = Number(siteConfig.minBubbleWidth) || 48;
        if (rect.width < minBubbleWidth || rect.height < 20) {
          return null;
        }

        const text = extractTimelineNodeText(element, siteConfig);
        if (!text) {
          return null;
        }

        const top = Math.round(rect.top + window.scrollY);
        const centerY = top + rect.height / 2;

        return {
          element,
          text,
          preview: truncateTimelinePreview(text),
          keyword: "",
          markerKey: getAiTimelineMarkerKey(text, top),
          top,
          centerY,
          height: Math.round(rect.height)
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.top - b.top);

    const items = [];
    for (const candidate of candidates) {
      const previous = items[items.length - 1];
      if (
        previous &&
        previous.text === candidate.text &&
        Math.abs(previous.top - candidate.top) <= Math.max(48, Math.max(previous.height, candidate.height))
      ) {
        continue;
      }
      items.push(candidate);
    }

    if (!items.length && siteConfig.useRightBubbleFallback) {
      return collectAiTimelineItemsByRightBubble(siteConfig);
    }

    return items;
  }

  function isTransparentColor(color) {
    const normalized = String(color || "").trim().toLowerCase();
    return !normalized || normalized === "transparent" || normalized === "rgba(0, 0, 0, 0)";
  }

  function getTimelineBubbleContainer(element, root) {
    let current = element instanceof HTMLElement ? element : null;
    let bestMatch = null;
    let bestScore = -1;
    let depth = 0;

    while (current && current !== root && depth < 5) {
      const rect = current.getBoundingClientRect();
      const style = window.getComputedStyle(current);
      const backgroundColor = style.backgroundColor;
      const borderRadius = Number.parseFloat(style.borderTopLeftRadius || "0");
      const rightAligned =
        rect.right > window.innerWidth * 0.7 ||
        style.justifyContent === "flex-end" ||
        style.alignItems === "flex-end" ||
        style.alignSelf === "flex-end" ||
        style.textAlign === "right" ||
        style.marginLeft === "auto";

      let score = 0;
      if (!isTransparentColor(backgroundColor)) {
        score += 2;
      }
      if (borderRadius >= 12) {
        score += 1;
      }
      if (rightAligned) {
        score += 2;
      }
      if (rect.width >= 36 && rect.height >= 20) {
        score += 1;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = current;
      }

      current = current.parentElement;
      depth += 1;
    }

    return bestScore >= 3 ? bestMatch : element;
  }

  function collectAiTimelineItemsByRightBubble(siteConfig) {
    const mainRoot =
      document.querySelector("main") ||
      document.querySelector("[role='main']") ||
      document.body;

    const selectorList = Array.isArray(siteConfig.fallbackSelectors) && siteConfig.fallbackSelectors.length
      ? siteConfig.fallbackSelectors.join(",")
      : "div, article, section, p, span";
    const visited = new Set();

    const candidates = Array.from(
      mainRoot.querySelectorAll(selectorList)
    )
      .filter((node) => node instanceof HTMLElement)
      .map((node) => {
        const rawElement = node instanceof HTMLElement ? node : null;
        const element = getTimelineBubbleContainer(rawElement, mainRoot);
        if (!element || !element.isConnected) {
          return null;
        }

        if (visited.has(element)) {
          return null;
        }
        visited.add(element);

        const rect = element.getBoundingClientRect();
        if (rect.width < (Number(siteConfig.minBubbleWidth) || 36) || rect.height < 20) {
          return null;
        }

        const centerX = rect.left + rect.width / 2;
        const rightEdge = rect.right;
        if (centerX < window.innerWidth * 0.55 && rightEdge < window.innerWidth * 0.72) {
          return null;
        }

        const style = window.getComputedStyle(element);
        const backgroundColor = style.backgroundColor;
        const borderRadius = Number.parseFloat(style.borderTopLeftRadius || "0");
        const hasRightAlignedStyle =
          style.justifyContent === "flex-end" ||
          style.alignItems === "flex-end" ||
          style.alignSelf === "flex-end" ||
          style.textAlign === "right" ||
          style.marginLeft === "auto";
        if (isTransparentColor(backgroundColor) && borderRadius < 12 && !hasRightAlignedStyle) {
          return null;
        }

        const text = extractTimelineNodeText(element, siteConfig);
        if (!text || text.length > 160) {
          return null;
        }

        const top = Math.round(rect.top + window.scrollY);
        const centerY = top + rect.height / 2;

        return {
          element,
          text,
          preview: truncateTimelinePreview(text),
          keyword: "",
          markerKey: getAiTimelineMarkerKey(text, top),
          top,
          centerY,
          height: Math.round(rect.height)
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.top - b.top);

    const items = [];
    for (const candidate of candidates) {
      const previous = items[items.length - 1];
      if (
        previous &&
        (
          (
            normalizeTimelineText(previous.text).toLowerCase() === normalizeTimelineText(candidate.text).toLowerCase() &&
            Math.abs(previous.top - candidate.top) <= Math.max(56, Math.max(previous.height, candidate.height))
          ) ||
          (
            previous.element instanceof HTMLElement &&
            candidate.element instanceof HTMLElement &&
            (
              previous.element.contains(candidate.element) ||
              candidate.element.contains(previous.element)
            )
          )
        )
      ) {
        continue;
      }
      items.push(candidate);
    }

    return items;
  }

  function getTimelineKeywordCacheKey(text) {
    return normalizeTimelineText(text).toLowerCase();
  }

  function getAiTimelineMarkerKey(text, top) {
    const pathKey = `${window.location.origin}${window.location.pathname}`;
    const textKey = normalizeTimelineText(text).toLowerCase();
    const topBucket = Math.round(Number(top) / 24);
    return `${pathKey}::${topBucket}::${textKey}`;
  }

  function isAiTimelineMarked(item) {
    return Boolean(item?.markerKey && state.aiTimeline.markedKeys.has(item.markerKey));
  }

  function toggleAiTimelineMarked(index) {
    const item = state.aiTimeline.items?.[index];
    if (!item?.markerKey) {
      return false;
    }

    if (state.aiTimeline.markedKeys.has(item.markerKey)) {
      state.aiTimeline.markedKeys.delete(item.markerKey);
      return false;
    }

    state.aiTimeline.markedKeys.add(item.markerKey);
    return true;
  }

  function applyTimelineKeywords(items) {
    return items.map((item) => {
      const cacheKey = getTimelineKeywordCacheKey(item.text);
      return {
        ...item,
        keyword: state.aiTimeline.keywordCache[cacheKey] || ""
      };
    });
  }

  async function requestAiTimelineKeyword(item) {
    if (
      !item?.text ||
      state.aiTimeline.runtimeUnavailable ||
      !hasUserApiAccess() ||
      !globalThis.chrome?.runtime?.id ||
      typeof globalThis.chrome?.runtime?.sendMessage !== "function"
    ) {
      return;
    }

    const cacheKey = getTimelineKeywordCacheKey(item.text);
    if (!cacheKey || state.aiTimeline.keywordCache[cacheKey] || state.aiTimeline.keywordRequests.has(cacheKey)) {
      return;
    }

    state.aiTimeline.keywordRequests.add(cacheKey);

    try {
      const response = await chrome.runtime.sendMessage({
        type: "SEMRUSH_COACH_TIMELINE_KEYWORD",
        payload: {
          question: item.text
        }
      });

      if (!response?.ok) {
        return;
      }

      const keyword = normalizeTimelineText(String(response.data?.keyword || "")).slice(0, 10);
      if (!keyword) {
        return;
      }

      state.aiTimeline.keywordCache[cacheKey] = keyword;
      state.aiTimeline.items = state.aiTimeline.items.map((currentItem) => {
        if (getTimelineKeywordCacheKey(currentItem.text) !== cacheKey) {
          return currentItem;
        }
        return {
          ...currentItem,
          keyword
        };
      });
      renderAiConversationTimelineEnhanced(true);
    } catch (error) {
      if (isExtensionContextInvalidError(error)) {
        state.aiTimeline.runtimeUnavailable = true;
        state.aiTimeline.keywordRequests.clear();
        return;
      }
      console.warn("[AI Coach] 时间轴关键词生成失败", error);
    } finally {
      state.aiTimeline.keywordRequests.delete(cacheKey);
    }
  }

  function hydrateAiTimelineKeywords(items) {
    if (!hasUserApiAccess() || state.aiTimeline.runtimeUnavailable) {
      return items;
    }

    const hydratedItems = applyTimelineKeywords(items);
    const nextPendingItem = hydratedItems.find((item) => item.text && !item.keyword);
    if (nextPendingItem) {
      requestAiTimelineKeyword(nextPendingItem);
    }
    return hydratedItems;
  }

  function hideAiTimelinePreview() {
    if (!(aiTimelinePreviewEl instanceof HTMLElement)) {
      return;
    }
    aiTimelinePreviewEl.classList.add("semrush-coach-hidden");
    aiTimelinePreviewEl.textContent = "";
  }

  function showAiTimelinePreview(text, anchorEl = null) {
    if (!(aiTimelinePreviewEl instanceof HTMLElement) || !text) {
      return;
    }
    aiTimelinePreviewEl.textContent = text;
    if (anchorEl instanceof HTMLElement && aiTimelineEl instanceof HTMLElement) {
      const timelineRect = aiTimelineEl.getBoundingClientRect();
      const anchorRect = anchorEl.getBoundingClientRect();
      const offsetTop = Math.max(8, Math.min(timelineRect.height - 120, anchorRect.top - timelineRect.top - 40));
      aiTimelinePreviewEl.style.top = `${offsetTop}px`;
    } else {
      aiTimelinePreviewEl.style.top = "8px";
    }
    aiTimelinePreviewEl.classList.remove("semrush-coach-hidden");
  }

  function setAiTimelineActiveIndex(index, lockMs = 0) {
    state.aiTimeline.activeIndex = Number.isFinite(index) ? index : -1;
    state.aiTimeline.activeLockUntil = lockMs > 0 ? Date.now() + lockMs : 0;
  }

  function updateAiTimelineActiveState() {
    if (!(aiTimelineItemsEl instanceof HTMLElement)) {
      return;
    }

    const items = state.aiTimeline.items || [];
    if (!items.length) {
      return;
    }

    const now = Date.now();
    let bestIndex =
      state.aiTimeline.activeIndex >= 0 &&
      state.aiTimeline.activeIndex < items.length &&
      state.aiTimeline.activeLockUntil > now
        ? state.aiTimeline.activeIndex
        : -1;

    if (bestIndex < 0) {
      if (state.aiTimeline.activeLockUntil <= now) {
        state.aiTimeline.activeLockUntil = 0;
      }
      if (state.aiTimeline.activeIndex >= items.length) {
        state.aiTimeline.activeIndex = -1;
      }

      const viewportAnchor = window.innerHeight * 0.35;
      let bestDistance = Number.POSITIVE_INFINITY;

      bestIndex = 0;
      items.forEach((item, index) => {
        const rect = item.element?.getBoundingClientRect?.();
        if (!rect) {
          return;
        }
        const center = rect.top + rect.height / 2;
        const distance = Math.abs(center - viewportAnchor);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
        }
      });
      state.aiTimeline.activeIndex = bestIndex;
    }

    aiTimelineItemsEl.querySelectorAll(".semrush-coach-ai-timeline-dot").forEach((dot, index) => {
      dot.classList.toggle("is-active", index === bestIndex);
      dot.closest(".semrush-coach-ai-timeline-item")?.classList.toggle("is-active", index === bestIndex);
    });
  }

  function renderAiConversationTimeline(force = false) {
    const shouldShow = Boolean(
      state.settings.aiTimelineEnabled &&
        getAiTimelineSiteConfig() &&
        !state.open
    );

    if (!(aiTimelineEl instanceof HTMLElement) || !(aiTimelineItemsEl instanceof HTMLElement)) {
      return;
    }

    if (!shouldShow) {
      aiTimelineEl.classList.add("semrush-coach-hidden");
      hideAiTimelinePreview();
      state.aiTimeline.signature = "";
      state.aiTimeline.items = [];
      return;
    }

    const items = collectAiTimelineItems();
    const signature = items.map((item) => `${item.top}:${item.text.slice(0, 60)}`).join("|");

    if (!force && signature === state.aiTimeline.signature) {
      aiTimelineEl.classList.toggle("semrush-coach-hidden", !items.length);
      updateAiTimelineActiveState();
      return;
    }

    state.aiTimeline.signature = signature;
    state.aiTimeline.items = items;
    aiTimelineEl.classList.toggle("semrush-coach-hidden", !items.length);
    hideAiTimelinePreview();

    aiTimelineItemsEl.innerHTML = items
      .map((item, index) => {
        const topPercent = items.length <= 1 ? 0 : (index / (items.length - 1)) * 100;
        return `
          <button
            class="semrush-coach-ai-timeline-dot"
            type="button"
            style="top:${topPercent}%;"
            data-index="${index}"
            aria-label="跳转到第 ${index + 1} 次提问"
          ></button>
        `;
      })
      .join("");

    updateAiTimelineActiveState();
  }

  function queueAiTimelineRefresh(force = false) {
    if (state.aiTimeline.refreshQueued) {
      return;
    }
    state.aiTimeline.refreshQueued = true;
    window.requestAnimationFrame(() => {
      state.aiTimeline.refreshQueued = false;
      renderAiConversationTimelineEnhanced(force);
    });
  }

  function observeAiTimelineMutations() {
    const observerRoot =
      document.querySelector("main") ||
      document.querySelector("[role='main']") ||
      document.body;

    if (!(observerRoot instanceof HTMLElement)) {
      return null;
    }

    let refreshTimer = null;
    const observer = new MutationObserver(() => {
      if (refreshTimer) {
        window.clearTimeout(refreshTimer);
      }
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        queueAiTimelineRefresh(true);
      }, 180);
    });

    observer.observe(observerRoot, {
      childList: true,
      subtree: true,
      characterData: true
    });

    return observer;
  }

  function getAiTimelineEventTarget(target) {
    if (!(target instanceof HTMLElement)) {
      return null;
    }

    const interactive = target.closest(".semrush-coach-ai-timeline-dot, .semrush-coach-ai-timeline-keyword, .semrush-coach-ai-timeline-item");
    if (!(interactive instanceof HTMLElement)) {
      return null;
    }

    const index = Number(
      interactive.getAttribute("data-index") ||
      interactive.closest(".semrush-coach-ai-timeline-item")?.getAttribute("data-index")
    );

    if (!Number.isFinite(index) || index < 0) {
      return null;
    }

    const item = state.aiTimeline.items[index];
    if (!item) {
      return null;
    }

    return {
      index,
      item,
      anchorEl: interactive.classList.contains("semrush-coach-ai-timeline-item")
        ? interactive.querySelector(".semrush-coach-ai-timeline-dot") || interactive
        : interactive
    };
  }

  function getAiTimelineItemPercent(item, index, items) {
    if (!item) {
      return 0;
    }

    const centers = items
      .map((entry) => Number(entry.centerY))
      .filter((value) => Number.isFinite(value));

    if (centers.length <= 1) {
      return 0;
    }

    const minCenter = Math.min(...centers);
    const maxCenter = Math.max(...centers);
    const currentCenter = Number.isFinite(item.centerY)
      ? item.centerY
      : item.top + item.height / 2;

    if (maxCenter - minCenter < 24) {
      return items.length <= 1 ? 0 : (index / (items.length - 1)) * 100;
    }

    const percent = ((currentCenter - minCenter) / (maxCenter - minCenter)) * 100;
    return Math.max(0, Math.min(100, percent));
  }

  function buildAiTimelineLayout(items) {
    const timelineRect = aiTimelineItemsEl?.getBoundingClientRect?.();
    const timelineHeight = Math.max(320, Math.round(timelineRect?.height || aiTimelineEl?.getBoundingClientRect?.().height || 420));
    const minGapPx = 56;
    const edgePaddingPx = 24;

    const dotPercents = items.map((item, index) => getAiTimelineItemPercent(item, index, items));
    const dotPositions = dotPercents.map((percent) => (percent / 100) * timelineHeight);
    const labelPositions = dotPositions.map((value) =>
      Math.max(edgePaddingPx, Math.min(timelineHeight - edgePaddingPx, value))
    );

    for (let index = 1; index < labelPositions.length; index += 1) {
      labelPositions[index] = Math.max(labelPositions[index], labelPositions[index - 1] + minGapPx);
    }

    const overflow = labelPositions[labelPositions.length - 1] - (timelineHeight - edgePaddingPx);
    if (overflow > 0) {
      for (let index = 0; index < labelPositions.length; index += 1) {
        labelPositions[index] -= overflow;
      }
    }

    for (let index = labelPositions.length - 2; index >= 0; index -= 1) {
      labelPositions[index] = Math.min(labelPositions[index], labelPositions[index + 1] - minGapPx);
    }

    for (let index = 0; index < labelPositions.length; index += 1) {
      labelPositions[index] = Math.max(edgePaddingPx, Math.min(timelineHeight - edgePaddingPx, labelPositions[index]));
    }

    return items.map((item, index) => {
      const labelTopPercent = (labelPositions[index] / timelineHeight) * 100;
      const dotTopPercent = labelTopPercent;
      const showKeyword = Boolean(item.keyword);
      const side = index % 2 === 0 ? "left" : "right";

      return {
        item,
        index,
        dotTopPercent,
        labelTopPercent,
        showKeyword,
        side
      };
    });
  }

  function renderAiConversationTimelineEnhanced(force = false) {
    cleanupDuplicatePageCoachNodes();

    const siteConfig = getAiTimelineSiteConfig();
    if (globalThis.chrome?.runtime?.id) {
      state.aiTimeline.runtimeUnavailable = false;
    }
    const shouldShow = Boolean(
      state.settings.aiTimelineEnabled &&
        siteConfig &&
        !state.open
    );

    if (!(aiTimelineEl instanceof HTMLElement) || !(aiTimelineItemsEl instanceof HTMLElement)) {
      return;
    }

    const rightOffset = Number(siteConfig?.timelineRightOffset);
    aiTimelineEl.style.setProperty(
      "--semrush-coach-ai-timeline-right",
      `${Number.isFinite(rightOffset) ? rightOffset : 14}px`
    );

    if (!shouldShow) {
      aiTimelineEl.classList.add("semrush-coach-hidden");
      hideAiTimelinePreview();
      state.aiTimeline.signature = "";
      state.aiTimeline.items = [];
      return;
    }

    const items = hydrateAiTimelineKeywords(collectAiTimelineItems());
    const signature = items.map((item) => `${item.top}:${item.text.slice(0, 60)}`).join("|");

    if (!force && signature === state.aiTimeline.signature) {
      aiTimelineEl.classList.toggle("semrush-coach-hidden", !items.length);
      updateAiTimelineActiveState();
      return;
    }

    state.aiTimeline.signature = signature;
    state.aiTimeline.items = items;
    aiTimelineEl.classList.toggle("semrush-coach-hidden", !items.length);
    hideAiTimelinePreview();

    const layoutItems = buildAiTimelineLayout(items);

    aiTimelineItemsEl.innerHTML = layoutItems
      .map(({ item, index, dotTopPercent, labelTopPercent, showKeyword, side }) => {
        const ariaLabel = item.keyword
          ? `跳转到第 ${index + 1} 次提问：${item.keyword}`
          : `跳转到第 ${index + 1} 次提问`;
        const markedClass = isAiTimelineMarked(item) ? " is-marked" : "";
        const keywordHtml = showKeyword
          ? `<button class="semrush-coach-ai-timeline-keyword semrush-coach-ai-timeline-keyword-${side}${markedClass}" type="button" data-index="${index}" aria-label="${escapeAttribute(ariaLabel)}">${escapeHtml(item.keyword)}</button>`
          : "";
        return `
          <div class="semrush-coach-ai-timeline-item" style="--label-top:${labelTopPercent}%; --dot-top:${dotTopPercent}%;" data-index="${index}">
            ${keywordHtml}
            <button
              class="semrush-coach-ai-timeline-dot"
              type="button"
              data-index="${index}"
              aria-label="${escapeAttribute(ariaLabel)}"
            ></button>
          </div>
        `;
      })
      .join("");

    updateAiTimelineActiveState();
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
    return true; // 全局无感放行所有网站
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
      if (!historyEl) return;
      historyEl.scrollTop = historyEl.scrollHeight;
    });
  }

  function scrollHistoryToIndex(index, block = "start") {
    window.requestAnimationFrame(() => {
      const target = historyEl?.querySelector(`[data-history-index="${index}"]`);
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const offset = block === "end"
        ? target.offsetTop + target.offsetHeight - historyEl.clientHeight
        : target.offsetTop;
      historyEl.scrollTo({
        top: Math.max(0, offset - 8),
        behavior: "smooth"
      });
    });
  }

  function isToolTaskEntry(item) {
    if (!item || item.role !== "user") {
      return false;
    }
    const text = String(item.text || "");
    return TOOL_TASK_TRIGGERS.some((trigger) => text.startsWith(trigger));
  }

  function clearPreviousToolTask() {
    let previousTaskStartIndex = -1;
    for (let index = state.history.length - 1; index >= 0; index -= 1) {
      if (isToolTaskEntry(state.history[index])) {
        previousTaskStartIndex = index;
        break;
      }
    }
    if (previousTaskStartIndex >= 0) {
      state.history = state.history.slice(0, previousTaskStartIndex);
    }
  }

  function startToolTaskMessage(text) {
    clearPreviousToolTask();
    state.history.push({
      role: "user",
      text
    });
    renderHistory();
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

  function renderInlineMarkdown(text) {
    const cleaned = String(text || "")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1")
      .replace(/(```|`|\*\*|__|\*|~~|_)/g, "")
      .replace(/\n+/g, " ")
      .trim();
    return escapeHtml(cleaned);
  }

  function buildQrCodeImageUrl(text, size = 320) {
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=16&data=${encodeURIComponent(String(text || ""))}`;
  }

  function buildPageQrFilename() {
    const safeBase = String(document.title || "网页二维码")
      .trim()
      .replace(/[\\/:*?"<>|]/g, "-")
      .replace(/\s+/g, " ")
      .slice(0, 48) || "网页二维码";
    return `${safeBase}-二维码.png`;
  }

  function renderQrCodeCard(item) {
    const qrImageUrl = escapeAttribute(item.qrImageUrl || "");
    const qrTargetUrl = String(item.qrTargetUrl || "");
    const qrFilename = escapeAttribute(item.qrFilename || "网页二维码.png");
    const safeUrl = escapeHtml(qrTargetUrl);
    const encodedUrl = escapeAttribute(qrTargetUrl);

    return `
      <div class="semrush-coach-qr-card">
        <div class="semrush-coach-qr-preview-wrap">
          <img class="semrush-coach-qr-preview" src="${qrImageUrl}" alt="当前网页二维码" loading="lazy" referrerpolicy="no-referrer" />
        </div>
        <div class="semrush-coach-qr-meta">
          <p class="semrush-coach-qr-caption">手机扫一扫就能打开当前网页</p>
          <div class="semrush-coach-qr-url">${safeUrl}</div>
        </div>
        <div class="semrush-coach-qr-actions">
          <button class="semrush-coach-qr-action" type="button" data-qr-action="copy-link" data-url="${encodedUrl}">复制链接</button>
          <button class="semrush-coach-qr-action" type="button" data-qr-action="download" data-url="${escapeAttribute(item.qrImageUrl || "")}" data-filename="${qrFilename}">下载二维码</button>
        </div>
      </div>
    `;
  }

  function renderMarkdownTable(lines) {
    const rows = lines
      .map((line) => String(line || "").trim())
      .filter(Boolean)
      .map((line) => line.replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim()));

    if (!rows.length) {
      return "";
    }

    const header = rows[0];
    const bodyRows = rows.slice(1).filter((row) => !row.every((cell) => /^:?-{3,}:?$/.test(cell)));
    return `
      <div class="semrush-coach-rich-table-wrap">
        <table class="semrush-coach-rich-table">
          <thead>
            <tr>${header.map((cell) => `<th>${renderInlineMarkdown(cell)}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${bodyRows
              .map((row) => `<tr>${row.map((cell) => `<td>${renderInlineMarkdown(cell)}</td>`).join("")}</tr>`)
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderMarkdownContent(source) {
    const lines = String(source || "").replace(/\r\n?/g, "\n").split("\n");
    const html = [];
    let index = 0;

    while (index < lines.length) {
      const rawLine = lines[index];
      const line = rawLine.trim();

      if (!line) {
        index += 1;
        continue;
      }

      if (/^```/.test(line)) {
        const codeLines = [];
        index += 1;
        while (index < lines.length && !/^```/.test(lines[index].trim())) {
          codeLines.push(lines[index]);
          index += 1;
        }
        if (index < lines.length) {
          index += 1;
        }
        html.push(`<pre class="semrush-coach-code-block"><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        continue;
      }

      if (line.includes("|")) {
        const tableLines = [];
        let probe = index;
        while (probe < lines.length && lines[probe].trim().includes("|")) {
          tableLines.push(lines[probe]);
          probe += 1;
        }
        if (
          tableLines.length >= 2 &&
          (
            /^\|?[\s:-|]+\|?\s*$/.test(tableLines[1].trim()) ||
            tableLines.every((entry) => entry.replace(/^\||\|$/g, "").split("|").length >= 2)
          )
        ) {
          html.push(renderMarkdownTable(tableLines));
          index = probe;
          continue;
        }
      }

      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        const level = Math.min(4, headingMatch[1].length);
        html.push(`<h${level + 1} class="semrush-coach-rich-heading semrush-coach-rich-heading-${level}">${renderInlineMarkdown(headingMatch[2])}</h${level + 1}>`);
        index += 1;
        continue;
      }

      if (/^>\s?/.test(line)) {
        const quoteLines = [];
        while (index < lines.length && /^>\s?/.test(lines[index].trim())) {
          quoteLines.push(lines[index].trim().replace(/^>\s?/, ""));
          index += 1;
        }
        html.push(`<blockquote class="semrush-coach-rich-quote">${quoteLines.map((part) => `<p>${renderInlineMarkdown(part)}</p>`).join("")}</blockquote>`);
        continue;
      }

      if (/^([-*+]\s+|\d+[.)]\s+)/.test(line)) {
        const ordered = /^\d+[.)]\s+/.test(line);
        const items = [];
        while (index < lines.length && /^([-*+]\s+|\d+[.)]\s+)/.test(lines[index].trim())) {
          items.push(lines[index].trim().replace(/^([-*+]\s+|\d+[.)]\s+)/, ""));
          index += 1;
        }
        html.push(
          `<${ordered ? "ol" : "ul"} class="semrush-coach-rich-list">${
            items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")
          }</${ordered ? "ol" : "ul"}>`
        );
        continue;
      }

      const paragraphLines = [];
      while (
        index < lines.length &&
        lines[index].trim() &&
        !/^```/.test(lines[index].trim()) &&
        !/^(#{1,6})\s+/.test(lines[index].trim()) &&
        !/^>\s?/.test(lines[index].trim()) &&
        !/^([-*+]\s+|\d+[.)]\s+)/.test(lines[index].trim())
      ) {
        paragraphLines.push(lines[index].trim());
        index += 1;
      }
      html.push(`<p>${renderInlineMarkdown(paragraphLines.join(" "))}</p>`);
    }

    return `<div class="semrush-coach-rich-content">${html.join("")}</div>`;
  }

  function renderPlainTextContent(source) {
    const parts = String(source || "")
      .replace(/\r\n?/g, "\n")
      .split(/\n{2,}/)
      .map((part) => part.trim())
      .filter(Boolean);

    if (!parts.length) {
      const single = String(source || "").trim();
      return single ? `<div class="semrush-coach-rich-content"><p>${escapeHtml(single)}</p></div>` : "";
    }

    return `
      <div class="semrush-coach-rich-content">
        ${parts.map((part) => `<p>${escapeHtml(part).replace(/\n/g, "<br />")}</p>`).join("")}
      </div>
    `;
  }

  function normalizeComparisonTables(tables) {
    if (!Array.isArray(tables)) {
      return [];
    }

    return tables
      .map((table) => {
        const columns = Array.isArray(table?.columns) ? table.columns.map((cell) => String(cell || "").trim()).filter(Boolean) : [];
        const rows = Array.isArray(table?.rows)
          ? table.rows
              .filter((row) => Array.isArray(row))
              .map((row) => row.map((cell) => String(cell || "").trim()))
              .filter((row) => row.some(Boolean))
          : [];

        if (!columns.length || !rows.length) {
          return null;
        }

        return {
          title: String(table?.title || "").trim(),
          columns,
          rows
        };
      })
      .filter(Boolean);
  }

  function renderComparisonTables(tables) {
    const safeTables = normalizeComparisonTables(tables);
    if (!safeTables.length) {
      return "";
    }

    return `
      <div class="semrush-coach-compare-report">
        ${safeTables
          .map(
            (table) => `
              <section class="semrush-coach-compare-block">
                ${table.title ? `<h4 class="semrush-coach-compare-title">${escapeHtml(table.title)}</h4>` : ""}
                <div class="semrush-coach-compare-table-wrap">
                  <table class="semrush-coach-compare-table">
                    <thead>
                      <tr>${table.columns.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("")}</tr>
                    </thead>
                    <tbody>
                      ${table.rows
                        .map((row) => {
                          const padded = [...row];
                          while (padded.length < table.columns.length) padded.push("");
                          return `<tr>${padded.slice(0, table.columns.length).map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`;
                        })
                        .join("")}
                    </tbody>
                  </table>
                </div>
              </section>
            `
          )
          .join("")}
      </div>
    `;
  }

  function renderComparisonReportBody(pageSummary, tables, answer) {
    return `
      <div class="semrush-coach-compare-report-full">
        ${pageSummary ? `<h3 class="semrush-coach-compare-report-heading">${escapeHtml(pageSummary)}</h3>` : ""}
        ${renderComparisonTables(tables)}
        ${renderPlainTextContent(answer || "")}
      </div>
    `;
  }

  function buildCompareReportFilename(pageSummary, extension) {
    const safeBase = String(pageSummary || "竞品分析报告")
      .trim()
      .replace(/[\\/:*?"<>|]/g, "-")
      .replace(/\s+/g, " ")
      .slice(0, 48) || "竞品分析报告";
    const now = new Date();
    const stamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0")
    ].join("");
    return `${safeBase}-${stamp}.${extension}`;
  }

  function buildComparisonExportDocument(payload = {}) {
    const pageSummary = escapeHtml(payload.pageSummary || "竞品分析报告");
    const reportBody = renderComparisonReportBody(
      payload.pageSummary || "竞品分析报告",
      payload.comparisonTables || [],
      payload.answer || ""
    );
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${pageSummary}</title>
  <style>
    body {
      margin: 0;
      background: #f5f1e8;
      color: #17211d;
      font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif;
    }
    .report-shell {
      max-width: 1100px;
      margin: 0 auto;
      padding: 36px 28px 48px;
    }
    .report-meta {
      margin-bottom: 18px;
      color: #68736d;
      font-size: 13px;
      line-height: 1.7;
    }
    .semrush-coach-compare-report-full,
    .semrush-coach-compare-report,
    .semrush-coach-compare-block {
      display: grid;
      gap: 18px;
    }
    .semrush-coach-compare-report-heading {
      margin: 0;
      font-size: 28px;
      line-height: 1.35;
      font-weight: 800;
      color: #17211d;
    }
    .semrush-coach-compare-title {
      margin: 0;
      font-size: 18px;
      line-height: 1.5;
      font-weight: 800;
      color: #17211d;
    }
    .semrush-coach-compare-table-wrap {
      overflow: hidden;
      border-radius: 16px;
      border: 1px solid rgba(64, 78, 72, 0.16);
      background: #fffdfa;
    }
    .semrush-coach-compare-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    .semrush-coach-compare-table th,
    .semrush-coach-compare-table td {
      border: 1px solid rgba(64, 78, 72, 0.16);
      padding: 12px 14px;
      text-align: left;
      vertical-align: top;
      font-size: 13px;
      line-height: 1.8;
      word-break: break-word;
      background: rgba(255, 255, 255, 0.94);
    }
    .semrush-coach-compare-table th {
      background: rgba(245, 242, 236, 0.96);
      font-weight: 800;
    }
    .semrush-coach-rich-content {
      display: grid;
      gap: 12px;
    }
    .semrush-coach-rich-content p {
      margin: 0;
      font-size: 14px;
      line-height: 1.9;
      color: #25302b;
    }
    @media print {
      body {
        background: #ffffff;
      }
      .report-shell {
        max-width: none;
        padding: 0;
      }
    }
  </style>
</head>
<body>
  <main class="report-shell">
    <div class="report-meta">由 AI Coach 生成的竞品分析报告</div>
    ${reportBody}
  </main>
</body>
</html>`;
  }

  function downloadBlob(blob, filename) {
    const link = document.createElement("a");
    const objectUrl = URL.createObjectURL(blob);
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }

  function exportCompareReportAsWord(payload) {
    if (!payload) {
      return;
    }
    const html = buildComparisonExportDocument(payload);
    const blob = new Blob([html], { type: "application/msword;charset=utf-8" });
    downloadBlob(blob, buildCompareReportFilename(payload.pageSummary, "doc"));
  }

  function exportCompareReportAsPdf(payload) {
    if (!payload) {
      return;
    }
    const html = buildComparisonExportDocument(payload);
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.setAttribute("aria-hidden", "true");
    const cleanup = () => {
      window.setTimeout(() => iframe.remove(), 1200);
    };
    iframe.onload = () => {
      const frameWindow = iframe.contentWindow;
      if (!frameWindow) {
        cleanup();
        return;
      }
      frameWindow.onafterprint = cleanup;
      frameWindow.focus();
      window.setTimeout(() => {
        try {
          frameWindow.print();
        } catch {
          cleanup();
        }
      }, 180);
    };
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument;
    if (!doc) {
      iframe.remove();
      throw new Error("当前环境暂时无法导出 PDF，请稍后再试。");
    }
    doc.open();
    doc.write(html);
    doc.close();
  }

  function parseMindmapLabel(line) {
    let trimmed = String(line || "")
      .trim()
      .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "");
    if (!trimmed) {
      return "";
    }

    if (/^root\b/i.test(trimmed)) {
      trimmed = trimmed.replace(/^root\s*/i, "").trim() || "主题";
    }

    const shapeMatch = trimmed.match(/^[a-z0-9_-]+\s*(.+)$/i);
    if (shapeMatch?.[1] && /^[([{]/.test(shapeMatch[1].trim())) {
      trimmed = shapeMatch[1].trim();
    }

    for (let i = 0; i < 3; i += 1) {
      const wrapped = trimmed.match(/^\(\((.+)\)\)$|^\((.+)\)$|^\[\[(.+)\]\]$|^\[(.+)\]$|^\{\{(.+)\}\}$/);
      const next = wrapped?.slice(1).find((value) => value);
      if (!next) {
        break;
      }
      trimmed = next.trim();
    }

    return trimmed
      .replace(/^[|丨│┆┊└├─—•·:：\-*#\s]+/, "")
      .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseFlowchartNodeLabel(raw) {
    const value = String(raw || "").trim();
    if (!value) {
      return "";
    }

    const labelMatch = value.match(/^[a-z0-9_-]+\s*(?:\[\[(.+?)\]\]|\[(.+?)\]|\(\((.+?)\)\)|\((.+?)\)|\{\{(.+?)\}\}|["'](.+?)["'])\s*$/i);
    const label = labelMatch?.slice(1).find((part) => part);
    if (label) {
      return parseMindmapLabel(label);
    }

    return parseMindmapLabel(value.replace(/^[a-z0-9_-]+\s*$/i, ""));
  }

  function parseFlowchartMindmap(source) {
    const lines = String(source || "")
      .replace(/```mermaid|```/gi, "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !/^(graph|flowchart)\b/i.test(line));

    const nodeLabels = new Map();
    const childIds = new Set();
    const adjacency = new Map();
    const nodeOrder = [];
    const edgePattern = /^([a-z0-9_-]+)(?:\s*(?:\[\[.+?\]\]|\[.+?\]|\(\(.+?\)\)|\(.+?\)|\{\{.+?\}\}|["'].+?["']))?\s*[-.=]+(?:->|>)\s*([a-z0-9_-]+(?:\s*(?:\[\[.+?\]\]|\[.+?\]|\(\(.+?\)\)|\(.+?\)|\{\{.+?\}\}|["'].+?["']))?)/i;

    const rememberNode = (id, rawLabel = "") => {
      if (!id) {
        return;
      }
      if (!nodeOrder.includes(id)) {
        nodeOrder.push(id);
      }
      const label = parseFlowchartNodeLabel(rawLabel);
      if (label) {
        nodeLabels.set(id, label);
      } else if (!nodeLabels.has(id)) {
        nodeLabels.set(id, id);
      }
    };

    lines.forEach((line) => {
      const cleaned = line.replace(/;$/, "");
      const edgeMatch = cleaned.match(edgePattern);
      if (!edgeMatch) {
        const nodeMatch = cleaned.match(/^([a-z0-9_-]+)\s*(.+)$/i);
        if (nodeMatch) {
          rememberNode(nodeMatch[1], cleaned);
        }
        return;
      }

      const fromId = edgeMatch[1];
      const toRaw = edgeMatch[2].trim();
      const toId = toRaw.match(/^([a-z0-9_-]+)/i)?.[1] || "";
      rememberNode(fromId);
      rememberNode(toId, toRaw);
      childIds.add(toId);
      if (!adjacency.has(fromId)) {
        adjacency.set(fromId, []);
      }
      adjacency.get(fromId).push(toId);
    });

    if (!nodeOrder.length) {
      return null;
    }

    const rootId = nodeOrder.find((id) => adjacency.has(id) && !childIds.has(id)) || nodeOrder[0];
    const rootLabel = nodeLabels.get(rootId) || "";
    const root = {
      label: rootLabel && rootLabel !== rootId ? rootLabel : "页面主题",
      children: []
    };
    const visited = new Set([rootId]);

    const buildChildren = (parentId, parentNode, depth = 0) => {
      if (depth >= 2) {
        return;
      }
      const children = adjacency.get(parentId) || [];
      children.slice(0, depth === 0 ? 6 : 4).forEach((childId) => {
        if (visited.has(childId)) {
          return;
        }
        visited.add(childId);
        const node = {
          label: nodeLabels.get(childId) || childId,
          children: []
        };
        parentNode.children.push(node);
        buildChildren(childId, node, depth + 1);
      });
    };

    buildChildren(rootId, root);
    for (const id of nodeOrder) {
      if (root.children.length >= 8) {
        break;
      }
      if (id === rootId || visited.has(id)) {
        continue;
      }
      const label = nodeLabels.get(id) || "";
      const node = {
        label: label && label !== id ? label : "关键要点",
        children: []
      };
      visited.add(id);
      buildChildren(id, node, 1);
      if (node.label !== "关键要点" || node.children.length) {
        root.children.push(node);
      }
    }

    return root;
  }

  function parseMindmapMermaid(source) {
    if (/^\s*(?:```\s*mermaid\s*)?(graph|flowchart)\b/im.test(String(source || ""))) {
      return parseFlowchartMindmap(source);
    }

    const lines = String(source || "")
      .replace(/```mermaid|```/gi, "")
      .split("\n")
      .map((line) => line.replace(/\t/g, "  "))
      .filter((line) => line.trim());

    let rootLineIndex = lines.findIndex((line) => /^root\b/i.test(line.trim()));
    if (rootLineIndex < 0) {
      rootLineIndex = lines.findIndex((line) => !/^mindmap$/i.test(line.trim()));
    }
    if (rootLineIndex < 0) {
      return null;
    }

    const rootIndent = lines[rootLineIndex].match(/^ */)?.[0].length || 0;
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

      const indent = rawLine.match(/^ */)?.[0].length || 0;
      const depth = Math.max(0, Math.floor((indent - rootIndent) / 2) - 1);
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
    const siblingGap = 42;
    const horizontalGap = 248;
    const rootGap = 156;
    const padding = 68;

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
      node.width = Math.max(depth === 0 ? 292 : 154, Math.min(depth === 0 ? 432 : 270, 48 + maxUnits * (depth === 0 ? 14.8 : 13.4)));
      node.height = Math.max(depth === 0 ? 82 : 56, 24 + node.lines.length * (depth === 0 ? 23 : 19));

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
      width: Math.max(960, maxX - minX),
      height: Math.max(520, maxY - minY),
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
            <feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#d9e0dd" flood-opacity="0.22"/>
          </filter>
          <linearGradient id="semrushMindmapRootFill" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#0d6a5a"/>
            <stop offset="100%" stop-color="#15584d"/>
          </linearGradient>
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
              <path d="M ${startX} ${startY} C ${cp1x} ${startY}, ${cp2x} ${endY}, ${endX} ${endY}" fill="none" stroke="${stroke}" stroke-opacity="0.14" stroke-width="${link.from.depth === 0 ? 9 : 5.5}" stroke-linecap="round"/>
              <path d="M ${startX} ${startY} C ${cp1x} ${startY}, ${cp2x} ${endY}, ${endX} ${endY}" fill="none" stroke="${stroke}" stroke-width="${link.from.depth === 0 ? 4.2 : 2.8}" stroke-linecap="round"/>
            `;
          })
          .join("")}
        ${layout.nodes
          .map((node) => {
            const branchColor = layout.branchColors[node.branchIndex % layout.branchColors.length];
            const fill = node.depth === 0 ? "url(#semrushMindmapRootFill)" : "#ffffff";
            const stroke = node.depth === 0 ? "rgba(12,94,80,0.35)" : "rgba(64, 78, 72, 0.09)";
            const textColor = node.depth === 0 ? "#f5fbf8" : "#20312c";
            const fontSize = node.depth === 0 ? 20 : 14;
            const lineHeight = node.depth === 0 ? 24 : 19;
            const textStartY =
              node.y + node.height / 2 - ((node.lines.length - 1) * lineHeight) / 2 + 5;
            return `
              <g filter="url(#semrushMindmapShadow)">
                <rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="${node.depth === 0 ? 24 : 18}" fill="${fill}" stroke="${stroke}" stroke-width="${node.depth === 0 ? 1 : 1.1}"></rect>
                ${node.depth === 0 ? "" : `<rect x="${node.x + 12}" y="${node.y + 11}" width="4" height="${Math.max(20, node.height - 22)}" rx="999" fill="${branchColor}" opacity="0.92"></rect>`}
                <text fill="${textColor}" font-size="${fontSize}" font-weight="${node.depth === 0 ? 700 : 500}" font-family="Manrope, PingFang SC, Microsoft YaHei, sans-serif">
                  ${node.lines
                    .map(
                      (line, index) =>
                        `<tspan x="${node.x + (node.depth === 0 ? 22 : 28)}" y="${textStartY + index * lineHeight}">${escapeHtml(line)}</tspan>`
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

  function openCompareReportModal(payload) {
    if (!(compareReportModalEl instanceof HTMLElement) || !(compareReportModalBodyEl instanceof HTMLElement)) {
      return;
    }
    let parsed = null;
    try {
      parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
    } catch {
      parsed = null;
    }
    if (!parsed) {
      return;
    }

    activeCompareReportPayload = {
      pageSummary: parsed.pageSummary || "竞品分析报告",
      comparisonTables: normalizeComparisonTables(parsed.comparisonTables),
      answer: parsed.answer || ""
    };
    compareReportModalBodyEl.innerHTML = renderComparisonReportBody(
      activeCompareReportPayload.pageSummary,
      activeCompareReportPayload.comparisonTables,
      activeCompareReportPayload.answer
    );
    compareReportModalEl.classList.remove("semrush-coach-hidden");
    compareReportModalEl.setAttribute("aria-hidden", "false");
  }

  function closeCompareReportModal() {
    if (!(compareReportModalEl instanceof HTMLElement) || !(compareReportModalBodyEl instanceof HTMLElement)) {
      return;
    }
    compareReportModalEl.classList.add("semrush-coach-hidden");
    compareReportModalEl.setAttribute("aria-hidden", "true");
    compareReportModalBodyEl.innerHTML = "";
    activeCompareReportPayload = null;
  }

  function updateCompareHelper(message = "", isError = false) {
    if (!(compareHelperEl instanceof HTMLElement)) {
      return;
    }
    compareHelperEl.textContent = message;
    compareHelperEl.classList.toggle("semrush-coach-hidden", !message);
    compareHelperEl.classList.toggle("is-error", Boolean(message && isError));
  }

  function getEnabledCompareUrlInputs() {
    return compareUrlInputEls.filter((input) => input instanceof HTMLInputElement && !input.disabled);
  }

  function getCompareTargetUrls(options = {}) {
    const optionUrls = Array.isArray(options.targetUrls) ? options.targetUrls : options.targetUrl ? [options.targetUrl] : [];
    const inputs = getEnabledCompareUrlInputs();
    const values = optionUrls.length
      ? optionUrls
      : inputs.map((input) => input.value);

    return values
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .slice(0, 3);
  }

  function openCompareModal(prefill = {}) {
    if (!(compareModalEl instanceof HTMLElement)) {
      return;
    }
    const prefillUrls = Array.isArray(prefill.urls) ? prefill.urls : prefill.url ? [prefill.url] : [];
    getEnabledCompareUrlInputs().forEach((input, index) => {
      input.value = prefillUrls[index] || "";
    });
    if (compareFocusInputEl instanceof HTMLTextAreaElement) {
      compareFocusInputEl.value = prefill.focus || DEFAULT_COMPARE_FOCUS;
    }
    updateCompareHelper(prefill.helper || "", Boolean(prefill.helperError));
    compareModalEl.classList.remove("semrush-coach-hidden");
    compareModalEl.setAttribute("aria-hidden", "false");
    const firstInput = getEnabledCompareUrlInputs()[0];
    firstInput?.focus();
    firstInput?.select?.();
  }

  function closeCompareModal() {
    if (!(compareModalEl instanceof HTMLElement)) {
      return;
    }
    compareModalEl.classList.add("semrush-coach-hidden");
    compareModalEl.setAttribute("aria-hidden", "true");
    updateCompareHelper("");
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
    queueAiTimelineRefresh(true);
  }

  function closePanel() {
    state.open = false;
    closeToolsMenu();
    panel.classList.add("semrush-coach-hidden");
    bubble.classList.remove("semrush-coach-bubble-active");
    queueAiTimelineRefresh(true);
    if (state.selectionActive) {
      cleanupFocusSelection();
    }
  }

  function toggleSettings(open) {
    state.settingsOpen = open;
    settingsPanelEl.classList.toggle("semrush-coach-hidden", !open);
    panel.classList.toggle("semrush-coach-settings-view", open);
    settingsToggleEl.classList.toggle("semrush-coach-settings-toggle-active", open);
    queueAiTimelineRefresh(true);
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
    state.hydratingSettingsForm = true;
    const defaultUrl = state.settings.apiUrl || PROVIDERS.qianwen.url;
    settingsFormEls.trialApiUrl.value = state.settings.trialApiUrl || "";
    settingsFormEls.apiUrl.value = defaultUrl;
    settingsFormEls.apiKey.value = state.settings.apiKey || "";
    settingsFormEls.allowedHosts.value = parseAllowedHosts(state.settings.allowedHosts).join("\n");
    settingsFormEls.aiTimelineEnabled.checked = state.settings.aiTimelineEnabled !== false;
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
    state.hydratingSettingsForm = false;
  }

  function describeStoredKey(settings = state.settings) {
    const key = String(settings?.apiKey || "").trim();
    return key ? `已检测到已保存的 key，长度 ${key.length}` : "未检测到已保存的 key";
  }

  function setSettingsStatus(baseText, { includeStorageState = false } = {}) {
    if (!includeStorageState) {
      settingsStatusEl.textContent = baseText;
      return;
    }
    settingsStatusEl.textContent = `${baseText} | ${describeStoredKey()}`;
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
    return Boolean(settings.remoteEnabled && settings.apiKey);
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
      .map((item, index) => {
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
            <article class="semrush-coach-message semrush-coach-message-user" data-history-index="${index}">
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
          : item.renderAsQr
              ? renderQrCodeCard(item)
          : item.renderAsCode
              ? `<pre class="semrush-coach-code-block"><code>${escapeHtml(String(item.answer || ""))}</code></pre>`
              : item.renderAsComparison
                  ? `<div class="semrush-coach-compare-report-preview">${renderComparisonReportBody(item.pageSummary || "竞品分析报告", item.comparisonTables, item.answer || "")}</div>`
              : renderMarkdownContent(item.answer || "");

        const steps = item.renderAsMindmap || item.renderAsQr ? "" : (item.suggestedNextSteps || []).map((step) => `<li>${escapeHtml(step)}</li>`).join("");
        const encodedAnswer = escapeAttribute(item.answer || "");
        const encodedComparison = item.renderAsComparison
          ? escapeAttribute(
              JSON.stringify({
                pageSummary: item.pageSummary || "竞品分析报告",
                comparisonTables: normalizeComparisonTables(item.comparisonTables),
                answer: item.answer || ""
              })
            )
          : "";
        const actionButton = item.renderAsMindmap || item.renderAsQr
          ? ""
          : item.renderAsComparison
              ? `
                <div class="semrush-coach-card-actions">
                  <button class="semrush-coach-copy-btn" data-answer="${encodedAnswer}" title="一键复制">复制</button>
                  <button class="semrush-coach-compare-open-btn" data-report="${encodedComparison}" type="button">全屏查看</button>
                </div>
              `
          : item.renderAsAssessment
              ? `
                <div class="semrush-coach-card-actions">
                  <button class="semrush-coach-copy-btn" data-answer="${encodedAnswer}" title="一键复制">复制</button>
                  <button class="semrush-coach-assessment-open-btn" data-answer="${encodedAnswer}" data-title="${escapeAttribute(item.pageSummary || "项目评估")}" type="button">全屏查看</button>
                </div>
              `
              : `<button class="semrush-coach-copy-btn" data-answer="${encodedAnswer}" title="一键复制">复制</button>`;

        return `
          <article class="semrush-coach-card" data-history-index="${index}">
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
      <p class="semrush-coach-card-title semrush-coach-progress-title">${escapeHtml(title)}</p>
      <p class="semrush-coach-progress-step">${escapeHtml(steps[0] || "处理中…")}</p>
      <div class="semrush-coach-progress-bar-wrap">
        <div class="semrush-coach-progress-bar" style="width: ${initialPercent}%"></div>
      </div>
    `;
    historyEl.appendChild(progressCard);
    scrollHistoryToBottom();

    const progressBar = progressCard.querySelector(".semrush-coach-progress-bar");
    const progressStepEl = progressCard.querySelector(".semrush-coach-progress-step");

    return {
      card: progressCard,
      update(step, percent) {
        if (progressStepEl) {
          progressStepEl.textContent = steps[step] || "";
        }
        if (progressBar) {
          progressBar.style.width = `${percent}%`;
        }
        scrollHistoryToBottom();
      },
      remove() {
        progressCard.remove();
      }
    };
  }

  function buildLongScreenshotFilename() {
    const safeBase = String(document.title || "网页长截图")
      .trim()
      .replace(/[\\/:*?"<>|]/g, "-")
      .replace(/\s+/g, " ")
      .slice(0, 48) || "网页长截图";
    const now = new Date();
    const stamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0")
    ].join("");
    return `${safeBase}-longshot-${stamp}.jpg`;
  }

  function loadImageFromDataUrl(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("长截图分片加载失败"));
      img.src = dataUrl;
    });
  }

  function estimateViewportTopOverlayHeight() {
    const viewportWidth = window.innerWidth || 1280;
    const viewportHeight = window.innerHeight || 900;
    let inset = 0;
    const candidates = Array.from(document.body?.querySelectorAll("*") || []);
    for (const node of candidates) {
      if (!(node instanceof HTMLElement) || root.contains(node)) {
        continue;
      }
      const style = window.getComputedStyle(node);
      if (!["fixed", "sticky"].includes(style.position) || style.display === "none" || style.visibility === "hidden") {
        continue;
      }
      const rect = node.getBoundingClientRect();
      if (rect.height < 24 || rect.top > 2 || rect.bottom <= 0) {
        continue;
      }
      if (rect.width < viewportWidth * 0.35 || rect.height > viewportHeight * 0.35) {
        continue;
      }
      inset = Math.max(inset, Math.min(rect.bottom, 180));
    }
    return inset;
  }

  async function captureLongScreenshot() {
    if (state.loading) {
      return;
    }

    closeToolsMenu();
    openPanel(true);
    setLoading(true);

    const progressCard = createProgressCard({
      title: "网页长截图中",
      steps: [
        "正在计算页面长度和滚动分段…",
        "正在逐屏截图，请稍等…",
        "正在拼接长图并准备下载…"
      ],
      initialPercent: 8,
      eyebrow: "Capture"
    });

    const doc = document.documentElement;
    const originalY = window.scrollY;
    const viewportHeight = window.innerHeight || 900;
    const pageHeight = Math.max(doc?.scrollHeight || 0, document.body.scrollHeight || 0, viewportHeight);
    const topOverlayHeight = estimateViewportTopOverlayHeight();
    const step = Math.max(240, viewportHeight - Math.min(topOverlayHeight, Math.floor(viewportHeight * 0.28)));
    const maxScrollY = Math.max(0, pageHeight - viewportHeight);
    const positions = [];

    for (let y = 0; y <= maxScrollY; y += step) {
      positions.push(y);
    }
    if (!positions.length || positions[positions.length - 1] !== maxScrollY) {
      positions.push(maxScrollY);
    }

    const previousDisplay = root.style.display;
    const captures = [];

    try {
      progressCard.update(0, 14);
      root.style.display = "none";

      for (let index = 0; index < positions.length; index += 1) {
        const y = positions[index];
        window.scrollTo(0, y);
        await wait(280);
        const captureRes = await chrome.runtime.sendMessage({ type: "SEMRUSH_COACH_CAPTURE_TAB" });
        if (!captureRes?.ok || !captureRes.dataUrl) {
          throw new Error(captureRes?.error || "页面截图失败");
        }
        captures.push({ y, dataUrl: captureRes.dataUrl });
        const percent = 18 + Math.round(((index + 1) / positions.length) * 54);
        progressCard.update(1, Math.min(percent, 72));
      }
    } finally {
      root.style.display = previousDisplay;
      window.scrollTo(0, originalY);
      await wait(120);
    }

    try {
      progressCard.update(2, 82);
      const loadedCaptures = [];
      for (const capture of captures) {
        loadedCaptures.push({
          y: capture.y,
          img: await loadImageFromDataUrl(capture.dataUrl)
        });
      }

      if (!loadedCaptures.length) {
        throw new Error("没有拿到可拼接的截图分片");
      }

      const naturalWidth = loadedCaptures[0].img.naturalWidth || loadedCaptures[0].img.width;
      const naturalHeight = loadedCaptures[0].img.naturalHeight || loadedCaptures[0].img.height;
      const cssToPixelScale = naturalHeight / viewportHeight;
      const rawOutputHeight = Math.max(1, Math.round(pageHeight * cssToPixelScale));
      const maxOutputHeight = 24000;
      const shrinkRatio = rawOutputHeight > maxOutputHeight ? maxOutputHeight / rawOutputHeight : 1;
      const renderScale = cssToPixelScale * shrinkRatio;
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(naturalWidth * shrinkRatio));
      canvas.height = Math.max(1, Math.round(pageHeight * renderScale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("浏览器当前无法拼接长截图");
      }

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      let coveredBottom = 0;
      for (const capture of loadedCaptures) {
        const viewportBottom = Math.min(capture.y + viewportHeight, pageHeight);
        const uniqueStart = Math.max(capture.y, coveredBottom);
        const uniqueHeightCss = Math.max(0, viewportBottom - uniqueStart);
        if (uniqueHeightCss <= 0) {
          continue;
        }

        const cropTopPx = Math.round((uniqueStart - capture.y) * cssToPixelScale);
        const cropHeightPx = Math.max(1, Math.round(uniqueHeightCss * cssToPixelScale));
        const destY = Math.round(uniqueStart * renderScale);
        const destHeight = Math.max(1, Math.round(uniqueHeightCss * renderScale));

        ctx.drawImage(
          capture.img,
          0,
          cropTopPx,
          capture.img.naturalWidth || capture.img.width,
          cropHeightPx,
          0,
          destY,
          canvas.width,
          destHeight
        );
        coveredBottom = Math.max(coveredBottom, viewportBottom);
      }

      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = buildLongScreenshotFilename();
      document.body.appendChild(link);
      link.click();
      link.remove();

      state.history.push({
        role: "assistant",
        pageSummary: "网页长截图已生成",
        answer: rawOutputHeight > maxOutputHeight
          ? "长截图已经开始下载。因为页面太长，我顺手帮你做了一次等比压缩，避免图片大到浏览器扛不住。"
          : "长截图已经开始下载，你直接去浏览器下载列表里找就行。",
        suggestedNextSteps: [],
        confidence: 0.96,
        elementHints: []
      });
      renderHistory();
      openPanel(true);
    } catch (error) {
      state.history.push({
        role: "assistant",
        pageSummary: "网页长截图失败",
        answer: error instanceof Error ? error.message : "长截图失败了，请稍后再试。",
        suggestedNextSteps: ["先确认当前页面已经完整加载", "如果页面特别长，滚动到底部后再试一次"],
        confidence: 0.28,
        elementHints: []
      });
      renderHistory();
      openPanel(true);
    } finally {
      progressCard.remove();
      setLoading(false);
    }
  }

  async function createPageQrCode() {
    const snapshot = getSnapshot();
    const targetUrl = String(snapshot.url || location.href || "").trim();
    if (!/^https?:\/\//i.test(targetUrl)) {
      state.history.push({
        role: "assistant",
        pageSummary: "网页二维码生成失败",
        answer: "当前这个页面链接不是标准网页地址，暂时没法直接转成二维码。",
        suggestedNextSteps: ["换到正常的 http 或 https 页面再试一次"],
        confidence: 0.34,
        elementHints: []
      });
      renderHistory();
      openPanel(true);
      return;
    }

    state.history.push({
      role: "assistant",
      pageSummary: `网页二维码 · ${snapshot.title || "当前页面"}`,
      answer: "手机扫一扫就能打开当前网页。",
      suggestedNextSteps: [],
      confidence: 0.98,
      elementHints: [],
      renderAsQr: true,
      qrTargetUrl: targetUrl,
      qrImageUrl: buildQrCodeImageUrl(targetUrl),
      qrFilename: buildPageQrFilename()
    });
    renderHistory();
    openPanel(true);
    showFloatingNotice("网页二维码已生成");
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
    await setAttachmentFromDataUrl(rawDataUrl, file.name || "image");
  }

  async function setAttachmentFromDataUrl(rawDataUrl, name = "截图") {
    const dataUrl = await compressImage(rawDataUrl);
    state.attachment = {
      dataUrl,
      mimeType: "image/jpeg",
      name
    };
    renderAttachment();
    openPanel(true);
  }

  async function captureSelectionAttachment(selectionRect, outputMimeType = "image/png") {
    const captureRes = await chrome.runtime.sendMessage({ type: "SEMRUSH_COACH_CAPTURE_TAB" });
    if (!captureRes?.ok || !captureRes.dataUrl) {
      throw new Error(captureRes?.error || "框选截图失败，请重试");
    }

    const img = await loadImageFromDataUrl(captureRes.dataUrl);
    const viewportWidth = Math.max(window.innerWidth || 1, 1);
    const viewportHeight = Math.max(window.innerHeight || 1, 1);
    const sourceWidth = img.naturalWidth || img.width || viewportWidth;
    const sourceHeight = img.naturalHeight || img.height || viewportHeight;
    const scaleX = sourceWidth / viewportWidth;
    const scaleY = sourceHeight / viewportHeight;
    const left = Math.max(0, Math.round(selectionRect.left * scaleX));
    const top = Math.max(0, Math.round(selectionRect.top * scaleY));
    const width = Math.max(1, Math.min(sourceWidth - left, Math.round(selectionRect.width * scaleX)));
    const height = Math.max(1, Math.min(sourceHeight - top, Math.round(selectionRect.height * scaleY)));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("框选截图失败，画布不可用");
    }

    ctx.drawImage(img, left, top, width, height, 0, 0, width, height);
    return outputMimeType === "image/jpeg"
      ? canvas.toDataURL("image/jpeg", 0.92)
      : canvas.toDataURL("image/png");
  }

  function dataUrlToBlob(dataUrl) {
    const [header, base64] = String(dataUrl || "").split(",");
    if (!header || !base64) {
      throw new Error("截图数据格式不对");
    }
    const mimeType = header.match(/data:(.*?);base64/)?.[1] || "image/png";
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new Blob([bytes], { type: mimeType });
  }

  async function copyImageDataUrlToClipboard(dataUrl) {
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
      throw new Error("当前浏览器不支持直接复制截图");
    }
    const blob = dataUrlToBlob(dataUrl);
    await navigator.clipboard.write([
      new ClipboardItem({
        [blob.type || "image/png"]: blob
      })
    ]);
  }

  function showFloatingNotice(message, isError = false) {
    if (!message) {
      return;
    }

    const notice = document.createElement("div");
    notice.className = `semrush-coach-floating-notice${isError ? " is-error" : ""}`;
    notice.textContent = message;
    root.appendChild(notice);

    requestAnimationFrame(() => {
      notice.classList.add("is-visible");
    });

    window.setTimeout(() => {
      notice.classList.remove("is-visible");
      window.setTimeout(() => notice.remove(), 220);
    }, 1800);
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

  function lockPageScrollForFocusMode() {
    if (state.focusMode.scrollLock) {
      return;
    }

    const docEl = document.documentElement;
    const bodyEl = document.body;
    state.focusMode.scrollLock = {
      docOverflow: docEl.style.overflow,
      docOverscrollBehavior: docEl.style.overscrollBehavior,
      bodyOverflow: bodyEl.style.overflow,
      bodyOverscrollBehavior: bodyEl.style.overscrollBehavior
    };

    docEl.style.overflow = "hidden";
    docEl.style.overscrollBehavior = "none";
    bodyEl.style.overflow = "hidden";
    bodyEl.style.overscrollBehavior = "none";
  }

  function unlockPageScrollForFocusMode() {
    if (!state.focusMode.scrollLock) {
      return;
    }

    const docEl = document.documentElement;
    const bodyEl = document.body;
    docEl.style.overflow = state.focusMode.scrollLock.docOverflow;
    docEl.style.overscrollBehavior = state.focusMode.scrollLock.docOverscrollBehavior;
    bodyEl.style.overflow = state.focusMode.scrollLock.bodyOverflow;
    bodyEl.style.overscrollBehavior = state.focusMode.scrollLock.bodyOverscrollBehavior;
    state.focusMode.scrollLock = null;
  }

  function deactivateFocusMode() {
    cleanupFocusSelection();
    if (typeof state.focusMode.host?.__cleanup === "function") {
      state.focusMode.host.__cleanup();
    }
    if (state.focusMode.host?.isConnected) {
      state.focusMode.host.remove();
    }
    unlockPageScrollForFocusMode();
    state.focusMode.active = false;
    state.focusMode.host = null;
  }

  function getFocusContentNodes() {
    return Array.from(document.querySelectorAll("h1, h2, h3, p, li, blockquote, pre")).filter(isVisibleFocusNode);
  }

  function getRectIntersectionArea(a, b) {
    const left = Math.max(a.left, b.left);
    const right = Math.min(a.right, b.right);
    const top = Math.max(a.top, b.top);
    const bottom = Math.min(a.bottom, b.bottom);
    return Math.max(0, right - left) * Math.max(0, bottom - top);
  }

  function isFocusNoiseNode(element) {
    if (!(element instanceof HTMLElement)) {
      return true;
    }

    if (element.closest([
      "header",
      "nav",
      "footer",
      "aside",
      "[role='navigation']",
      "[role='complementary']",
      "[role='contentinfo']"
    ].join(","))) {
      return true;
    }

    const context = [];
    let current = element;
    let depth = 0;
    while (current && current !== document.body && depth < 6) {
      context.push(`${current.id || ""} ${current.className || ""}`);
      current = current.parentElement;
      depth += 1;
    }
    const contextText = context.join(" ").toLowerCase();
    if (/nav|menu|header|footer|aside|sidebar|recommend|related|hot|rank|comment|login|search|share|qrcode|qr-code|copyright|beian|备案|公众号|下载|app|推荐|最新文章|热门|评论|举报|二维码/.test(contextText)) {
      return true;
    }

    const text = (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
    if (!text) {
      return true;
    }
    if (isFocusNoiseText(text)) {
      return true;
    }

    return false;
  }

  function isFocusArticleStopText(text) {
    return /^\[?免责声明\]?|推荐文章|最新文章|关注\s*36氪企服点评|商务合作|热门推荐|联系我们|打开微信扫一扫/.test(String(text || "").trim());
  }

  function isFocusNoiseText(text) {
    const value = String(text || "").replace(/\s+/g, " ").trim();
    if (!value) {
      return true;
    }
    if (/^(首页|软件分类|排行榜|案例库|资讯|直播|AI测评网|公众号|APP|登录|搜索|商务合作|热门推荐|热门文章|推荐文章|\+ 关注|关注|分享|查看更多)$/.test(value)) {
      return true;
    }
    if (/京公网安备|ICP备|未经许可，禁止转载|本文作者原创发布于|©|Copyright|二维码|扫码/.test(value)) {
      return true;
    }
    return false;
  }

  function getFocusContainerScore(element, matchedNodes, selectionRect = null) {
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
    const linkTextLength = Array.from(element.querySelectorAll("a"))
      .reduce((sum, link) => sum + ((link.innerText || link.textContent || "").replace(/\s+/g, " ").trim().length), 0);
    const linkDensityPenalty = text.length ? Math.min(180, (linkTextLength / text.length) * 180) : 0;
    const noisePenalty = /nav|menu|header|footer|aside|sidebar|recommend|related|hot|rank|comment|search|share|qrcode|qr-code|推荐|最新文章|热门|评论|二维码/.test(`${className} ${id}`) ? 160 : 0;
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
    const selectionBonus = selectionRect
      ? Math.min(160, getRectIntersectionArea(ownRect, selectionRect) / Math.max(1, selectionRect.width * selectionRect.height) * 180)
      : 0;
    return semanticBonus + selectionBonus + matchedCount * 35 + Math.min(text.length / 120, 45) - areaPenalty - linkDensityPenalty - noisePenalty;
  }

  function findBestFocusContainer(matchedNodes, selectionRect = null) {
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
      const score = getFocusContainerScore(candidate, matchedNodes, selectionRect);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    });

    return best;
  }

  function compactFocusSentence(text, maxLength = 54) {
    const normalized = String(text || "")
      .replace(/\s+/g, " ")
      .replace(/^[“"'‘’]+|[”"'‘’]+$/g, "")
      .trim();
    if (!normalized) {
      return "";
    }
    const firstSentence = normalized.split(/(?<=[。！？!?；;])\s*/)[0] || normalized;
    return firstSentence.length > maxLength ? `${firstSentence.slice(0, maxLength)}…` : firstSentence;
  }

  function inferFocusPointFromText(text) {
    const source = String(text || "").replace(/\s+/g, " ").trim();
    if (!source) {
      return null;
    }

    const rules = [
      {
        test: /能力圈|边界|知止|不能做什么/,
        title: "明确能力边界",
        body: "先判断能做什么、不能做什么，再决定业务取舍。"
      },
      {
        test: /客户|资质|申请|代办|接单|什么业务都能接/,
        title: "警惕能力圈外需求",
        body: "看似能接的需求，如果缺少经验和资质，容易变成风险。"
      },
      {
        test: /代价|损失|踩坑|教训|风险/,
        title: "盲目扩张会付出代价",
        body: "不清楚边界时做承诺，后续补课成本会被放大。"
      },
      {
        test: /经验|模型|方法|管理|系统/,
        title: "把经验沉淀成模型",
        body: "将个案复盘成判断框架，才能稳定指导下一次决策。"
      },
      {
        test: /核心竞争力|竞争力|优势/,
        title: "聚焦真正的竞争力",
        body: "竞争力不是覆盖所有事，而是持续强化自己擅长的事。"
      }
    ];

    const matched = rules.find((rule) => rule.test.test(source));
    if (matched) {
      return matched;
    }

    const title = compactFocusSentence(source, 18).replace(/[。！？!?；;，,：:].*$/, "");
    return {
      title: title || "关键判断",
      body: compactFocusSentence(source, 56)
    };
  }

  function buildFocusKeyPoints(items, heading) {
    const points = [];
    const seen = new Set();
    const addPoint = (point) => {
      if (!point?.title || seen.has(point.title)) {
        return;
      }
      seen.add(point.title);
      points.push({
        title: point.title,
        body: point.body || ""
      });
    };

    items.forEach((item, index) => {
      if (points.length >= 4) {
        return;
      }
      if (/^h[1-3]$/.test(item.tag) && item.text !== heading) {
        const nextParagraph = items.slice(index + 1).find((entry) => entry.tag === "p" && entry.text.length >= 24);
        addPoint({
          title: compactFocusSentence(item.text, 20),
          body: compactFocusSentence(nextParagraph?.text || item.text, 52)
        });
      }
    });

    items.forEach((item) => {
      if (points.length >= 4) {
        return;
      }
      if (item.tag === "p" && item.text.length >= 24) {
        addPoint(inferFocusPointFromText(item.text));
      }
    });

    return points.slice(0, 4);
  }

  function buildFocusContent(selectionRect) {
    const allContentNodes = getFocusContentNodes().filter((node) => !isFocusNoiseNode(node));
    const matchedNodes = allContentNodes.filter((node) => rectsIntersect(selectionRect, node.getBoundingClientRect()));
    const bestContainer = findBestFocusContainer(matchedNodes, selectionRect);
    let candidates = bestContainer
      ? allContentNodes.filter((node) => bestContainer.contains(node) && !isFocusNoiseNode(node))
      : allContentNodes;
    const selectedHeadingIndex = candidates.findIndex((node) => {
      if (!/^h[1-3]$/i.test(node.tagName)) {
        return false;
      }
      return rectsIntersect(selectionRect, node.getBoundingClientRect());
    });
    const firstHeadingIndex = selectedHeadingIndex >= 0
      ? selectedHeadingIndex
      : candidates.findIndex((node) => /^h[1-3]$/i.test(node.tagName));
    if (firstHeadingIndex > 0) {
      candidates = candidates.slice(firstHeadingIndex);
    }
    const seen = new Set();
    let blocks = [];
    let plainBlocks = [];
    let contentItems = [];
    let heading = "";
    let reachedArticleEnd = false;

    candidates.forEach((node) => {
      if (reachedArticleEnd) {
        return;
      }
      const rect = node.getBoundingClientRect();
      if (!bestContainer && !rectsIntersect(selectionRect, rect)) {
        return;
      }

      const text = (node.innerText || node.textContent || "").replace(/\s+/g, " ").trim();
      if (!text || seen.has(text)) {
        return;
      }
      if (isFocusArticleStopText(text)) {
        reachedArticleEnd = true;
        return;
      }
      if (isFocusNoiseText(text)) {
        return;
      }
      seen.add(text);
      plainBlocks.push(text);

      const tag = node.tagName.toLowerCase();
      contentItems.push({ tag, text });
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

    if (plainBlocks.join(" ").length < 220 && bestContainer instanceof HTMLElement) {
      const fallbackLines = (bestContainer.innerText || "")
        .split(/\n+/)
        .map((line) => line.replace(/\s+/g, " ").trim())
        .flatMap((line) => {
          if (line.length <= 260) {
            return [line];
          }
          return line
            .split(/(?<=[。！？!?])\s*/)
            .map((part) => part.trim())
            .filter(Boolean);
        })
        .filter(Boolean);
      const nextBlocks = [];
      const nextPlainBlocks = [];
      const nextItems = [];
      const nextSeen = new Set();
      let fallbackReachedEnd = false;

      fallbackLines.forEach((line) => {
        if (fallbackReachedEnd || nextSeen.has(line)) {
          return;
        }
        if (isFocusArticleStopText(line)) {
          fallbackReachedEnd = true;
          return;
        }
        if (isFocusNoiseText(line)) {
          return;
        }
        nextSeen.add(line);
        const isTitleLine = !nextPlainBlocks.length && line === (heading || line);
        nextPlainBlocks.push(line);
        nextItems.push({ tag: isTitleLine ? "h2" : "p", text: line });
        nextBlocks.push(isTitleLine ? `<h2>${escapeHtml(line)}</h2>` : `<p>${escapeHtml(line)}</p>`);
      });

      if (nextPlainBlocks.join(" ").length > plainBlocks.join(" ").length) {
        blocks = nextBlocks;
        plainBlocks = nextPlainBlocks;
        contentItems = nextItems;
        heading = heading || nextPlainBlocks[0] || "";
      }
    }

    const html = blocks
      .join("")
      .replace(/(<li>.*?<\/li>)+/g, (match) => `<ul>${match}</ul>`);

    const readableText = plainBlocks.join(" ");
    const summary = compactFocusSentence(
      plainBlocks.find((text) => text.length >= 48 && text !== heading) || readableText,
      96
    );
    const keyPoints = buildFocusKeyPoints(contentItems, heading);
    const titleWords = (heading || document.title || "")
      .split(/[｜|,，、\s]+/)
      .map((item) => item.trim())
      .filter((item) => item && item.length <= 8)
      .slice(0, 4);
    const tags = titleWords;
    const readMinutes = Math.max(1, Math.ceil(readableText.length / 500));

    return {
      title: heading || document.title || "专注阅读",
      html,
      summary,
      keyPoints,
      tags,
      readMinutes
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
    lockPageScrollForFocusMode();

    const host = document.createElement("div");
    host.className = "semrush-coach-focus-host";
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: "open" });
    const currentTheme = state.focusMode.theme === "light" ? "light" : "dark";
    state.focusMode.theme = currentTheme;
    const focusTagsHtml = (content.tags || [])
      .slice(0, 4)
      .map((tag) => `<span>${escapeHtml(tag)}</span>`)
      .join("");
    const focusKeyPointsHtml = (content.keyPoints || [])
      .slice(0, 4)
      .map((point, index) => `
        <li>
          <span class="focus-key-icon">${index + 1}</span>
          <p><strong>${escapeHtml(point.title || point)}</strong>${point.body ? `<span>${escapeHtml(point.body)}</span>` : ""}</p>
        </li>
      `)
      .join("");
    shadow.innerHTML = `
      <style>
        .focus-shell {
          --focus-bg: #050a0e;
          --focus-glow: rgba(0, 255, 178, 0.05);
          --focus-text: #f3f7f5;
          --focus-text-soft: rgba(243, 247, 245, 0.7);
          --focus-toolbar-bg: rgba(5, 10, 14, 0.6);
          --focus-toolbar-border: rgba(255, 255, 255, 0.04);
          --focus-button-bg: linear-gradient(135deg, #00ffa3, #00d1ff);
          --focus-button-text: #050d0a;
          --focus-button-secondary-bg: rgba(255, 255, 255, 0.05);
          --focus-button-secondary-border: rgba(255, 255, 255, 0.1);
          --focus-pre-bg: rgba(255, 255, 255, 0.04);
          position: fixed;
          inset: 0;
          z-index: 2147483646;
          background: #050a0e;
          color: var(--focus-text);
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          overflow-y: auto;
          overflow-x: hidden;
          overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch;
          scroll-behavior: smooth;
        }

        #rain-canvas {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 2; /* 在背景之上 */
          opacity: 0.8;
          filter: drop-shadow(0 0 2px rgba(255,255,255,0.2));
        }

        .focus-shell::before {
          content: "";
          position: fixed;
          inset: 0;
          background: 
            radial-gradient(circle at 50% 120%, rgba(0, 255, 163, 0.05), transparent),
            radial-gradient(circle at 10% 10%, rgba(0, 209, 255, 0.03), transparent);
          z-index: 1;
        }

        .focus-toolbar {
          position: sticky;
          top: 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 24px;
          backdrop-filter: blur(20px) saturate(180%);
          background: var(--focus-toolbar-bg);
          border-bottom: 1px solid var(--focus-toolbar-border);
          z-index: 100;
        }

        .focus-shell {
          --focus-bg: #050a0e;
          --focus-glow: rgba(0, 255, 163, 0.05);
          --focus-text: #f3f7f5;
          --focus-text-soft: rgba(243, 247, 245, 0.7);
          --focus-toolbar-bg: rgba(5, 10, 14, 0.6);
          --focus-toolbar-border: rgba(255, 255, 255, 0.04);
          --focus-button-bg: linear-gradient(135deg, #00ffa3, #00d1ff);
          --focus-button-text: #050d0a;
          --focus-button-secondary-bg: rgba(255, 255, 255, 0.05);
          --focus-button-secondary-border: rgba(255, 255, 255, 0.1);
          --focus-pre-bg: rgba(255, 255, 255, 0.04);
          position: fixed;
          inset: 0;
          z-index: 2147483646;
          background: var(--focus-bg);
          color: var(--focus-text);
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          overflow-y: auto;
          overflow-x: hidden;
          overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch;
          scroll-behavior: smooth;
          transition: background 0.5s ease, color 0.3s ease;
        }

        .focus-shell[data-theme="light"] {
          --focus-bg: #f4f7f5;
          --focus-text: #17211d;
          --focus-text-soft: #53635e;
          --focus-toolbar-bg: rgba(247, 250, 248, 0.94);
          --focus-toolbar-border: rgba(23, 33, 29, 0.1);
          --focus-button-secondary-bg: rgba(23, 33, 29, 0.06);
          --focus-button-secondary-border: rgba(23, 33, 29, 0.14);
          --focus-pre-bg: rgba(23, 33, 29, 0.06);
          background:
            radial-gradient(circle at 50% -12%, rgba(0, 156, 106, 0.08), transparent 34%),
            radial-gradient(circle at 86% 24%, rgba(156, 215, 255, 0.34), transparent 28%),
            radial-gradient(circle at 20% 92%, rgba(255, 255, 255, 0.72), transparent 30%),
            linear-gradient(135deg, #eaf7ff 0%, #f7fbff 46%, #dbeeff 100%);
        }

        .focus-shell[data-theme="dark"] {
          --focus-bg: #06111a;
          --focus-text: #e9f4ff;
          --focus-text-soft: #8ea5ba;
          --focus-toolbar-bg: rgba(6, 17, 26, 0.58);
          --focus-toolbar-border: rgba(119, 190, 255, 0.12);
          --focus-button-secondary-bg: rgba(145, 201, 255, 0.08);
          --focus-button-secondary-border: rgba(145, 201, 255, 0.16);
          --focus-pre-bg: rgba(145, 201, 255, 0.08);
          background:
            radial-gradient(circle at 84% 6%, rgba(36, 144, 255, 0.24), transparent 24%),
            radial-gradient(circle at 8% 88%, rgba(15, 214, 184, 0.12), transparent 28%),
            linear-gradient(135deg, #06131d 0%, #07131c 48%, #02070b 100%);
        }

        .focus-shell[data-theme="glass"] {
          --focus-bg: rgba(15, 25, 35, 0.65);
          --focus-glow: rgba(255, 255, 255, 0.05);
          --focus-text: #ffffff;
          --focus-text-soft: rgba(255, 255, 255, 0.7);
          --focus-toolbar-bg: rgba(25, 35, 45, 0.4);
          --focus-toolbar-border: rgba(255, 255, 255, 0.1);
          --focus-button-bg: linear-gradient(135deg, #ffffff, #d1d5db);
          --focus-button-text: #111827;
          --focus-button-secondary-bg: rgba(255, 255, 255, 0.1);
          --focus-button-secondary-border: rgba(255, 255, 255, 0.2);
          --focus-pre-bg: rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(40px) saturate(200%);
          background: radial-gradient(circle at 50% -20%, rgba(255, 255, 255, 0.12), transparent), 
                      linear-gradient(180deg, rgba(20, 30, 40, 0.6), rgba(10, 20, 30, 0.8));
        }

        .focus-shell[data-theme="glass"] .focus-mask-pane {
          background: rgba(0, 5, 10, 0.3);
          backdrop-filter: blur(8px);
        }

        .focus-shell[data-theme="glass"] .focus-toolbar strong {
          color: #ffffff;
          text-shadow: 0 0 12px rgba(255, 255, 255, 0.3);
        }

        .focus-shell[data-theme="glass"] .focus-mask-frame {
          border-color: rgba(255, 255, 255, 0.4);
          box-shadow: 0 0 40px rgba(0, 0, 0, 0.3), inset 0 0 0 1px rgba(255, 255, 255, 0.1);
        }

        #rain-canvas {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 2;
          opacity: 0.8;
          display: block; /* 控制显隐 */
        }

        .focus-shell.rain-off #rain-canvas {
          display: none;
        }

        .focus-shell[data-theme="light"] #rain-canvas {
          opacity: 0.12;
          filter: none;
        }

        .focus-shell[data-theme="dark"] #rain-canvas {
          opacity: 0.18;
          filter: drop-shadow(0 0 5px rgba(81, 180, 255, 0.22));
        }

        .focus-toolbar {
          position: sticky;
          top: 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 24px;
          backdrop-filter: blur(20px) saturate(180%);
          background: var(--focus-toolbar-bg);
          border-bottom: 1px solid var(--focus-toolbar-border);
          z-index: 100;
        }

        .focus-toolbar strong {
          font-size: 14px;
          font-weight: 800;
          letter-spacing: 0.12em;
          color: #00ffa3;
          text-shadow: 0 0 15px rgba(0, 255, 163, 0.3);
        }

        .focus-shell[data-theme="light"] .focus-toolbar strong {
          color: #153453;
          text-shadow: none;
        }

        .focus-button {
          border: 0;
          border-radius: 999px;
          padding: 8px 18px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          color: var(--focus-button-text);
          background: var(--focus-button-bg);
          box-shadow: 0 4px 15px rgba(0, 255, 163, 0.2);
          transition: all 0.2s ease;
        }

        .focus-button.secondary {
          background: var(--focus-button-secondary-bg);
          color: var(--focus-text);
          border: 1px solid var(--focus-button-secondary-border);
          backdrop-filter: blur(10px);
          margin-right: 6px;
        }

        .focus-content {
          position: relative;
          z-index: 5;
          max-width: 820px;
          margin: 0 auto;
          padding: 100px 32px 180px;
          line-height: 2.1;
          font-size: 21px;
          box-sizing: border-box;
        }

        .focus-stage {
          position: relative;
          z-index: 5;
        }

        .focus-title {
          margin: 0 0 42px;
          color: var(--focus-text);
          font-size: clamp(34px, 4vw, 54px);
          line-height: 1.35;
          font-weight: 850;
          letter-spacing: -0.03em;
        }

        .focus-body {
          color: var(--focus-text);
        }

        .focus-body h2 {
          margin: 54px 0 20px;
          color: var(--focus-text);
          font-size: 28px;
          line-height: 1.45;
          font-weight: 800;
          letter-spacing: -0.015em;
        }

        .focus-body p,
        .focus-body li,
        .focus-body blockquote,
        .focus-body pre {
          color: var(--focus-text);
          text-shadow: none;
        }

        .focus-body p {
          margin: 0 0 24px;
        }

        .focus-body ul {
          margin: 0 0 28px;
          padding-left: 1.35em;
        }

        .focus-body blockquote {
          margin: 32px 0;
          padding: 18px 22px;
          border-left: 4px solid rgba(0, 255, 163, 0.44);
          background: rgba(255, 255, 255, 0.04);
          border-radius: 16px;
        }

        .focus-body pre {
          margin: 28px 0;
          padding: 18px 20px;
          overflow: auto;
          border-radius: 16px;
          background: var(--focus-pre-bg);
          white-space: pre-wrap;
        }

        .focus-shell[data-theme="light"] .focus-content,
        .focus-shell[data-theme="dark"] .focus-content {
          max-width: none;
          margin: 0;
          padding: 0;
          border-radius: 0;
          background: transparent;
          border: 0;
          box-shadow: none;
        }

        .focus-shell[data-theme="light"] .focus-title,
        .focus-shell[data-theme="light"] .focus-body,
        .focus-shell[data-theme="light"] .focus-body * {
          color: #17211d !important;
          -webkit-text-fill-color: #17211d;
          text-shadow: none !important;
        }

        .focus-shell[data-theme="light"] .focus-body blockquote {
          background: rgba(0, 77, 64, 0.05);
          border-left-color: rgba(0, 115, 91, 0.42);
        }

        .focus-meta,
        .focus-tags,
        .focus-aside {
          display: none;
        }

        .focus-shell[data-theme="light"] .focus-toolbar,
        .focus-shell[data-theme="dark"] .focus-toolbar {
          position: sticky;
          top: 0;
          max-width: 1180px;
          margin: 10px auto 0;
          padding: 28px 44px 10px;
          background: transparent;
          border-bottom: 0;
          backdrop-filter: none;
          justify-content: flex-end;
        }

        .focus-shell[data-theme="light"] .focus-actions,
        .focus-shell[data-theme="dark"] .focus-actions {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .focus-shell[data-theme="light"] .focus-button,
        .focus-shell[data-theme="dark"] .focus-button {
          min-width: 46px;
          height: 46px;
          padding: 0 18px;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.52);
          color: #173957;
          border: 1px solid rgba(255, 255, 255, 0.78);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.9),
            0 12px 26px rgba(81, 129, 168, 0.14);
          backdrop-filter: blur(18px) saturate(160%);
        }

        .focus-shell[data-theme="dark"] .focus-button {
          background: rgba(9, 24, 38, 0.72);
          color: #cde7ff;
          border-color: rgba(119, 190, 255, 0.18);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.08),
            0 12px 30px rgba(0, 0, 0, 0.28);
        }

        .focus-shell[data-theme="light"] .focus-button[data-action="exit"] {
          background: linear-gradient(135deg, #34e2d0, #08bfae);
          color: #073533;
          border-color: rgba(255, 255, 255, 0.72);
        }

        .focus-shell[data-theme="dark"] .focus-button[data-action="exit"] {
          background: linear-gradient(135deg, #1ff2dc, #18bfe3);
          color: #03161d;
          border-color: rgba(255, 255, 255, 0.18);
        }

        .focus-shell[data-theme="light"] .focus-stage,
        .focus-shell[data-theme="dark"] .focus-stage {
          max-width: 1180px;
          min-height: calc(100vh - 116px);
          margin: 0 auto 34px;
          padding: 72px 42px 46px;
          display: grid;
          grid-template-columns: minmax(0, 1fr) 300px;
          gap: 56px;
          border-radius: 34px;
          background:
            radial-gradient(circle at 78% 12%, rgba(255, 255, 255, 0.92), transparent 26%),
            radial-gradient(circle at 18% 86%, rgba(255, 255, 255, 0.68), transparent 32%),
            linear-gradient(135deg, rgba(255, 255, 255, 0.38), rgba(217, 239, 255, 0.34));
          border: 1px solid rgba(255, 255, 255, 0.82);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.92),
            0 28px 80px rgba(72, 119, 158, 0.20);
          backdrop-filter: blur(28px) saturate(165%);
          box-sizing: border-box;
        }

        .focus-shell[data-theme="dark"] .focus-stage {
          background:
            radial-gradient(circle at 82% 12%, rgba(46, 147, 255, 0.16), transparent 26%),
            linear-gradient(135deg, rgba(8, 25, 39, 0.62), rgba(3, 10, 16, 0.42));
          border-color: rgba(120, 190, 255, 0.18);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.08),
            0 30px 86px rgba(0, 0, 0, 0.42);
        }

        .focus-shell[data-theme="light"] .focus-title,
        .focus-shell[data-theme="dark"] .focus-title {
          max-width: 760px;
          margin-bottom: 22px;
          color: #0f2c4f !important;
          -webkit-text-fill-color: #0f2c4f;
          font-size: clamp(34px, 4.2vw, 52px);
          line-height: 1.35;
          letter-spacing: -0.04em;
        }

        .focus-shell[data-theme="dark"] .focus-title {
          color: #edf7ff !important;
          -webkit-text-fill-color: #edf7ff;
          text-shadow: 0 10px 36px rgba(90, 170, 255, 0.18);
        }

        .focus-shell[data-theme="light"] .focus-meta,
        .focus-shell[data-theme="dark"] .focus-meta {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 12px;
          margin: 0 0 40px;
          color: #7b91a8;
          font-size: 14px;
          font-weight: 700;
        }

        .focus-shell[data-theme="dark"] .focus-meta {
          color: #8da7bd;
        }

        .focus-shell[data-theme="light"] .focus-meta-dot,
        .focus-shell[data-theme="dark"] .focus-meta-dot {
          width: 12px;
          height: 12px;
          border-radius: 999px;
          background: radial-gradient(circle at 35% 35%, #ffffff 0 20%, #43c6ff 22% 100%);
          box-shadow: 0 0 0 4px rgba(67, 198, 255, 0.16);
        }

        .focus-shell[data-theme="dark"] .focus-meta-dot {
          background: radial-gradient(circle at 35% 35%, #ffffff 0 18%, #30b7ff 20% 100%);
          box-shadow: 0 0 0 4px rgba(48, 183, 255, 0.12);
        }

        .focus-shell[data-theme="light"] .focus-body,
        .focus-shell[data-theme="dark"] .focus-body {
          max-width: 760px;
          color: #263f56;
          font-size: 20px;
          line-height: 2.05;
        }

        .focus-shell[data-theme="dark"] .focus-body {
          color: #a9bdcf;
        }

        .focus-shell[data-theme="light"] .focus-body h2 {
          color: #153453 !important;
          -webkit-text-fill-color: #153453;
        }

        .focus-shell[data-theme="dark"] .focus-body h2 {
          color: #e8f5ff !important;
          -webkit-text-fill-color: #e8f5ff;
        }

        .focus-shell[data-theme="light"] .focus-body p,
        .focus-shell[data-theme="light"] .focus-body li {
          color: #304a61 !important;
          -webkit-text-fill-color: #304a61;
        }

        .focus-shell[data-theme="dark"] .focus-body p,
        .focus-shell[data-theme="dark"] .focus-body li {
          color: #9fb3c4 !important;
          -webkit-text-fill-color: #9fb3c4;
        }

        .focus-shell[data-theme="light"] .focus-tags,
        .focus-shell[data-theme="dark"] .focus-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin: 44px 0 24px;
        }

        .focus-shell[data-theme="light"] .focus-tags span,
        .focus-shell[data-theme="dark"] .focus-tags span {
          padding: 8px 14px;
          border-radius: 12px;
          color: #42627c;
          font-size: 13px;
          font-weight: 700;
          background: rgba(255, 255, 255, 0.46);
          border: 1px solid rgba(255, 255, 255, 0.76);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72);
        }

        .focus-shell[data-theme="dark"] .focus-tags span {
          color: #9ec1dd;
          background: rgba(37, 91, 130, 0.24);
          border-color: rgba(105, 176, 234, 0.18);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
        }

        .focus-shell[data-theme="light"] .focus-aside,
        .focus-shell[data-theme="dark"] .focus-aside {
          display: grid;
          align-content: start;
          gap: 16px;
        }

        .focus-shell[data-theme="light"] .focus-side-card,
        .focus-shell[data-theme="dark"] .focus-side-card {
          padding: 24px;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.42);
          border: 1px solid rgba(255, 255, 255, 0.72);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.86),
            0 18px 42px rgba(74, 119, 153, 0.14);
          backdrop-filter: blur(22px) saturate(165%);
        }

        .focus-shell[data-theme="dark"] .focus-side-card {
          background:
            radial-gradient(circle at 100% 0%, rgba(39, 149, 255, 0.20), transparent 34%),
            rgba(7, 21, 34, 0.58);
          border-color: rgba(105, 176, 234, 0.18);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.08),
            0 18px 48px rgba(0, 0, 0, 0.34),
            0 0 0 1px rgba(58, 164, 255, 0.04);
        }

        .focus-shell[data-theme="light"] .focus-side-card h3,
        .focus-shell[data-theme="dark"] .focus-side-card h3 {
          margin: 0 0 16px;
          color: #173957;
          font-size: 17px;
          line-height: 1.4;
        }

        .focus-shell[data-theme="dark"] .focus-side-card h3 {
          color: #e7f5ff;
        }

        .focus-shell[data-theme="light"] .focus-side-card p,
        .focus-shell[data-theme="dark"] .focus-side-card p {
          margin: 0;
          color: #405f78;
          font-size: 14px;
          line-height: 1.9;
        }

        .focus-shell[data-theme="dark"] .focus-side-card p {
          color: #9db9d0;
        }

        .focus-shell[data-theme="light"] .focus-key-list,
        .focus-shell[data-theme="dark"] .focus-key-list {
          display: grid;
          gap: 16px;
          margin: 0;
          padding: 0;
          list-style: none;
        }

        .focus-shell[data-theme="light"] .focus-key-list li,
        .focus-shell[data-theme="dark"] .focus-key-list li {
          display: grid;
          grid-template-columns: 34px minmax(0, 1fr);
          gap: 12px;
          align-items: start;
        }

        .focus-shell[data-theme="light"] .focus-key-icon,
        .focus-shell[data-theme="dark"] .focus-key-icon {
          width: 34px;
          height: 34px;
          display: grid;
          place-items: center;
          border-radius: 999px;
          background: linear-gradient(135deg, #dff4ff, #b7e6ff);
          color: #1675ad;
          font-size: 13px;
          font-weight: 900;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.88);
        }

        .focus-shell[data-theme="dark"] .focus-key-icon {
          background: linear-gradient(135deg, rgba(51, 147, 255, 0.34), rgba(18, 112, 214, 0.44));
          color: #bde3ff;
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.10),
            0 0 22px rgba(36, 144, 255, 0.12);
        }

        .focus-shell[data-theme="light"] .focus-key-list p,
        .focus-shell[data-theme="dark"] .focus-key-list p {
          margin: 0;
          color: #405f78;
          font-size: 13px;
          line-height: 1.65;
          font-weight: 650;
        }

        .focus-shell[data-theme="light"] .focus-key-list strong,
        .focus-shell[data-theme="dark"] .focus-key-list strong {
          display: block;
          margin-bottom: 4px;
          color: #173957;
          font-size: 13px;
          line-height: 1.45;
          font-weight: 850;
        }

        .focus-shell[data-theme="light"] .focus-key-list p span,
        .focus-shell[data-theme="dark"] .focus-key-list p span {
          display: block;
        }

        .focus-shell[data-theme="dark"] .focus-key-list p {
          color: #a4bfd6;
        }

        .focus-shell[data-theme="dark"] .focus-key-list strong {
          color: #e7f5ff;
        }

        @media (max-width: 980px) {
          .focus-shell[data-theme="light"] .focus-stage,
          .focus-shell[data-theme="dark"] .focus-stage {
            grid-template-columns: 1fr;
            margin: 0 14px 24px;
            padding: 48px 24px;
          }

          .focus-shell[data-theme="light"] .focus-aside,
          .focus-shell[data-theme="dark"] .focus-aside {
            grid-row: auto;
          }
        }

        .focus-title,
        .focus-body,
        .focus-body * {
          cursor: text;
          user-select: text;
          -webkit-user-select: text;
        }

        .focus-toolbar,
        .focus-toolbar *,
        .focus-selection-action {
          cursor: pointer;
          user-select: none;
          -webkit-user-select: none;
        }

        .focus-mask-layer {
          position: fixed;
          inset: 0;
          z-index: 35;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.3s ease;
        }

        .focus-mask-pane {
          position: absolute;
          background: rgba(4, 8, 12, 0.9);
          backdrop-filter: blur(4px);
          pointer-events: none;
        }

        .focus-shell[data-theme="light"] .focus-mask-pane {
          background: rgba(244, 247, 245, 0.58);
          backdrop-filter: blur(2px);
        }

        .focus-mask-frame {
          position: absolute;
          z-index: 36;
          border-radius: 24px;
          border: 1.5px solid rgba(0, 255, 163, 0.45);
          box-shadow:
            0 24px 70px rgba(0, 0, 0, 0.45),
            0 0 0 1px rgba(0, 255, 163, 0.1);
          pointer-events: none;
          opacity: 0;
        }

        .focus-shell[data-theme="light"] .focus-mask-frame {
          border-color: rgba(0, 156, 106, 0.4);
          box-shadow:
            0 24px 70px rgba(7, 32, 25, 0.15),
            0 0 0 1px rgba(0, 156, 106, 0.08);
        }

        .focus-shell.line-focus-active .focus-mask-layer,
        .focus-shell.line-focus-active .focus-mask-frame {
          opacity: 1;
        }

        /* 聚焦时的极致遮罩层效果 */
        .focus-shell.line-focus-active .focus-title,
        .focus-shell.line-focus-active .focus-body > * {
          opacity: 0.98;
          filter: none;
          transform: none;
          pointer-events: auto;
          transition: opacity 0.22s ease;
        }

        /* 浅色模式下的遮罩层要稍微深一点，方便对比 */
        .focus-shell[data-theme="light"].line-focus-active .focus-title,
        .focus-shell[data-theme="light"].line-focus-active .focus-body > * {
          opacity: 1;
        }

        /* 正在阅读的行：像聚光灯一样亮起 */
        .focus-shell.line-focus-active .line-focus-keep {
          opacity: 1 !important;
          filter: none !important;
          transform: none !important;
          position: relative;
          z-index: 40;
          pointer-events: auto !important;
        }

        /* 点击穿透遮罩层：只有选中的区域可以交互 */

        /* 聚焦区块的氛围背景 */
        .focus-body.line-focus-active > .line-focus-keep::before {
          content: "";
          position: absolute;
          inset: -10px -18px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.02);
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
          z-index: -1;
          pointer-events: none;
        }

        .focus-shell[data-theme="light"] .focus-body.line-focus-active > .line-focus-keep::before {
          background: rgba(255, 255, 255, 0.84);
          box-shadow:
            0 16px 38px rgba(19, 39, 33, 0.10),
            inset 0 0 0 1px rgba(0, 115, 91, 0.10);
        }

        .focus-selection-action {
          position: absolute;
          z-index: 3000;
          border: 0;
          border-radius: 999px;
          padding: 14px 28px;
          background: #fff;
          color: #000;
          font-size: 14px;
          font-weight: 800;
          box-shadow: 0 30px 60px rgba(0,0,0,0.5);
          cursor: pointer;
          animation: actionPop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
      </style>
      <div class="focus-shell" data-theme="${currentTheme}">
        <canvas id="rain-canvas"></canvas>
        <div class="focus-toolbar">
          <div class="focus-actions">
            <button class="focus-button secondary focus-line-reset" type="button" data-action="clear-line-focus" style="display:none;">退出聚焦</button>
            <button class="focus-button secondary" type="button" data-action="theme">${currentTheme === "dark" ? "浅色模式" : "深色模式"}</button>
            <button class="focus-button" type="button" data-action="exit">退出</button>
          </div>
        </div>
        <div class="focus-mask-layer" aria-hidden="true">
          <div class="focus-mask-pane" data-pane="top"></div>
          <div class="focus-mask-pane" data-pane="right"></div>
          <div class="focus-mask-pane" data-pane="bottom"></div>
          <div class="focus-mask-pane" data-pane="left"></div>
          <div class="focus-mask-frame"></div>
        </div>
        <div class="focus-stage">
          <main class="focus-content">
            <h1 class="focus-title">${escapeHtml(content.title)}</h1>
            <div class="focus-meta">
              <span class="focus-meta-dot"></span>
              <span>${escapeHtml(location.hostname || "当前页面")}</span>
              <span>·</span>
              <span>${content.readMinutes || 1} 分钟阅读</span>
            </div>
            <div class="focus-body">${content.html}</div>
            <div class="focus-tags">${focusTagsHtml}</div>
          </main>
          <aside class="focus-aside" aria-label="文章辅助信息">
            <section class="focus-side-card">
              <h3>文章摘要</h3>
              <p>${escapeHtml(content.summary || content.title)}</p>
            </section>
            <section class="focus-side-card">
              <h3>关键要点</h3>
              <ul class="focus-key-list">
                ${focusKeyPointsHtml || `<li><span class="focus-key-icon">1</span><p>${escapeHtml(content.title)}</p></li>`}
              </ul>
            </section>
          </aside>
        </div>
      </div>
    `;

    const shellEl = shadow.querySelector(".focus-shell");
    const focusBodyEl = shadow.querySelector(".focus-body");
    const lineResetButtonEl = shadow.querySelector(".focus-line-reset");
    const themeToggleButtonEl = shadow.querySelector('[data-action="theme"]');
    const maskFrameEl = shadow.querySelector(".focus-mask-frame");
    const maskPanes = {
      top: shadow.querySelector('.focus-mask-pane[data-pane="top"]'),
      right: shadow.querySelector('.focus-mask-pane[data-pane="right"]'),
      bottom: shadow.querySelector('.focus-mask-pane[data-pane="bottom"]'),
      left: shadow.querySelector('.focus-mask-pane[data-pane="left"]')
    };
    const canvas = shadow.querySelector("#rain-canvas");
    let selectionActionButton = null;
    let rainAnimationId = null;
    let rainEnabled = true;
    let lineFocusKeepers = [];
    let isPointerSelecting = false;
    let selectionAutoScrollSpeed = 0;
    let selectionAutoScrollRaf = null;

    const stopSelectionAutoScroll = () => {
      selectionAutoScrollSpeed = 0;
      if (selectionAutoScrollRaf) {
        cancelAnimationFrame(selectionAutoScrollRaf);
        selectionAutoScrollRaf = null;
      }
    };

    const runSelectionAutoScroll = () => {
      if (!(shellEl instanceof HTMLElement) || !isPointerSelecting || !selectionAutoScrollSpeed) {
        selectionAutoScrollRaf = null;
        return;
      }
      shellEl.scrollTop += selectionAutoScrollSpeed;
      selectionAutoScrollRaf = requestAnimationFrame(runSelectionAutoScroll);
    };

    const updateSelectionAutoScroll = (clientY) => {
      if (!(shellEl instanceof HTMLElement) || !isPointerSelecting) {
        stopSelectionAutoScroll();
        return;
      }

      const shellRect = shellEl.getBoundingClientRect();
      const edgeThreshold = Math.min(120, Math.max(72, shellRect.height * 0.14));
      const maxSpeed = 22;
      let nextSpeed = 0;

      if (clientY < shellRect.top + edgeThreshold) {
        const ratio = Math.min(1, (shellRect.top + edgeThreshold - clientY) / edgeThreshold);
        nextSpeed = -Math.max(6, ratio * maxSpeed);
      } else if (clientY > shellRect.bottom - edgeThreshold) {
        const ratio = Math.min(1, (clientY - (shellRect.bottom - edgeThreshold)) / edgeThreshold);
        nextSpeed = Math.max(6, ratio * maxSpeed);
      }

      selectionAutoScrollSpeed = nextSpeed;
      if (selectionAutoScrollSpeed && !selectionAutoScrollRaf) {
        selectionAutoScrollRaf = requestAnimationFrame(runSelectionAutoScroll);
      } else if (!selectionAutoScrollSpeed) {
        stopSelectionAutoScroll();
      }
    };

    if (canvas instanceof HTMLCanvasElement) {
      const ctx = canvas.getContext("2d");
      let w, h;
      let raindrops = [];
      const initRain = () => {
        w = canvas.width = window.innerWidth;
        h = canvas.height = window.innerHeight;
        raindrops = [];
        for (let i = 0; i < 140; i++) {
          raindrops.push({
            x: Math.random() * w, y: Math.random() * h,
            l: Math.random() * 30 + 20, s: Math.random() * 15 + 10, o: Math.random() * 0.4 + 0.1
          });
        }
      };
      const drawRain = () => {
        if (!ctx || !rainEnabled) return;
        ctx.clearRect(0, 0, w, h);
        ctx.lineWidth = 1.5; ctx.lineCap = "round";
        raindrops.forEach(p => {
          ctx.strokeStyle = state.focusMode.theme === "dark"
            ? `rgba(180, 210, 255, ${p.o})`
            : `rgba(0, 50, 100, ${p.o * 0.4})`;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.s * 0.05, p.y + p.l); ctx.stroke();
          p.y += p.s; p.x += p.s * 0.05;
          if (p.y > h) { p.y = -p.l; p.x = Math.random() * w; }
        });
        rainAnimationId = requestAnimationFrame(drawRain);
      };
      window.addEventListener("resize", initRain);
      initRain();
      drawRain();
    }

    if (themeToggleButtonEl instanceof HTMLElement) {
      themeToggleButtonEl.textContent = currentTheme === "dark" ? "浅色模式" : "深色模式";
    }

    const clearSelectionActionButton = () => {
      if (selectionActionButton?.isConnected) selectionActionButton.remove();
      selectionActionButton = null;
    };

    const setMaskPaneRect = (pane, rect) => {
      if (!(pane instanceof HTMLElement)) {
        return;
      }
      pane.style.left = `${Math.max(0, rect.left)}px`;
      pane.style.top = `${Math.max(0, rect.top)}px`;
      pane.style.width = `${Math.max(0, rect.width)}px`;
      pane.style.height = `${Math.max(0, rect.height)}px`;
    };

    const updateLineFocusMask = () => {
      if (!(shellEl instanceof HTMLElement) || !(maskFrameEl instanceof HTMLElement) || !lineFocusKeepers.length) {
        return;
      }

      const validRects = lineFocusKeepers
        .filter((node) => node instanceof HTMLElement && node.isConnected)
        .map((node) => node.getBoundingClientRect())
        .filter((rect) => rect.width > 0 && rect.height > 0);

      if (!validRects.length) {
        return;
      }

      const shellRect = shellEl.getBoundingClientRect();
      const paddingX = 32;
      const paddingY = 18;
      const top = Math.max(0, Math.min(...validRects.map((rect) => rect.top)) - shellRect.top - paddingY);
      const bottom = Math.min(shellRect.height, Math.max(...validRects.map((rect) => rect.bottom)) - shellRect.top + paddingY);
      const left = Math.max(0, Math.min(...validRects.map((rect) => rect.left)) - shellRect.left - paddingX);
      const right = Math.min(shellRect.width, Math.max(...validRects.map((rect) => rect.right)) - shellRect.left + paddingX);

      setMaskPaneRect(maskPanes.top, { left: 0, top: 0, width: shellRect.width, height: top });
      setMaskPaneRect(maskPanes.bottom, { left: 0, top: bottom, width: shellRect.width, height: shellRect.height - bottom });
      setMaskPaneRect(maskPanes.left, { left: 0, top, width: left, height: bottom - top });
      setMaskPaneRect(maskPanes.right, { left: right, top, width: shellRect.width - right, height: bottom - top });

      maskFrameEl.style.left = `${left}px`;
      maskFrameEl.style.top = `${top}px`;
      maskFrameEl.style.width = `${Math.max(0, right - left)}px`;
      maskFrameEl.style.height = `${Math.max(0, bottom - top)}px`;
    };

    const clearLineFocus = () => {
      if (!(focusBodyEl instanceof HTMLElement) || !shellEl) return;
      shellEl.classList.remove("has-focus-mask");
      shellEl.classList.remove("line-focus-active");
      focusBodyEl.classList.remove("line-focus-active");
      focusBodyEl.querySelectorAll(".line-focus-keep").forEach(el => el.classList.remove("line-focus-keep"));
      lineFocusKeepers = [];
      if (maskFrameEl instanceof HTMLElement) {
        maskFrameEl.style.left = "0px";
        maskFrameEl.style.top = "0px";
        maskFrameEl.style.width = "0px";
        maskFrameEl.style.height = "0px";
      }
      if (lineResetButtonEl instanceof HTMLElement) lineResetButtonEl.style.display = "none";
    };

    const applyLineFocus = () => {
      const selection = shadow.getSelection ? shadow.getSelection() : window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed || !(focusBodyEl instanceof HTMLElement) || !shellEl) return;
      const range = selection.getRangeAt(0);
      const selectedRect = range.getBoundingClientRect();
      const expandedRect = { left: selectedRect.left - 5, top: selectedRect.top - 5, right: selectedRect.right + 5, bottom: selectedRect.bottom + 5 };
      const keepers = Array.from(focusBodyEl.children).filter(block => {
        if (!(block instanceof HTMLElement)) return false;
        return rectsIntersect(expandedRect, block.getBoundingClientRect());
      });
      if (!keepers.length) return;
      clearLineFocus();
      shellEl.classList.add("has-focus-mask");
      shellEl.classList.add("line-focus-active");
      focusBodyEl.classList.add("line-focus-active");
      keepers.forEach(block => block.classList.add("line-focus-keep"));
      lineFocusKeepers = keepers;
      updateLineFocusMask();
      if (lineResetButtonEl instanceof HTMLElement) lineResetButtonEl.style.display = "inline-flex";
      clearSelectionActionButton();
      selection.removeAllRanges();
      keepers[0].scrollIntoView({ behavior: "smooth", block: "center" });
    };

    const updateSelectionAction = () => {
      clearSelectionActionButton();
      const selection = shadow.getSelection ? shadow.getSelection() : window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed || !(focusBodyEl instanceof HTMLElement)) return;
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      selectionActionButton = document.createElement("button");
      selectionActionButton.className = "focus-selection-action";
      selectionActionButton.textContent = "聚焦阅读";
      const shellRect = shellEl.getBoundingClientRect();
      selectionActionButton.style.top = `${rect.top - shellRect.top + shellEl.scrollTop - 64}px`;
      selectionActionButton.style.left = `${rect.left - shellRect.left + (rect.width/2 - 50)}px`;
      selectionActionButton.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); applyLineFocus(); });
      shellEl.appendChild(selectionActionButton);
    };

    shadow.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const action = target.getAttribute("data-action");
      if (action === "theme") {
        const themes = ["dark", "light"];
        const currentIndex = themes.indexOf(state.focusMode.theme === "light" ? "light" : "dark");
        const nextTheme = themes[(currentIndex + 1) % themes.length];
        state.focusMode.theme = nextTheme;
        
        if (shellEl instanceof HTMLElement) shellEl.dataset.theme = nextTheme;
        
        target.textContent = nextTheme === "dark" ? "浅色模式" : "深色模式";
        return;
      } else if (action === "rain") {
        rainEnabled = !rainEnabled;
        if (shellEl instanceof HTMLElement) shellEl.classList.toggle("rain-off", !rainEnabled);
        target.textContent = rainEnabled ? "雨效：开" : "雨效：关";
        return;
      } else if (action === "clear-line-focus") {
        clearLineFocus(); return;
      } else if (action === "exit") {
        deactivateFocusMode(); return;
      }

      if (focusBodyEl && focusBodyEl.classList.contains("line-focus-active")) {
        const isKeep = target.closest(".line-focus-keep");
        const isAction = target.closest(".focus-toolbar, .focus-selection-action");
        if (!isKeep && !isAction) {
          const selection = shadow.getSelection ? shadow.getSelection() : window.getSelection();
          if (!selection || selection.isCollapsed) clearLineFocus();
        }
      }
    });

    const handleSelectionChange = () => requestAnimationFrame(updateSelectionAction);
    const handleFocusWheel = (event) => {
      if (!(shellEl instanceof HTMLElement) || event.ctrlKey) {
        return;
      }
      const deltaUnit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? shellEl.clientHeight : 1;
      shellEl.scrollTop += event.deltaY * deltaUnit;
      event.preventDefault();
      event.stopPropagation();
    };

    const handlePointerMove = (event) => {
      if (!isPointerSelecting) {
        return;
      }
      updateSelectionAutoScroll(event.clientY);
    };
    const handlePointerDown = (e) => {
      isPointerSelecting = true;
      if (e.target instanceof HTMLElement && e.target.closest(".focus-selection-action")) return;
      clearSelectionActionButton();
    };
    const handlePointerUp = () => {
      isPointerSelecting = false;
      stopSelectionAutoScroll();
    };
    const handlePointerLeave = () => {
      if (!isPointerSelecting) {
        stopSelectionAutoScroll();
      }
    };

    shadow.addEventListener("mouseup", handleSelectionChange);
    document.addEventListener("selectionchange", handleSelectionChange);
    shadow.addEventListener("mousemove", handlePointerMove);
    shadow.addEventListener("mousedown", handlePointerDown);
    shadow.addEventListener("mouseup", handlePointerUp);
    shadow.addEventListener("mouseleave", handlePointerLeave);
    window.addEventListener("mouseup", handlePointerUp);

    shellEl?.addEventListener("wheel", handleFocusWheel, { passive: false });
    shellEl?.addEventListener("scroll", () => clearSelectionActionButton(), { passive: true });
    shellEl?.addEventListener("scroll", updateLineFocusMask, { passive: true });
    window.addEventListener("resize", updateLineFocusMask);

    host.__cleanup = () => {
      if (rainAnimationId) cancelAnimationFrame(rainAnimationId);
      stopSelectionAutoScroll();
      isPointerSelecting = false;
      clearSelectionActionButton();
      document.removeEventListener("selectionchange", handleSelectionChange);
      shadow.removeEventListener("mouseup", handleSelectionChange);
      shadow.removeEventListener("mousemove", handlePointerMove);
      shadow.removeEventListener("mousedown", handlePointerDown);
      shadow.removeEventListener("mouseup", handlePointerUp);
      shadow.removeEventListener("mouseleave", handlePointerLeave);
      shellEl?.removeEventListener("wheel", handleFocusWheel);
      window.removeEventListener("mouseup", handlePointerUp);
      window.removeEventListener("resize", updateLineFocusMask);
    };

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

    const handleMouseUp = async (event) => {
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

    if (state.loading) {
      return;
    }

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

    const handleMouseUp = async (event) => {
      if (!dragging) {
        return;
      }
      dragging = false;
      const rect = normalizeFocusRect(startX, startY, event.clientX, event.clientY);
      if (rect.width < 36 || rect.height < 36) {
        cleanupFocusSelection();
        return;
      }

      cleanupFocusSelection();
      try {
        setLoading(true);
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const clipboardDataUrl = await captureSelectionAttachment(rect, "image/png");
        await setAttachmentFromDataUrl(clipboardDataUrl, "框选截图.png");
        await copyImageDataUrlToClipboard(clipboardDataUrl);
        showFloatingNotice("已复制截图，可直接粘贴");
        openPanel(true);
        inputEl.focus();
      } catch (error) {
        showFloatingNotice(error instanceof Error ? error.message : "框选截图失败，请稍后重试", true);
      } finally {
        setLoading(false);
      }
      event.preventDefault();
      return;

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
    state.settingsLoaded = true;
    setSettingsStatus("配置已从本地存储加载", { includeStorageState: true });
    renderHistory();
    renderQuickPrompts(QUICK_PROMPTS);
    updatePageChip(getSnapshot());
    queueAiTimelineRefresh(true);
    setLoading(false);
  }

  function shouldAutoSaveSettings() {
    return state.settingsLoaded && !state.hydratingSettingsForm && !state.pageUnloading;
  }

  function autoSaveSettings() {
    if (!shouldAutoSaveSettings()) {
      return;
    }
    setSettingsStatus("正在写入本地存储…");
    saveSettings({ collapseAfterSave: false }).then((saved) => {
      if (saved) {
        setSettingsStatus("本地存储写入成功", { includeStorageState: true });
      }
    });
  }

  async function saveSettings({ collapseAfterSave = true } = {}) {
    settingsStatusEl.textContent = "正在保存…";
    const payload = {
      remoteEnabled: true,
      trialEnabled: true,
      fallbackToLocal: true,
      trialApiUrl: settingsFormEls.trialApiUrl.value.trim(),
      apiUrl: settingsFormEls.apiUrl.value.trim() || "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
      model: getActiveModel(),
      apiKey: settingsFormEls.apiKey.value.trim(),
      aiTimelineEnabled: Boolean(settingsFormEls.aiTimelineEnabled.checked),
      allowedHosts: parseAllowedHosts(settingsFormEls.allowedHosts.value)
    };

    try {
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
      queueAiTimelineRefresh(true);
      settingsStatusEl.textContent = state.siteEnabled
        ? formatTrialStatus(state.settings)
        : "已保存，但当前网站还没被启用。";

      if (collapseAfterSave) {
        window.setTimeout(() => toggleSettings(false), 500);
      }

      return true;
    } catch (err) {
      settingsStatusEl.textContent = `保存失败：${err.message || "请求超时"}`;
      return false;
    }
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
    const progressCard = createProgressCard({
      title: "UI 规范提取中",
      steps: progressSteps,
      initialPercent: 5,
      eyebrow: "UI Spec"
    });

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
    progressCard.update(1, 20);

    try {
      // Step 1: 采集样式
      const computedStyles = extractComputedStyles();
      progressCard.update(2, 35);

      // Step 2: 模拟进度推进（实际等待 API）
      const progressTimer = window.setInterval(() => {
        const bar = progressCard.card.querySelector(".semrush-coach-progress-bar");
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
      progressCard.update(3, 95);

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
      progressCard.remove();
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
    const previousFormDisplay = formEl.style.display;
    formEl.style.display = "none";

    startToolTaskMessage("📄 生成当前网页的产品需求文档 (PRD)");

    const progressSteps = [
      "📸 正在抓取页面结构与截图…",
      "🤖 正在调用 AI 模型深层提取特征…",
      "📝 正在整理 PRD 文档…"
    ];
    const progressCard = createProgressCard({
      title: "产品需求文档生成中",
      steps: progressSteps,
      initialPercent: 5,
      eyebrow: "PRD"
    });

    let screenshotData = null;
    try {
      const captureRes = await chrome.runtime.sendMessage({ type: "SEMRUSH_COACH_CAPTURE_TAB" });
      if (captureRes?.ok && captureRes.dataUrl) {
        screenshotData = await compressImage(captureRes.dataUrl, 1200, 0.7);
      }
    } catch (e) {
      console.warn("截屏失败:", e);
    }
    
    progressCard.update(1, 15);

    let progressTimer;
    try {
      progressTimer = window.setInterval(() => {
        const progressBar = progressCard.card.querySelector(".semrush-coach-progress-bar");
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
      progressCard.update(2, 98);

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
      progressCard.remove();
      formEl.style.display = previousFormDisplay;
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
    const previousFormDisplay = formEl.style.display;
    formEl.style.display = "none";

    if (generateSummaryButtonEl) {
      generateSummaryButtonEl.disabled = true;
      generateSummaryButtonEl.textContent = "总结中…";
    }

    startToolTaskMessage("🧠 请帮我总结当前页面并同步生成脑图");

    const progressSteps = [
      "正在滚动采样页面内容…",
      "正在提取整页要点、列表和表格…",
      "正在调用 AI 生成总结与脑图…",
      "正在整理结果…"
    ];

    const progressCard = createProgressCard({
      title: "页面总结与脑图生成中",
      steps: progressSteps,
      initialPercent: 8,
      eyebrow: "Summary"
    });

    let screenshotData = null;
    let summarySource = null;
    let progressTimer;

    try {
      summarySource = await collectScrollablePageSummarySource();
      progressCard.update(1, 28);

      try {
        const captureRes = await chrome.runtime.sendMessage({ type: "SEMRUSH_COACH_CAPTURE_TAB" });
        if (captureRes?.ok && captureRes.dataUrl) {
          screenshotData = await compressImage(captureRes.dataUrl, 1200, 0.7);
        }
      } catch (e) {
        console.warn("页面总结截图失败:", e);
      }

      progressCard.update(2, 44);
      progressTimer = window.setInterval(() => {
        const progressBar = progressCard.card.querySelector(".semrush-coach-progress-bar");
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
      progressCard.update(3, 98);

      if (!response?.ok) {
        throw new Error(response?.error || "插件后台请求失败");
      }

      const data = response.data || {};
      const summaryMarkdown = String(data.summaryMarkdown || "").trim();
      const mindmapMermaid = String(data.mindmapMermaid || "").trim();
      applyUsageMeta(data.usageMeta);

      let summaryEntryIndex = -1;
      if (summaryMarkdown) {
        const summaryEntry = await revealAssistantMessage({
          pageSummary: data.pageSummary || `页面总结 · ${snapshot.title || snapshot.url}`,
          answer: summaryMarkdown,
          suggestedNextSteps: [],
          confidence: 0.94,
          elementHints: []
        });
        summaryEntryIndex = state.history.indexOf(summaryEntry);
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
      if (summaryEntryIndex >= 0) {
        scrollHistoryToIndex(summaryEntryIndex, "start");
      }
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
      progressCard.remove();
      setLoading(false);
      formEl.style.display = previousFormDisplay;
      if (generateSummaryButtonEl) {
        generateSummaryButtonEl.disabled = false;
        generateSummaryButtonEl.textContent = "总结";
      }
    }
  }

  async function comparePageWithUrl(options = {}) {
    const rawTargetUrls = getCompareTargetUrls(options);
    if (!rawTargetUrls.length) {
      updateCompareHelper("至少填 1 个竞品链接。当前页默认已经算 1 个，不用重复填。", true);
      getEnabledCompareUrlInputs()[0]?.focus();
      return;
    }

    const normalizedTargetUrls = [];
    const seen = new Set([window.location.href]);
    for (const rawUrl of rawTargetUrls) {
      let normalizedUrl = rawUrl;
      try {
        normalizedUrl = new URL(rawUrl, window.location.href).href;
      } catch {
        updateCompareHelper(`链接格式不对：${rawUrl}`, true);
        state.history.push({
          role: "assistant",
          pageSummary: "竞品链接无效",
          answer: `这个链接格式不太对：${rawUrl}。先给我完整 URL，我再继续做竞品对比。`,
          suggestedNextSteps: ["例如：https://example.com/page-b"],
          confidence: 0.4,
          elementHints: []
        });
        renderHistory();
        openPanel(true);
        return;
      }

      if (seen.has(normalizedUrl)) {
        continue;
      }
      seen.add(normalizedUrl);
      normalizedTargetUrls.push(normalizedUrl);
    }

    if (!normalizedTargetUrls.length) {
      updateCompareHelper("你填的链接和当前页重复了，换 1 个新的竞品链接就行。", true);
      state.history.push({
        role: "assistant",
        pageSummary: "竞品链接重复",
        answer: "当前页默认已经算一个竞品了，不用再把当前页链接贴进来。你补 1 到 3 个其他竞品链接就行。",
        suggestedNextSteps: ["补一个新的竞品链接", "或者带入右侧标签页再试"],
        confidence: 0.42,
        elementHints: []
      });
      renderHistory();
      openPanel(true);
      return;
    }

    const focus = String(options.focus || compareFocusInputEl?.value || DEFAULT_COMPARE_FOCUS).trim();
    closeCompareModal();
    const snapshot = getSnapshot();
    updatePageChip(snapshot);
    setLoading(true);

    const progressCard = createProgressCard({
      title: "竞品对比分析中",
      steps: [
        "正在采集当前页结构与正文样本…",
        "正在打开竞品页并抓取上下文…",
        "正在生成多竞品分析报告…"
      ],
      initialPercent: 10,
      eyebrow: "Page Diff"
    });

    let currentScreenshot = null;
    let progressTimer = null;
    try {
      const currentSummarySource = await collectScrollablePageSummarySource();
      progressCard.update(1, 34);

      try {
        const captureRes = await chrome.runtime.sendMessage({ type: "SEMRUSH_COACH_CAPTURE_TAB" });
        if (captureRes?.ok && captureRes.dataUrl) {
          currentScreenshot = { dataUrl: captureRes.dataUrl };
        }
      } catch (error) {
        console.warn("竞品对比截图失败:", error);
      }

      progressTimer = window.setInterval(() => {
        const progressBar = progressCard.card.querySelector(".semrush-coach-progress-bar");
        const current = parseFloat(progressBar?.style.width || "34") || 34;
        if (current < 90 && progressBar) {
          progressBar.style.width = `${Math.min(current + 1.2, 90)}%`;
        }
      }, 900);

      const response = await chrome.runtime.sendMessage({
        type: "SEMRUSH_COACH_COMPARE_PAGE",
        payload: {
          targetUrls: normalizedTargetUrls,
          focus,
          currentScreenshot,
          currentPage: {
            pageSnapshot: snapshot,
            summarySource: currentSummarySource
          }
        }
      });

      window.clearInterval(progressTimer);
      progressCard.update(2, 98);

      if (!response?.ok) {
        throw new Error(response?.error || "竞品对比失败");
      }

      const diffData = response.data || {};
      state.history.push({
        role: "assistant",
        pageSummary: diffData.pageSummary || `竞品对比 · ${snapshot.title || "当前页"}`,
        answer: diffData.answer || "已完成竞品对比，但模型没有返回可展示内容。",
        comparisonTables: normalizeComparisonTables(diffData.comparisonTables),
        renderAsComparison: true,
        suggestedNextSteps: diffData.suggestedNextSteps || [],
        confidence: Number(diffData.confidence) || 0.84,
        elementHints: []
      });
      renderHistory();
      openPanel(true);
    } catch (error) {
      state.history.push({
        role: "assistant",
        pageSummary: "竞品对比失败",
        answer: error instanceof Error ? error.message : "竞品对比失败，请稍后再试。",
        suggestedNextSteps: ["确认目标链接可以正常打开", "检查远程模型配置是否可用"],
        confidence: 0.32,
        elementHints: []
      });
      renderHistory();
      openPanel(true);
    } finally {
      window.clearInterval(progressTimer);
      progressCard.remove();
      setLoading(false);
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
    const questionProgressCard = createProgressCard({
      title: "正在生成回答",
      steps: questionProgressSteps,
      initialPercent: 12,
      eyebrow: "AI Reasoning"
    });
    const updateQuestionProgress = (step, percent) => {
      questionProgressCard.update(step, percent);
    };
    updateQuestionProgress(0, 12);
    const questionProgressTimer = window.setInterval(() => {
      const questionProgressBar = questionProgressCard.card.querySelector(".semrush-coach-progress-bar");
      const current = parseFloat(questionProgressBar?.style.width || "12") || 12;
      if (current < 91 && questionProgressBar) {
        const next = current < 40 ? current + 3.4 : current < 72 ? current + 1.6 : current + 0.7;
        questionProgressBar.style.width = `${Math.min(next, 91)}%`;
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
  projectAssessmentCloseEl?.addEventListener("click", closeProjectAssessmentModal);
  projectAssessmentCancelEl?.addEventListener("click", closeProjectAssessmentModal);
  projectAssessmentBackdropEl?.addEventListener("click", closeProjectAssessmentModal);
  projectAssessmentSubmitEl?.addEventListener("click", runProjectAssessment);
  apiKeyHelpTriggerEl?.addEventListener("click", openApiKeyHelpModal);
  apiKeyHelpCloseEl?.addEventListener("click", closeApiKeyHelpModal);
  apiKeyHelpBackdropEl?.addEventListener("click", closeApiKeyHelpModal);
  mindmapModalCloseEl?.addEventListener("click", closeMindmapModal);
  compareModalCloseEl?.addEventListener("click", closeCompareModal);
  compareReportModalCloseEl?.addEventListener("click", closeCompareReportModal);
  assessmentReportModalCloseEl?.addEventListener("click", closeAssessmentReportModal);
  assessmentReportModalEl?.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.classList.contains("semrush-coach-assessment-report-modal-backdrop")) {
      closeAssessmentReportModal();
    }
  });
  assessmentReportExportButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (!activeAssessmentReportPayload) return;
      if (button.getAttribute("data-export") === "word") {
        exportAssessmentReportAsWord(activeAssessmentReportPayload, activeAssessmentReportTitle);
      }
    });
  });
  compareReportExportButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (!activeCompareReportPayload) {
        return;
      }
      try {
        const format = button.getAttribute("data-export");
        if (format === "pdf") {
          exportCompareReportAsPdf(activeCompareReportPayload);
        } else if (format === "word") {
          exportCompareReportAsWord(activeCompareReportPayload);
        }
      } catch (error) {
        updateCompareHelper(error instanceof Error ? error.message : "导出失败，请稍后再试。", true);
      }
    });
  });
  mindmapModalEl?.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.classList.contains("semrush-coach-mindmap-modal-backdrop")) {
      closeMindmapModal();
    }
  });
  compareModalEl?.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.classList.contains("semrush-coach-compare-modal-backdrop")) {
      closeCompareModal();
    }
  });
  compareReportModalEl?.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.classList.contains("semrush-coach-compare-report-modal-backdrop")) {
      closeCompareReportModal();
    }
  });
  settingsToggleEl.addEventListener("click", () => {
    toggleSettings(!state.settingsOpen);
    openPanel(true);
  });
  saveSettingsEl.addEventListener("click", () => {
    setSettingsStatus("正在写入本地存储…");
    saveSettings().then((saved) => {
      if (saved) {
        setSettingsStatus("本地存储写入成功", { includeStorageState: true });
      }
    });
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
  selectionCaptureButtonEl.addEventListener("click", () => {
    startSelectionAnalysis();
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
    } else if (tool === "compare-page") {
      openCompareModal();
    } else if (tool === "long-screenshot") {
      captureLongScreenshot();
    } else if (tool === "page-qr") {
      createPageQrCode();
    } else if (tool === "markdown") {
      formatInputAsMarkdown();
    } else if (tool === "extract-ui") {
      extractUISpec();
    } else if (tool === "generate-prd") {
      generatePRD();
    } else if (tool === "project-assessment") {
      openProjectAssessmentModal();
    }
  });

  aiTimelineEl?.addEventListener("mouseover", (event) => {
    const match = getAiTimelineEventTarget(event.target);
    if (match?.item?.preview) {
      showAiTimelinePreview(match.item.preview, match.anchorEl);
    }
  });

  aiTimelineEl?.addEventListener("mouseout", (event) => {
    if (!getAiTimelineEventTarget(event.target)) {
      return;
    }
    hideAiTimelinePreview();
  });

  aiTimelineEl?.addEventListener("focusin", (event) => {
    const match = getAiTimelineEventTarget(event.target);
    if (match?.item?.preview) {
      showAiTimelinePreview(match.item.preview, match.anchorEl);
    }
  });

  aiTimelineEl?.addEventListener("focusout", hideAiTimelinePreview);

  aiTimelineEl?.addEventListener("click", (event) => {
    const match = getAiTimelineEventTarget(event.target);
    if (match?.item?.element instanceof HTMLElement) {
      setAiTimelineActiveIndex(match.index, 1200);
      updateAiTimelineActiveState();
      match.item.element.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      updateAiTimelineActiveState();
    }
  });

  aiTimelineEl?.addEventListener("dblclick", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const keywordEl = target.closest(".semrush-coach-ai-timeline-keyword");
    if (!(keywordEl instanceof HTMLElement)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const index = Number(keywordEl.getAttribute("data-index"));
    if (!Number.isFinite(index) || index < 0) {
      return;
    }

    const marked = toggleAiTimelineMarked(index);
    keywordEl.classList.toggle("is-marked", marked);
  });

  window.addEventListener("scroll", () => {
    updateAiTimelineActiveState();
  }, { passive: true });

  window.addEventListener("resize", () => {
    queueAiTimelineRefresh(true);
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

  compareUseNextEl?.addEventListener("click", async () => {
    updateCompareHelper("正在读取右侧标签页…");
    try {
      const response = await chrome.runtime.sendMessage({ type: "SEMRUSH_COACH_GET_NEXT_TAB" });
      if (!response?.ok) {
        throw new Error(response?.error || "右侧标签页不可用");
      }
      const targetInput = getEnabledCompareUrlInputs().find((input) => !String(input.value || "").trim()) || getEnabledCompareUrlInputs()[0];
      if (targetInput instanceof HTMLInputElement) {
        targetInput.value = response.data?.url || "";
      }
      updateCompareHelper(response.data?.title ? `已带入：${response.data.title}` : "已带入右侧标签页");
    } catch (error) {
      updateCompareHelper(error instanceof Error ? error.message : "右侧标签页不可用", true);
    }
  });

  compareSubmitEl?.addEventListener("click", () => {
    comparePageWithUrl();
  });
  getEnabledCompareUrlInputs().forEach((input) => {
    input.addEventListener("input", () => updateCompareHelper(""));
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        comparePageWithUrl();
      }
    });
  });
  compareFocusInputEl?.addEventListener("input", () => updateCompareHelper(""));
  compareFocusInputEl?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      comparePageWithUrl();
    }
  });

  focusModeButtonEl.addEventListener("click", () => {
    toggleFocusMode();
  });

  providerSelectEl.addEventListener("change", (e) => {
    updateProviderUI(e.target.value);
    autoSaveSettings();
  });

  modelSelectEl.addEventListener("change", (e) => {
    handleModelSelectChange(e);
    autoSaveSettings();
  });

  settingsFormEls.apiKey.addEventListener("change", () => {
    autoSaveSettings();
  });
  settingsFormEls.apiKey.addEventListener("blur", () => {
    autoSaveSettings();
  });
  
  const togglePasswordBtn = root.querySelector(".semrush-coach-toggle-password");
  if (togglePasswordBtn) {
    togglePasswordBtn.addEventListener("click", () => {
      const isMasked = settingsFormEls.apiKey.classList.contains("semrush-coach-masked-input");
      settingsFormEls.apiKey.classList.toggle("semrush-coach-masked-input", !isMasked);
      togglePasswordBtn.textContent = isMasked ? "🙈" : "👁️";
    });
  }

  settingsFormEls.apiUrl.addEventListener("change", () => autoSaveSettings());
  settingsFormEls.modelInput.addEventListener("change", () => autoSaveSettings());
  settingsFormEls.aiTimelineEnabled.addEventListener("change", () => autoSaveSettings());

  window.addEventListener("beforeunload", () => {
    state.pageUnloading = true;
  });
  window.addEventListener("pagehide", () => {
    state.pageUnloading = true;
  });

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

    const compareOpenBtn = target.closest(".semrush-coach-compare-open-btn");
    if (compareOpenBtn) {
      openCompareReportModal(compareOpenBtn.getAttribute("data-report") || "");
      return;
    }
    const assessmentOpenBtn = target.closest(".semrush-coach-assessment-open-btn");
    if (assessmentOpenBtn) {
      openAssessmentReportModal(assessmentOpenBtn.getAttribute("data-answer") || "", assessmentOpenBtn.getAttribute("data-title") || "");
      return;
    }

    const qrActionBtn = target.closest(".semrush-coach-qr-action");
    if (qrActionBtn instanceof HTMLElement) {
      const action = qrActionBtn.getAttribute("data-qr-action");
      if (action === "copy-link") {
        const targetUrl = qrActionBtn.getAttribute("data-url") || "";
        try {
          await navigator.clipboard.writeText(targetUrl);
          showFloatingNotice("已复制链接");
        } catch (error) {
          showFloatingNotice("复制链接失败，请稍后重试", true);
        }
      } else if (action === "download") {
        const imageUrl = qrActionBtn.getAttribute("data-url") || "";
        const filename = qrActionBtn.getAttribute("data-filename") || "网页二维码.png";
        if (imageUrl) {
          const link = document.createElement("a");
          link.href = imageUrl;
          link.download = filename;
          link.target = "_blank";
          document.body.appendChild(link);
          link.click();
          link.remove();
        }
      }
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

  observeAiTimelineMutations();

  window.setInterval(() => {
    if (window.location.href !== state.lastUrl) {
      state.lastUrl = window.location.href;
      const snapshot = getSnapshot();
      updatePageChip(snapshot);
      queueAiTimelineRefresh(true);
      if (!state.history.length) {
        renderHistory();
      }
      return;
    }
  }, 1200);

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "SEMRUSH_COACH_TOGGLE_PANEL") {
      if (state.open) {
        closePanel();
      } else {
        openPanel(!state.siteEnabled);
      }
      sendResponse({ ok: true });
      return true;
    }

    if (message?.type !== "SEMRUSH_COACH_COLLECT_PAGE_CONTEXT") {
      return false;
    }


    (async () => {
      try {
        const pageSnapshot = getSnapshot();
        const summarySource = await collectScrollablePageSummarySource();
        sendResponse({
          ok: true,
          data: {
            pageSnapshot,
            summarySource
          }
        });
      } catch (error) {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "无法采集当前页内容"
        });
      }
    
})();

    return true;
  });

  function openProjectAssessmentModal() {
    if (projectAssessmentModalEl) {
      projectAssessmentModalEl.classList.remove("semrush-coach-hidden");
      projectAssessmentModalEl.setAttribute("aria-hidden", "false");
      projectAssessmentInputEl.value = "";
      setTimeout(() => projectAssessmentInputEl.focus(), 100);
      closeToolsMenu();
    }
  }
  function closeProjectAssessmentModal() {
    if (projectAssessmentModalEl) {
      projectAssessmentModalEl.classList.add("semrush-coach-hidden");
      projectAssessmentModalEl.setAttribute("aria-hidden", "true");
    }
  }

  function openApiKeyHelpModal() {
    if (!apiKeyHelpModalEl) {
      return;
    }
    console.log("[AI Coach] 打开 API Key 获取说明弹窗");
    apiKeyHelpModalEl.classList.remove("semrush-coach-hidden");
    apiKeyHelpModalEl.setAttribute("aria-hidden", "false");
  }

  function closeApiKeyHelpModal() {
    if (!apiKeyHelpModalEl) {
      return;
    }
    apiKeyHelpModalEl.classList.add("semrush-coach-hidden");
    apiKeyHelpModalEl.setAttribute("aria-hidden", "true");
  }

  async function runProjectAssessment() {
    const requirement = projectAssessmentInputEl.value;
    if (!requirement || !requirement.trim()) {
      projectAssessmentInputEl.focus();
      return;
    }
    
    closeProjectAssessmentModal();

    if (!hasConfiguredRemoteAccess()) {
      state.history.push({
        role: "assistant",
        pageSummary: "提示",
        answer: "使用项目评估功能需要配置你自己的 API Key。",
        suggestedNextSteps: ["点击「体验 / API 设置」"],
        confidence: 0.9,
        elementHints: []
      });
      renderHistory();
      openPanel(true);
      return;
    }

    setLoading(true);
    openPanel(true);
    const previousFormDisplay = formEl.style.display;
    formEl.style.display = "none";

    startToolTaskMessage("项目评估：\n" + requirement.trim());

    const progressSteps = [
      "⏳ 正在分析需求逻辑与技术可行性...",
      "🧠 正在推演业务闭环...",
      "📄 正在生成功能清单..."
    ];
    const progressCard = createProgressCard({
      title: "需求评估中",
      steps: progressSteps,
      initialPercent: 5,
      eyebrow: "项目评估"
    });

    progressCard.update(1, 40);

    let progressTimer;
    try {
      progressTimer = window.setInterval(() => {
        const progressBar = progressCard.card.querySelector(".semrush-coach-progress-bar");
        if (progressBar) {
          const cur = parseFloat(progressBar.style.width) || 40;
          if (cur < 98) progressBar.style.width = (cur + 0.8) + "%";
        }
      }, 500);

      const response = await chrome.runtime.sendMessage({
        type: "SEMRUSH_COACH_PROJECT_ASSESSMENT",
        payload: { requirement: requirement.trim() }
      });

      if (!response?.ok) {
        throw new Error(response?.error || "AI 服务异常");
      }

      progressCard.update(3, 100);
      await wait(400);

      state.history.push({
        role: "assistant",
        pageSummary: response.data.pageSummary || "项目评估方案",
        renderAsAssessment: true,
        answer: response.data.answer || "评估已完成。",
        suggestedNextSteps: response.data.suggestedNextSteps || ["如果你想了解某一块的更多细节，可以继续问我。"],
        confidence: response.data.confidence || 0.9,
        elementHints: [],
        usageMeta: response.meta?.usageMeta || response.data?.usageMeta
      });

    } catch (error) {
      state.history.push({
        role: "assistant",
        pageSummary: "评估失败",
        answer: "抱歉，生成评估报告时出现问题：\n" + (error instanceof Error ? error.message : "未知错误"),
        suggestedNextSteps: ["请稍后再试"],
        confidence: 0,
        elementHints: []
      });
    } finally {
      window.clearInterval(progressTimer);
      if (progressCard.card.parentNode) {
        progressCard.card.remove();
      }
      setLoading(false);
      formEl.style.display = previousFormDisplay;
      renderHistory();
      scrollHistoryToBottom();
    }
  }


  function openAssessmentReportModal(markdown, title) {
    if (!assessmentReportModalEl || !assessmentReportModalBodyEl) return;
    activeAssessmentReportPayload = markdown;
    activeAssessmentReportTitle = title;
    assessmentReportModalEl.querySelector(".semrush-coach-assessment-report-modal-title").textContent = title || "项目评估报告";
    assessmentReportModalBodyEl.innerHTML = renderMarkdownContent(markdown);
    assessmentReportModalBodyEl.scrollTop = 0;
    assessmentReportModalEl.classList.remove("semrush-coach-hidden");
    assessmentReportModalEl.setAttribute("aria-hidden", "false");
  }

  function closeAssessmentReportModal() {
    if (!assessmentReportModalEl) return;
    assessmentReportModalEl.classList.add("semrush-coach-hidden");
    assessmentReportModalEl.setAttribute("aria-hidden", "true");
  }

  function exportAssessmentReportAsWord(markdown, title) {
    const htmlContent = renderMarkdownContent(markdown);
    const docHtml = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head>
          <meta charset="utf-8">
          <title>${escapeHtml(title)}</title>
          <style>
            body { font-family: "Microsoft YaHei", sans-serif; font-size: 11pt; color: #333; line-height: 1.5; }
            h1, h2, h3, h4 { color: #000; font-family: "Microsoft YaHei", sans-serif; }
            h1 { font-size: 16pt; margin-bottom: 12pt; border-bottom: 2px solid #000; padding-bottom: 4px; }
            h2 { font-size: 14pt; margin-top: 18pt; margin-bottom: 8pt; color: #17211d; }
            h3 { font-size: 12pt; margin-top: 14pt; margin-bottom: 6pt; }
            p { margin: 0 0 10pt 0; }
            ul, ol { margin: 0 0 10pt 0; padding-left: 20pt; }
            li { margin-bottom: 4pt; }
            table { border-collapse: collapse; width: 100%; margin-bottom: 14pt; }
            th, td { border: 1px solid #777; padding: 6pt 8pt; text-align: left; }
            th { background-color: #f0f0f0; font-weight: bold; }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(title)}</h1>
          ${htmlContent}
        </body>
      </html>
    `;
    const blob = new Blob([docHtml], { type: "application/msword;charset=utf-8" });
    const filename = `${title || "项目评估报告"}_${new Date().toISOString().slice(0, 10)}.doc`;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  }

  renderHistory();
  renderAttachment();
  renderQuickPrompts(QUICK_PROMPTS);
  updatePageChip(getSnapshot());
  loadSettings().catch(() => {
    fillSettingsForm();
    state.settingsLoaded = true;
    setSettingsStatus("配置加载失败，当前显示的是默认值。");
    renderHistory();
    queueAiTimelineRefresh(true);
  });

})();
