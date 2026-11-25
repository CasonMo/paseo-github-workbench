import { useEffect, useMemo, useState } from "react";

export type Locale = "zh" | "en";
export type LanguageMode = "auto" | Locale;

const listeners = new Set<() => void>();
let mode: LanguageMode = "auto";
let locale: Locale = resolveLocale("auto");

export function detectSystemLocale(): Locale {
  try {
    const nav = (globalThis as { navigator?: { language?: unknown; languages?: unknown } }).navigator;
    const candidates: string[] = [];
    if (nav && Array.isArray(nav.languages)) for (const item of nav.languages) if (typeof item === "string") candidates.push(item);
    if (nav && typeof nav.language === "string") candidates.push(nav.language);
    try {
      const intl = Intl.DateTimeFormat().resolvedOptions().locale;
      if (intl) candidates.push(intl);
    } catch { /* ignore */ }
    for (const raw of candidates) if (/^zh/i.test(raw)) return "zh";
    for (const raw of candidates) if (/^en/i.test(raw)) return "en";
  } catch { /* ignore */ }
  return "zh";
}

function resolveLocale(next: LanguageMode): Locale {
  return next === "auto" ? detectSystemLocale() : next;
}

export function setLanguageMode(next: LanguageMode): void {
  if (next === mode && resolveLocale(next) === locale) return;
  mode = next;
  locale = resolveLocale(next);
  for (const listener of listeners) listener();
}

export function getLocale(): Locale {
  return locale;
}

const zh = {
  "common.loading": "加载中…",
  "common.retry": "重试",
  "common.refresh": "刷新",
  "common.search": "搜索…",
  "common.noOptions": "无可选项",
  "common.save": "保存",
  "common.saved": "已保存",
  "common.delete": "删除仓库",
  "common.deleted": "已删除",
  "common.add": "添加",
  "common.send": "发送",
  "common.skip": "跳过",
  "common.cancel": "取消",
  "common.enable": "启用",
  "common.on": "开",
  "common.off": "关",
  "common.openGitHub": "在 GitHub 打开",
  "common.openAgent": "打开 Agent",
  "common.dispatch": "派发 Agent",
  "common.redispatch": "重新派发",
  "common.dispatching": "派发中…",
  "common.all": "全部",
  "common.allRepos": "全部仓库",
  "common.allReposLong": "全部仓库（账号名下所有仓库）",
  "common.allStates": "全部状态",
  "common.open": "打开",
  "common.closed": "已关闭",
  "common.selectRepo": "选择 GitHub 仓库",
  "common.selectLabel": "选择触发 label",
  "common.allIssues": "全部新 issue（不限 label）",
  "common.minutes": "{n} 分钟",
  "time.justNow": "刚刚",
  "time.minutesAgo": "{n} 分钟前",
  "time.hoursAgo": "{n} 小时前",
  "time.daysAgo": "{n} 天前",

  "app.title": "GitHub 工作台",
  "sidebar.badgeLabel": "GitHub 工作台，{n} 条未处理",
  "app.ghUnauth": "gh 未认证",
  "app.pollNow": "立即检查",
  "app.stateError": "状态读取失败",
  "tab.board": "看板",
  "tab.runs": "运行",
  "tab.runsAwaiting": "运行 · {n} 待确认",
  "tab.automation": "自动化",
  "lang.label": "语言",
  "lang.auto": "跟随系统",
  "lang.zh": "中文",
  "lang.en": "English",

  "board.searchPlaceholder": "搜索标题 / 仓库 / 编号…",
  "board.readError": "看板读取失败",
  "board.emptyTitle": "没有匹配的 PR / issue",
  "board.emptyDesc": "调整筛选条件，或点击刷新。",
  "board.pr": "PR",
  "board.issue": "Issue",
  "board.dispatchShort": "派发",
  "board.redispatchShort": "重新派发",

  "runs.emptyTitle": "暂无运行记录",
  "runs.emptyDesc": "到看板派发一个 PR / issue，或在自动化页启用监听。",
  "runs.filter.all": "全部",
  "runs.filter.running": "运行中",
  "runs.filter.awaiting": "待确认",
  "runs.filter.done": "已完成",
  "runs.filter.failed": "失败",
  "runs.status.running": "运行中",
  "runs.status.awaiting": "待确认合并",
  "runs.status.done": "已完成",
  "runs.status.failed": "失败",
  "runs.merged": "已合并",
  "runs.commented": "已评论",
  "runs.verdict": "评审结论：{v}",
  "runs.approveMerge": "批准合并",
  "runs.dispatched": "已派发 {target}",
  "runs.mergeOk": "已合并 {target}",
  "runs.autoMergeOk": "已开启自动合并 {target}（等 checks 通过后合）",
  "runs.skipped": "已跳过合并",
  "runs.retried": "已重试 {target}",

  "detail.back": "返回看板",
  "detail.readError": "详情读取失败",
  "detail.checks": "Checks · {n}",
  "detail.fixChecks": "Fix broken checks · {n}",
  "detail.description": "描述",
  "detail.activity": "Activity · {n}",
  "detail.noComments": "暂无评论",
  "detail.commentTitle": "发表评论",
  "detail.commentPlaceholder": "写下评论…",
  "detail.commentSent": "评论已发送",
  "detail.merge": "合并",
  "detail.autoMerge": "自动合并",
  "dispatch.promptLabel": "提示词（可编辑，变量派发时渲染）",

  "auto.intro": "默认已启用「全部仓库」监听：新 PR 自动评审、带 label 的新 issue 自动处理（默认用 Paseo 默认模型，可在仓库卡片自定义派发 agent、模型、思考档位和权限模式；本地仓库自动匹配或 clone）。可展开调整提示词，或添加单仓库做差异化配置。",
  "auto.addTitle": "添加仓库监听",
  "auto.added": "已添加，展开仓库卡片配置流水线",
  "auto.pollInterval": "轮询间隔",
  "auto.everyMinutes": "每 {n} 分钟",
  "auto.prReview": "PR 自动评审",
  "auto.issueHandle": "Issue 自动处理",
  "auto.prSummary": "PR评审{pr} / Issue处理{issue}",
  "auto.promptTemplate": "提示词模板",
  "auto.promptHint": "变量：{{repo}} {{number}} {{title}} {{body}} {{author}} {{url}}",
  "auto.authors": "author 白名单（点选或手填，空 = 不限）",
  "auto.authorsPlaceholder": "留空 = 不限；逗号分隔",
  "auto.commentTemplate": "回写评论模板",
  "auto.commentHint": "{{summary}} {{verdict}} {{comments}}",
  "auto.followUpPrompt": "跟进提示词模板（新评论复用原 agent）",
  "auto.followUpHint": "条目有新评论时追加给原 agent 继续处理；变量：{{repo}} {{number}} {{title}} {{url}} {{comments}}",
  "auto.autoMerge": "评审通过后自动合并（默认需人工确认）",
  "auto.mergeMethod": "合并方式",
  "auto.triggerLabel": "触发 label",
  "auto.agentModel": "派发 Agent / 模型",
  "auto.agentModelDefault": "默认（第一个启用 provider 的默认模型）",
  "auto.agentThinking": "思考档位",
  "auto.agentMode": "权限模式",
  "auto.agentOptionDefault": "默认",
  "auto.agentModeDefault": "默认（{mode}）",
  "auto.agentPickModelFirst": "先选择 Agent / 模型",
  "auto.agentAdvanced": "高级配置（JSON，可选）",
  "auto.agentAdvancedHint": "JSON 对象，合并进 agent 配置，可设 options / systemPrompt / toolPolicy / mcpServers",
} as const;

