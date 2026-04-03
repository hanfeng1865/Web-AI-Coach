export const QUICK_PROMPTS = [
  "这个页面怎么用？",
  "我现在该先点哪里？",
  "这几个入口有什么区别？",
  "如果我要完成这件事，下一步是什么？"
];

export const SUPPORTED_SITES = [
  {
    id: "semrush",
    name: "SEMrush",
    hostPatterns: [/\.semrush\.com$/i, /\.semrush\.com\.cn$/i, /^sem\.3ue\.co$/i, /\.3ue\.co$/i]
  },
  {
    id: "polymarket",
    name: "Polymarket",
    hostPatterns: [/^polymarket\.com$/i, /^www\.polymarket\.com$/i, /\.polymarket\.com$/i]
  }
];

export const SUPPORTED_HOST_PATTERNS = SUPPORTED_SITES.flatMap((site) => site.hostPatterns);

export const UNSUPPORTED_MESSAGE =
  "当前页面暂不在支持范围内。现在这版插件只会在已接入的网站里解释当前页面、入口用途和下一步操作。";

export const MODULE_KNOWLEDGE = {
  semrush: {
    "本地": {
      aliases: ["local", "本地", "本地seo", "本地搜索"],
      purpose: "查看本地商家可见度、本地排名和门店相关的 SEO 情况。",
      nextStep: "先进入“本地”模块，再选择地区、门店或关键词范围。"
    },
    "AI 可见度": {
      aliases: ["ai visibility", "ai可见度", "可见度"],
      purpose: "观察品牌在 ChatGPT、Google AI Mode 等 AI 搜索场景里的曝光情况。",
      nextStep: "先看品牌或站点被提及的情况，再决定补哪些内容或权威页面。"
    },
    "AI PR": {
      aliases: ["ai pr", "aipr", "pr"],
      purpose: "看品牌在 AI 语境里的提及、曝光和媒体背书机会。",
      nextStep: "先看品牌提及和缺口，再决定补品牌页、媒体稿还是第三方背书。"
    },
    "流量与市场": {
      aliases: ["traffic", "market", "流量", "市场", "竞争"],
      purpose: "看竞争对手的流量来源、渠道结构和市场机会。",
      nextStep: "先输入自己或竞品域名，再看渠道和增长来源。"
    },
    "内容": {
      aliases: ["content", "内容", "内容seo"],
      purpose: "做内容规划、选题、SEO 内容创作和内容优化。",
      nextStep: "如果你要做内容 SEO，通常可以先进入“内容”模块。"
    },
    "文件夹": {
      aliases: ["folder", "project", "文件夹", "项目"],
      purpose: "按站点或项目组织任务，是一个管理入口。",
      nextStep: "先创建或进入项目，再继续查看 SEO、内容或广告模块。"
    },
    "SEO": {
      aliases: ["seo"],
      purpose: "进入关键词、站点诊断、反链和优化等 SEO 工作流。",
      nextStep: "如果还不确定要用哪个工具，可以先从 SEO 一级入口开始。"
    },
    "广告": {
      aliases: ["ads", "advertising", "广告"],
      purpose: "处理投放、广告素材和广告渠道相关工作。",
      nextStep: "如果你的目标是自然流量或内容 SEO，通常不建议先从这里开始。"
    },
    "Copilot AI": {
      aliases: ["copilot", "copilot ai"],
      purpose: "给出推荐路径，帮助你更快决定下一步该去哪个模块。",
      nextStep: "可以先看推荐方向，再进入对应模块继续操作。"
    }
  },
  polymarket: {
    Markets: {
      aliases: ["markets", "market", "预测市场", "discover"],
      purpose: "浏览和筛选可交易的预测市场，决定你要关注哪一个事件。",
      nextStep: "先选你真正关心的话题，再进入具体市场页看 YES/NO 合约和价格。"
    },
    Portfolio: {
      aliases: ["portfolio", "持仓", "资产", "组合", "仓位"],
      purpose: "查看你当前持有的仓位、盈亏和组合表现。",
      nextStep: "先确认你是要看总体表现，还是要检查某个仓位的风险和收益。"
    },
    Activity: {
      aliases: ["activity", "历史", "记录", "活动"],
      purpose: "查看你的交易、成交和账户活动记录。",
      nextStep: "先定位你想核对的时间段或那笔交易，再看成交和变动细节。"
    },
    Rewards: {
      aliases: ["rewards", "积分", "奖励", "激励"],
      purpose: "查看平台奖励、活动激励或相关资格信息。",
      nextStep: "先确认当前活动规则，再看自己是否满足参与条件。"
    },
    Trade: {
      aliases: ["trade", "交易", "买入", "卖出", "yes", "no"],
      purpose: "进入具体市场后买入或卖出某个结果合约。",
      nextStep: "先看事件规则和结算条件，再决定买 YES 还是买 NO。"
    },
    Positions: {
      aliases: ["positions", "position", "仓位", "头寸"],
      purpose: "查看当前市场里的持仓分布和每个结果的风险暴露。",
      nextStep: "先确认自己持有的是哪一边，再看成本、当前价格和退出机会。"
    }
  }
};

