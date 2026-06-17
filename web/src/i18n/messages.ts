export type Locale = "zh" | "en";

export type MessageValue = string | { one: string; other: string };

export type MessageDictionary = Record<string, MessageValue>;

export const messages: Record<Locale, MessageDictionary> = {
  zh: {
    "app.title": "测试运行记录",
    "app.loading": "正在加载运行记录…",
    "app.errorPrefix": "错误: {message}",
    "app.noRuns": "未找到测试运行记录",

    "dashboard.label": "运行仪表盘",
    "dashboard.summary": "运行摘要",
    "dashboard.totalRuns": "运行总数",
    "dashboard.verifierFailures": "验证失败",
    "dashboard.totalIssues": "问题总数",
    "dashboard.averageSkepticScore": "平均质疑分数",
    "dashboard.runsList": "运行列表",
    "dashboard.runsHelp": "选择一条运行记录查看审计、报告和预览。",
    "dashboard.runCount": {
      one: "{count} 条运行",
      other: "{count} 条运行",
    },

    "runTable.name": "名称",
    "runTable.model": "模型",
    "runTable.generatedAt": "生成时间",
    "runTable.verifier": "验证器",
    "runTable.claims": "声明",
    "runTable.skepticScore": "质疑分数",
    "runTable.issues": "问题数",

    "badge.pass": "通过",
    "badge.fail": "失败",

    "detail.back": "← 返回运行列表",
    "detail.loading": "正在加载运行详情…",
    "detail.errorPrefix": "加载运行详情出错: {message}",

    "tab.audit": "审计视图",
    "tab.reports": "报告",
    "tab.preview": "预览与追踪",

    "audit.evidenceSummary": "证据摘要",
    "audit.evidenceExcerpts": "证据摘录",
    "audit.claims": "声明",
    "audit.noClaims": "未提取到声明。",
    "audit.confidence": "置信度",
    "audit.claimCount": {
      one: "{count} 条声明",
      other: "{count} 条声明",
    },
    "audit.dimensionCount": {
      one: "{count} 个维度",
      other: "{count} 个维度",
    },
    "audit.claimsInDimension": {
      one: "{count} 条",
      other: "{count} 条",
    },
    "audit.missingEvidence": "缺失证据: {ref}",
    "audit.skepticIssue": {
      one: "{count} 个质疑问题",
      other: "{count} 个质疑问题",
    },

    "evidence.loadFailed": "加载证据失败: {status}",
    "evidence.loadFailedGeneric": "加载证据失败",
    "evidence.show": "展开",
    "evidence.hide": "收起",
    "evidence.loading": "加载中…",

    "preview.skillTitle": "SKILL.md 预览",
    "preview.noSkill": "此运行没有可用的 SKILL.md。",
    "preview.tracesTitle": "LLM 追踪",
    "preview.noTraces": "没有记录的 LLM 追踪。",
    "preview.tokens": "tokens",
    "preview.provider": "提供商:",
    "preview.promptTokens": "提示词 tokens:",
    "preview.completionTokens": "补全 tokens:",
    "preview.totalTokens": "总计 tokens:",
    "preview.latency": "延迟:",
    "preview.finishReason": "结束原因:",
    "preview.prompt": "提示词:",

    "reports.skepticTitle": "质疑报告",
    "reports.noSkeptic": "没有可用的质疑报告。",
    "reports.skepticSummary": {
      one: "{claims} 条声明中有 {count} 个问题",
      other: "{claims} 条声明中有 {count} 个问题",
    },
    "reports.noIssues": "未发现问题。",
    "reports.claimLabel": "声明 {id}",
    "reports.suggestion": "建议:",
    "reports.verifierTitle": "验证报告",
    "reports.noVerifier": "没有可用的验证报告。",
    "reports.verifierSummary":
      "已检查 {directives} 条指令 · {verified} 条已验证 · {fabricated} 条为虚构",
    "reports.directive": "指令",
    "reports.claim": "声明",
    "reports.status": "状态",

    "enum.status.verified": "已验证",
    "enum.status.unreferenced": "未引用",
    "enum.status.fabricated": "虚构",
    "enum.severity.high": "高",
    "enum.severity.medium": "中",
    "enum.severity.low": "低",
    "enum.stage.analyst": "分析",
    "enum.stage.skeptic": "质疑",
    "enum.stage.writer": "撰写",
    "enum.stage.verifier": "验证",
    "enum.sourceType.message": "消息",
    "enum.sourceType.tool": "工具",
    "enum.sourceType.step": "步骤",

    "toggle.language": "EN",
  },
  en: {
    "app.title": "Harness Runs",
    "app.loading": "Loading runs…",
    "app.errorPrefix": "Error: {message}",
    "app.noRuns": "No harness runs found",

    "dashboard.label": "Runs dashboard",
    "dashboard.summary": "Run summary",
    "dashboard.totalRuns": "Total runs",
    "dashboard.verifierFailures": "Verifier failures",
    "dashboard.totalIssues": "Total issues",
    "dashboard.averageSkepticScore": "Avg skeptic score",
    "dashboard.runsList": "Runs list",
    "dashboard.runsHelp": "Select a run to inspect audit data, reports, and preview output.",
    "dashboard.runCount": {
      one: "{count} run",
      other: "{count} runs",
    },

    "runTable.name": "Name",
    "runTable.model": "Model",
    "runTable.generatedAt": "Generated At",
    "runTable.verifier": "Verifier",
    "runTable.claims": "Claims",
    "runTable.skepticScore": "Skeptic Score",
    "runTable.issues": "Issues",

    "badge.pass": "PASS",
    "badge.fail": "FAIL",

    "detail.back": "← Back to runs",
    "detail.loading": "Loading run details…",
    "detail.errorPrefix": "Error loading run: {message}",

    "tab.audit": "Audit View",
    "tab.reports": "Reports",
    "tab.preview": "Preview & Traces",

    "audit.evidenceSummary": "Evidence Summary",
    "audit.evidenceExcerpts": "Evidence Excerpts",
    "audit.claims": "Claims",
    "audit.noClaims": "No claims extracted.",
    "audit.confidence": "confidence",
    "audit.claimCount": {
      one: "{count} claim",
      other: "{count} claims",
    },
    "audit.dimensionCount": {
      one: "{count} dimension",
      other: "{count} dimensions",
    },
    "audit.claimsInDimension": {
      one: "{count} claim",
      other: "{count} claims",
    },
    "audit.missingEvidence": "Missing evidence: {ref}",
    "audit.skepticIssue": {
      one: "{count} skeptic issue",
      other: "{count} skeptic issues",
    },

    "evidence.loadFailed": "Failed to load evidence: {status}",
    "evidence.loadFailedGeneric": "Failed to load evidence",
    "evidence.show": "Show",
    "evidence.hide": "Hide",
    "evidence.loading": "Loading…",

    "preview.skillTitle": "SKILL.md Preview",
    "preview.noSkill": "No SKILL.md available for this run.",
    "preview.tracesTitle": "LLM Traces",
    "preview.noTraces": "No LLM traces recorded.",
    "preview.tokens": "tokens",
    "preview.provider": "Provider:",
    "preview.promptTokens": "Prompt tokens:",
    "preview.completionTokens": "Completion tokens:",
    "preview.totalTokens": "Total tokens:",
    "preview.latency": "Latency:",
    "preview.finishReason": "Finish reason:",
    "preview.prompt": "Prompt:",

    "reports.skepticTitle": "Skeptic Report",
    "reports.noSkeptic": "No skeptic report available.",
    "reports.skepticSummary": {
      one: "{count} issue across {claims} claims",
      other: "{count} issues across {claims} claims",
    },
    "reports.noIssues": "No issues found.",
    "reports.claimLabel": "claim {id}",
    "reports.suggestion": "Suggestion:",
    "reports.verifierTitle": "Verifier Report",
    "reports.noVerifier": "No verifier report available.",
    "reports.verifierSummary":
      "{directives} directives checked · {verified} verified · {fabricated} fabricated",
    "reports.directive": "Directive",
    "reports.claim": "Claim",
    "reports.status": "Status",

    "enum.status.verified": "verified",
    "enum.status.unreferenced": "unreferenced",
    "enum.status.fabricated": "fabricated",
    "enum.severity.high": "high",
    "enum.severity.medium": "medium",
    "enum.severity.low": "low",
    "enum.stage.analyst": "analyst",
    "enum.stage.skeptic": "skeptic",
    "enum.stage.writer": "writer",
    "enum.stage.verifier": "verifier",
    "enum.sourceType.message": "message",
    "enum.sourceType.tool": "tool",
    "enum.sourceType.step": "step",

    "toggle.language": "中文",
  },
};
