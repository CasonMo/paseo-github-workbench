import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const DEFAULT_PR_REVIEW_PROMPT = `你是代码评审 agent。当前 worktree 已 checkout {{repo}} 的 PR #{{number}}。
PR 标题：{{title}}
作者：{{author}}
PR 描述：
{{body}}

请先用 \`gh pr diff {{number}}\` 查看完整改动，再结合仓库代码认真评审：正确性、边界条件、安全隐患、不必要的复杂度。
不要修改代码，不要合并 PR，不要发表评论（评论由插件代发）。
评审完成后，最后一条消息只输出一个 JSON 对象（不要其它文字）：
{"verdict":"approve" 或 "changes_requested","summary":"总体结论（中文）","comments":[{"path":"文件路径","line":行号,"body":"问题说明"}]}
没有问题时 comments 为空数组。`;

export const DEFAULT_PR_COMMENT_TEMPLATE = `🤖 自动评审（paseo-github-workbench）

结论：{{verdict}}

{{summary}}

{{comments}}`;

export const DEFAULT_ISSUE_PROMPT = `你是排查/修复 agent。请处理 {{repo}} 的 issue #{{number}}：{{title}}
提出者：{{author}}
内容：
{{body}}

当前 worktree 已从主分支切出。请排查并修复这个问题：先定位根因，再做最小修复，跑相关测试验证，最后 git commit。
如果确认修复完成，用 \`gh pr create\` 开一个 PR（标题含 issue 编号）。
完成后最后一条消息只输出一个 JSON 对象（不要其它文字）：
{"summary":"处理摘要（中文，含根因、改动、测试结果、PR 链接如有）"}
无法修复时 summary 说明原因和已排查到的线索。`;

export const DEFAULT_ISSUE_COMMENT_TEMPLATE = `🤖 自动处理结果（paseo-github-workbench）

{{summary}}`;

export const DEFAULT_PR_FOLLOWUP_PROMPT = `你是代码评审 agent，之前已评审过 {{repo}} 的 PR #{{number}}（{{title}}）。该 PR 有新评论：
{{comments}}

请结合你已有的评审上下文跟进：评论质疑评审结论时重新核实相关代码；评论说明已修复时用 \`gh pr diff {{number}}\` 查看最新改动再判断。
不要修改代码，不要合并 PR，不要发表评论（评论由插件代发）。
跟进完成后，最后一条消息只输出一个 JSON 对象（不要其它文字）：
{"verdict":"approve" 或 "changes_requested","summary":"跟进结论（中文）","comments":[{"path":"文件路径","line":行号,"body":"问题说明"}]}
没有问题时 comments 为空数组。`;

export const DEFAULT_ISSUE_FOLLOWUP_PROMPT = `你是排查/修复 agent，之前已处理过 {{repo}} 的 issue #{{number}}（{{title}}）。该 issue 有新评论：
{{comments}}

请结合你已有的处理上下文跟进：回答疑问、补充排查或继续修复（修复后 git commit，必要时更新已有 PR）。
完成后最后一条消息只输出一个 JSON 对象（不要其它文字）：
{"summary":"跟进摘要（中文）"}`;

/** 派发 agent 配置：留空 = Paseo 默认（第一个启用 provider 的默认模型） */
export const agentSettingsSchema = z.object({
  /** provider/model 格式，空 = 默认 */
  provider: z.string().default(""),
  thinkingOptionId: z.string().default(""),
  modeId: z.string().default(""),
  /** 高级配置：JSON 对象，合并进 agent config（options/systemPrompt/toolPolicy/mcpServers 等） */
  advanced: z.string().default(""),
});

export type AgentSettings = z.output<typeof agentSettingsSchema>;

export const prReviewSchema = z.object({
  enabled: z.boolean().default(false),
  agent: agentSettingsSchema.default(() => agentSettingsSchema.parse({})),
  prompt: z.string().default(DEFAULT_PR_REVIEW_PROMPT),
  autoMerge: z.boolean().default(false),
  mergeMethod: z.enum(["merge", "squash", "rebase"]).default("squash"),
  /** 逗号分隔的 author 白名单，空 = 不限 */
  authors: z.string().default(""),
  commentTemplate: z.string().default(DEFAULT_PR_COMMENT_TEMPLATE),
  /** 新评论追加给原 agent 的跟进提示词 */
  followUpPrompt: z.string().default(DEFAULT_PR_FOLLOWUP_PROMPT),
});