export const PAGE_KIND_GUIDE = {
  semrush: {
    login: {
      summary: "这是 SEMrush 的登录或权限页。"
    },
    home: {
      summary: "这是 SEMrush 首页，重点是让你从不同工作流入口开始，而不是直接给出单一分析结果。",
      nextSteps: [
        "如果你要做内容 SEO，优先看“内容”。",
        "如果你想看竞品流量和市场机会，优先看“流量与市场”。",
        "如果你还不确定从哪里开始，可以先看 SEO 一级入口或 Copilot AI。"
      ]
    },
    keywords: {
      summary: "这是关键词相关页面，适合做关键词研究、难度判断、主题扩展和内容选题。",
      nextSteps: [
        "先确认关键词或域名输入是否正确。",
        "再判断你是要做新内容，还是验证已有内容覆盖。"
      ]
    },
    competitive: {
      summary: "这是竞争分析或流量页面，更适合看竞品来源、渠道结构和市场机会。",
      nextSteps: [
        "先输入自己或竞品的域名。",
        "然后再看渠道、页面和增长来源。"
      ]
    },
    content: {
      summary: "这是内容相关页面，适合把关键词机会落到文章、专题页和优化动作。",
      nextSteps: [
        "先明确主题和内容目标。",
        "再看相关关键词和内容机会。"
      ]
    },
    folders: {
      summary: "这是项目或文件夹页面，主要用于组织站点和任务，不是单个分析功能本身。",
      nextSteps: [
        "先进入项目，再查看具体功能。",
        "如果只是想弄懂工具路径，可以先看项目下的一层入口。"
      ]
    },
    navigation: {
      summary: "这是以导航入口为主的页面，适合先明确目标，再决定从哪个入口进入。",
      nextSteps: [
        "做内容就偏向“内容”。",
        "做竞品研究就偏向“流量与市场”。",
        "做常规 SEO 就从“SEO”入口开始。"
      ]
    },
    generic: {
      summary: "这是 SEMrush 的常规功能页，我会根据当前能看到的模块来解释页面在做什么。",
      nextSteps: [
        "你可以直接问某个模块是做什么的。",
        "也可以直接告诉我你的目标，我会给你下一步建议。"
      ]
    }
  },
  polymarket: {
    login: {
      summary: "这是 Polymarket 的登录、连接钱包或权限确认页面。"
    },
    home: {
      summary: "这是 Polymarket 的市场浏览页，重点是先找到你想关注的事件或市场。",
      nextSteps: [
        "先按话题或分类筛选市场。",
        "再进入具体事件页看 YES/NO 合约和价格。"
      ]
    },
    market: {
      summary: "这是 Polymarket 的具体市场页，通常会展示事件规则、YES/NO 结果、概率和交易入口。",
      nextSteps: [
        "先看清楚事件规则和结算条件。",
        "再判断你要买 YES、买 NO，还是先继续观察。"
      ]
    },
    portfolio: {
      summary: "这是 Polymarket 的持仓或组合页，重点是查看你的仓位、盈亏和风险暴露。",
      nextSteps: [
        "先确认你要看总览，还是某一笔仓位。",
        "再看成本、当前价格和可退出位置。"
      ]
    },
    activity: {
      summary: "这是 Polymarket 的活动或历史页，更适合核对成交、交易记录和账户变化。",
      nextSteps: [
        "先定位时间段或那笔交易。",
        "再看具体成交和状态变化。"
      ]
    },
    rewards: {
      summary: "这是 Polymarket 的奖励或活动页，重点是查看激励规则和参与条件。",
      nextSteps: [
        "先确认当前活动规则。",
        "再看自己是否满足资格。"
      ]
    },
    navigation: {
      summary: "这是以导航入口为主的页面，适合先明确你是想找市场、看持仓还是核对记录。",
      nextSteps: [
        "找新机会就先看 Markets。",
        "看自己当前仓位就去 Portfolio。",
        "核对记录就看 Activity。"
      ]
    },
    generic: {
      summary: "这是 Polymarket 的常规页面，我会根据当前可见模块帮你判断页面用途和下一步操作。",
      nextSteps: [
        "你可以直接问这个页面现在是做什么的。",
        "也可以直接说你想完成什么操作，我来告诉你往哪走。"
      ]
    }
  }
};

export function getSiteDefinition(url) {
  try {
    const hostname = new URL(url).hostname;
    return (
      SUPPORTED_SITES.find((site) => site.hostPatterns.some((pattern) => pattern.test(hostname))) || null
    );
  } catch {
    return null;
  }
}

export function getSiteIdFromUrl(url) {
  return getSiteDefinition(url)?.id || "";
}

export function getSiteNameFromUrl(url) {
  return getSiteDefinition(url)?.name || "";
}

export function getModulesForSite(siteId) {
  return MODULE_KNOWLEDGE[siteId] || {};
}

export function getPageGuide(siteId, pageKind) {
  return PAGE_KIND_GUIDE[siteId]?.[pageKind] || PAGE_KIND_GUIDE[siteId]?.generic || {
    summary: "这是当前网站的页面。",
    nextSteps: []
  };
}