export type DictKey = keyof typeof zh;

const en: Record<DictKey, string> = {
  "common.loading": "Loading…",
  "common.retry": "Retry",
  "common.refresh": "Refresh",
  "common.search": "Search…",
  "common.noOptions": "No options",
  "common.save": "Save",
  "common.saved": "Saved",
  "common.delete": "Remove repo",
  "common.deleted": "Removed",
  "common.add": "Add",
  "common.send": "Send",
  "common.skip": "Skip",
  "common.cancel": "Cancel",
  "common.enable": "Enabled",
  "common.on": "on",
  "common.off": "off",
  "common.openGitHub": "Open on GitHub",
  "common.openAgent": "Open agent",
  "common.dispatch": "Dispatch agent",
  "common.redispatch": "Redispatch",
  "common.dispatching": "Dispatching…",
  "common.all": "All",
  "common.allRepos": "All repos",
  "common.allReposLong": "All repos (every repo under your account)",
  "common.allStates": "All states",
  "common.open": "Open",
  "common.closed": "Closed",
  "common.selectRepo": "Select GitHub repo",
  "common.selectLabel": "Select trigger label",
  "common.allIssues": "All new issues (any label)",
  "common.minutes": "{n} min",
  "time.justNow": "just now",
  "time.minutesAgo": "{n}m ago",
  "time.hoursAgo": "{n}h ago",
  "time.daysAgo": "{n}d ago",

  "app.title": "GitHub Workbench",
  "sidebar.badgeLabel": "GitHub Workbench, {n} pending",
  "app.ghUnauth": "gh not authenticated",
  "app.pollNow": "Check now",
  "app.stateError": "Failed to load state",
  "tab.board": "Board",
  "tab.runs": "Runs",
  "tab.runsAwaiting": "Runs · {n} awaiting",
  "tab.automation": "Automation",
  "lang.label": "Language",
  "lang.auto": "System",
  "lang.zh": "中文",
  "lang.en": "English",

  "board.searchPlaceholder": "Search title / repo / number…",
  "board.readError": "Failed to load board",
  "board.emptyTitle": "No matching PRs / issues",
  "board.emptyDesc": "Adjust filters, or refresh.",
  "board.pr": "PR",
  "board.issue": "Issue",
  "board.dispatchShort": "Dispatch",
  "board.redispatchShort": "Redispatch",

  "runs.emptyTitle": "No runs yet",
  "runs.emptyDesc": "Dispatch a PR / issue from the board, or enable a watch in Automation.",
  "runs.filter.all": "All",
  "runs.filter.running": "Running",
  "runs.filter.awaiting": "Awaiting",
  "runs.filter.done": "Done",
  "runs.filter.failed": "Failed",
  "runs.status.running": "Running",
  "runs.status.awaiting": "Awaiting merge",
  "runs.status.done": "Done",
  "runs.status.failed": "Failed",
  "runs.merged": "Merged",
  "runs.commented": "Commented",
  "runs.verdict": "Verdict: {v}",
  "runs.approveMerge": "Approve merge",
  "runs.dispatched": "Dispatched {target}",
  "runs.mergeOk": "Merged {target}",
  "runs.autoMergeOk": "Auto-merge enabled for {target} (merges when checks pass)",
  "runs.skipped": "Merge skipped",
  "runs.retried": "Retried {target}",

  "detail.back": "Back to board",
  "detail.readError": "Failed to load details",
  "detail.checks": "Checks · {n}",
  "detail.fixChecks": "Fix broken checks · {n}",
  "detail.description": "Description",
  "detail.activity": "Activity · {n}",
  "detail.noComments": "No comments yet",
  "detail.commentTitle": "Add a comment",
  "detail.commentPlaceholder": "Write a comment…",
  "detail.commentSent": "Comment posted",
  "detail.merge": "Merge",
  "detail.autoMerge": "Auto-merge",
  "dispatch.promptLabel": "Prompt (editable; variables rendered on dispatch)",

  "auto.intro": "An \"All repos\" watch is enabled by default: new PRs are auto-reviewed and labeled new issues auto-handled (Paseo's default model by default; each repo card can customize the dispatched agent, model, thinking effort, and permission mode; local repos are matched or cloned automatically). Expand to edit prompts, or add a single repo for custom settings.",
  "auto.addTitle": "Add a repo watch",
  "auto.added": "Added — expand the repo card to configure pipelines",
  "auto.pollInterval": "Poll interval",
  "auto.everyMinutes": "Every {n} min",
  "auto.prReview": "PR auto-review",
  "auto.issueHandle": "Issue auto-handle",
  "auto.prSummary": "PR review {pr} / Issue handle {issue}",
  "auto.promptTemplate": "Prompt template",
  "auto.promptHint": "Variables: {{repo}} {{number}} {{title}} {{body}} {{author}} {{url}}",
  "auto.authors": "Author allowlist (pick or type; empty = anyone)",
  "auto.authorsPlaceholder": "Empty = anyone; comma-separated",
  "auto.commentTemplate": "Write-back comment template",
  "auto.commentHint": "{{summary}} {{verdict}} {{comments}}",
  "auto.followUpPrompt": "Follow-up prompt (new comments reuse the original agent)",
  "auto.followUpHint": "New comments are sent to the original agent to continue; variables: {{repo}} {{number}} {{title}} {{url}} {{comments}}",
  "auto.autoMerge": "Auto-merge when approved (manual confirmation by default)",
  "auto.mergeMethod": "Merge method",
  "auto.triggerLabel": "Trigger label",
  "auto.agentModel": "Dispatch agent / model",
  "auto.agentModelDefault": "Default (first enabled provider's default model)",
  "auto.agentThinking": "Thinking effort",
  "auto.agentMode": "Permission mode",
  "auto.agentOptionDefault": "Default",
  "auto.agentModeDefault": "Default ({mode})",
  "auto.agentPickModelFirst": "Pick an agent / model first",
  "auto.agentAdvanced": "Advanced config (JSON, optional)",
  "auto.agentAdvancedHint": "JSON object merged into the agent config; supports options / systemPrompt / toolPolicy / mcpServers",
};

const DICT: Record<Locale, Record<DictKey, string>> = { zh, en };

export type Translate = (key: DictKey, params?: Record<string, string | number>) => string;

function makeTranslate(loc: Locale): Translate {
  const table = DICT[loc];
  return (key, params) => {
    let text = table[key] ?? DICT.zh[key] ?? String(key);
    if (params) for (const [name, value] of Object.entries(params)) text = text.split(`{${name}}`).join(String(value));
    return text;
  };
}

export function translateNow(key: DictKey, params?: Record<string, string | number>): string {
  return makeTranslate(locale)(key, params);
}

export function useI18n(): { locale: Locale; mode: LanguageMode; t: Translate } {
  const [, setTick] = useState(0);
  useEffect(() => {
    const listener = () => setTick((value) => value + 1);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);
  const current = locale;
  const t = useMemo(() => makeTranslate(current), [current]);
  return { locale: current, mode, t };
}