export const issueHandleSchema = z.object({
  enabled: z.boolean().default(false),
  agent: agentSettingsSchema.default(() => agentSettingsSchema.parse({})),
  prompt: z.string().default(DEFAULT_ISSUE_PROMPT),
  /** 触发 label，空 = 所有新 issue */
  label: z.string().default("agent"),
  authors: z.string().default(""),
  commentTemplate: z.string().default(DEFAULT_ISSUE_COMMENT_TEMPLATE),
  followUpPrompt: z.string().default(DEFAULT_ISSUE_FOLLOWUP_PROMPT),
});

export const repoSchema = z.object({
  /** owner/name */
  repo: z.string(),
  enabled: z.boolean().default(true),
  pollMinutes: z.number().default(5),
  prReview: prReviewSchema.default(() => prReviewSchema.parse({})),
  issueHandle: issueHandleSchema.default(() => issueHandleSchema.parse({})),
});

export const runSchema = z.object({
  id: z.string(),
  repo: z.string(),
  kind: z.enum(["pr", "issue"]),
  number: z.number(),
  title: z.string(),
  url: z.string(),
  author: z.string(),
  headSha: z.string().default(""),
  status: z.enum(["running", "awaiting_merge", "done", "failed"]),
  verdict: z.string().default(""),
  summary: z.string().default(""),
  error: z.string().default(""),
  workspaceId: z.string().default(""),
  agentId: z.string().default(""),
  commentPosted: z.boolean().default(false),
  merged: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** 特殊仓库值：监听当前 gh 账号名下全部仓库 */
export const ALL_REPOS = "*";

export const uiPrefsSchema = z.object({
  boardKind: z.enum(["all", "pr", "issue"]).default("all"),
  boardState: z.enum(["open", "closed", "all"]).default("all"),
  boardRepo: z.string().default(""),
  language: z.enum(["auto", "zh", "en"]).default("auto"),
});

export const stateSchema = z.object({
  repos: z
    .array(repoSchema)
    .default(() => [
      repoSchema.parse({
        repo: ALL_REPOS,
        enabled: true,
        pollMinutes: 5,
        prReview: { enabled: true },
        issueHandle: { enabled: true },
      }),
    ]),
  runs: z.array(runSchema).default([]),
  /** 去重：PR 键 repo#number -> headSha；issue 键 repo#number -> "1"；repo:baseline -> 首次轮询时间 */
  seen: z.record(z.string(), z.string()).default({}),
  /** 是否已注入「全部仓库」默认监听（一次性迁移标记） */
  allReposSeeded: z.boolean().default(false),
  /** 看板筛选偏好（记住用户上次的选择） */
  ui: uiPrefsSchema.default(() => uiPrefsSchema.parse({})),
});

export type RepoConfig = z.output<typeof repoSchema>;
export type RunRecord = z.output<typeof runSchema>;
export type WorkbenchState = z.output<typeof stateSchema>;

export const ghStatusSchema = z.object({
  ok: z.boolean(),
  user: z.string(),
  message: z.string(),
});

export const stateGet = defineRpc({
  name: "github-workbench.state.get",
  input: z.object({}),
  output: z.object({ state: stateSchema, gh: ghStatusSchema }),
});

export const repoSave = defineRpc({
  name: "github-workbench.repo.save",
  input: repoSchema,
  output: z.object({ state: stateSchema }),
});

export const repoRemove = defineRpc({
  name: "github-workbench.repo.remove",
  input: z.object({ repo: z.string() }),
  output: z.object({ state: stateSchema }),
});

export const runAction = defineRpc({
  name: "github-workbench.run.action",
  input: z.object({
    runId: z.string(),
    action: z.enum(["merge", "skip", "retry"]),
  }),
  output: z.object({ state: stateSchema, message: z.string() }),
});

export const pollNow = defineRpc({
  name: "github-workbench.poll.now",
  input: z.object({}),
  output: z.object({ state: stateSchema, message: z.string() }),
});

export const providerCatalog = defineRpc({
  name: "github-workbench.providers",
  input: z.object({}),
  output: z.object({
    providers: z.array(z.object({
      id: z.string(),
      label: z.string(),
      models: z.array(z.object({
        id: z.string(),
        label: z.string(),
        isDefault: z.boolean().default(false),
        thinkingOptions: z.array(z.object({ id: z.string(), label: z.string() })).default([]),
      })),
      modes: z.array(z.object({ id: z.string(), label: z.string() })).default([]),
      defaultModeId: z.string().default(""),
    })),
  }),
});

export const ghReposList = defineRpc({
  name: "github-workbench.gh.repos",
  input: z.object({}),
  output: z.object({ repos: z.array(z.string()) }),
});

export const ghLabelsList = defineRpc({
  name: "github-workbench.gh.labels",
  input: z.object({ repo: z.string() }),
  output: z.object({ labels: z.array(z.string()) }),
});

export const ghCollaboratorsList = defineRpc({
  name: "github-workbench.gh.collaborators",
  input: z.object({ repo: z.string() }),
  output: z.object({ users: z.array(z.string()) }),
});

export const boardItemSchema = z.object({
  repo: z.string(),
  kind: z.enum(["pr", "issue"]),
  number: z.number(),
  title: z.string(),
  url: z.string(),
  author: z.string(),
  updatedAt: z.string(),
  state: z.string().default("open"),
  isDraft: z.boolean().default(false),
  labels: z.array(z.string()).default([]),
});

export const boardList = defineRpc({
  name: "github-workbench.board.list",
  input: z.object({
    kind: z.enum(["all", "pr", "issue"]).default("all"),
    state: z.enum(["open", "closed", "all"]).default("open"),
  }),
  output: z.object({ items: z.array(boardItemSchema), user: z.string() }),
});

export const dispatchItem = defineRpc({
  name: "github-workbench.item.dispatch",
  input: z.object({
    repo: z.string(),
    kind: z.enum(["pr", "issue"]),
    number: z.number(),
    /** 自定义提示词（如 Fix broken checks），空 = 用默认模板 */
    prompt: z.string().default(""),
    /** 本次派发的 agent 配置覆盖；缺省 = 仓库配置 */
    agent: agentSettingsSchema.optional(),
  }),
  output: z.object({ state: stateSchema, message: z.string() }),
});

export const itemDetailSchema = z.object({
  repo: z.string(),
  kind: z.enum(["pr", "issue"]),
  number: z.number(),
  title: z.string(),
  body: z.string(),
  url: z.string(),
  author: z.string(),
  state: z.string(),
  labels: z.array(z.string()),
  comments: z.array(z.object({ author: z.string(), body: z.string(), createdAt: z.string() })),
  /** PR 专有 */
  isDraft: z.boolean().default(false),
  mergeable: z.string().default(""),
  reviewDecision: z.string().default(""),
  checks: z.array(z.object({ name: z.string(), status: z.string(), conclusion: z.string() })).default([]),
});

export const itemDetail = defineRpc({
  name: "github-workbench.item.detail",
  input: z.object({ repo: z.string(), kind: z.enum(["pr", "issue"]), number: z.number() }),
  output: itemDetailSchema,
});

export const itemComment = defineRpc({
  name: "github-workbench.item.comment",
  input: z.object({ repo: z.string(), kind: z.enum(["pr", "issue"]), number: z.number(), body: z.string() }),
  output: z.object({ ok: z.boolean() }),
});

export const itemMerge = defineRpc({
  name: "github-workbench.item.merge",
  input: z.object({
    repo: z.string(),
    number: z.number(),
    method: z.enum(["merge", "squash", "rebase"]).default("squash"),
    /** GitHub 原生 auto-merge：等 checks/required reviews 通过后自动合 */
    auto: z.boolean().default(false),
  }),
  output: z.object({ message: z.string() }),
});

export const attentionBadge = defineRpc({
  name: "github-workbench.attention.badge",
  input: z.object({}),
  output: z.object({ count: z.number() }),
});

export const uiPrefsSave = defineRpc({
  name: "github-workbench.ui.save",
  input: uiPrefsSchema.partial(),
  output: z.object({ ok: z.boolean() }),
});