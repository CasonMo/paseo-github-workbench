import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import { ALL_REPOS, DEFAULT_ISSUE_COMMENT_TEMPLATE, DEFAULT_ISSUE_PROMPT, DEFAULT_PR_COMMENT_TEMPLATE, DEFAULT_PR_REVIEW_PROMPT, agentSettingsSchema, type AgentSettings, type RepoConfig, type RunRecord, type WorkbenchState } from "../shared/contracts";
import type { GhItem } from "./github";
import { cloneRepo, fetchComments, fetchHead, fetchItem, fetchOrigin, listIssues, listPullRequests, listRepos, mergePullRequest, postComment } from "./github";
import { readState, updateState } from "./store";

type PaseoApi = PluginHandlerContext["paseo"];
type PaseoWorkspace = Awaited<ReturnType<PaseoApi["workspaces"]["create"]>>;
type AgentCreateConfig = Parameters<PaseoWorkspace["agents"]["create"]>[0]["config"];

const METADATA_KEY = "paseo-github-workbench";

function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? "");
}

function itemVars(repo: string, item: GhItem): Record<string, string> {
  return {
    repo,
    number: String(item.number),
    title: item.title,
    body: item.body ?? "",
    url: item.url,
    author: item.author?.login ?? "",
  };
}

function authorAllowed(allowlist: string, author: string): boolean {
  const list = allowlist.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return list.length === 0 || list.includes(author.toLowerCase());
}

/** 从 agent 最后一条消息里提取 JSON 结论（容忍 ```json 围栏和前后杂文字）。 */
export function parseAgentJson(text: string): Record<string, unknown> | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/g;
  const candidates: string[] = [];
  for (const match of text.matchAll(fenced)) candidates.push(match[1]);
  const braces = text.match(/\{[\s\S]*\}/g);
  if (braces) candidates.push(...braces);
  for (let i = candidates.length - 1; i >= 0; i--) {
    try {
      const parsed: unknown = JSON.parse(candidates[i].trim());
      if (typeof parsed === "object" && parsed !== null) return parsed as Record<string, unknown>;
    } catch {
      // 继续尝试更早的候选
    }
  }
  return null;
}

/** 本地仓库解析：优先匹配 Paseo project 的 remote，没有就 clone 到插件管理目录。 */
export async function resolveRepoPath(paseo: PaseoApi, repo: string): Promise<string> {
  const { projects } = await paseo.projects.list();
  const target = repo.toLowerCase();
  for (const p of projects) {
    const key = (p.projectKey ?? "").toLowerCase();
    if (key.startsWith("remote:") && key.slice("remote:".length).replace(/^[^/]+\//, "") === target) {
      return p.projectRootPath;
    }
  }
  const base = process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state");
  const dest = join(base, "paseo-github-workbench", "repos", repo);
  if (!existsSync(join(dest, ".git"))) {
    await cloneRepo(repo, dest);
  }
  return dest;
}

/** 派发用默认模型：provider 目录里第一个启用项的默认模型，用户无需配置。 */
export async function defaultProvider(paseo: PaseoApi): Promise<string> {
  const snapshot = await paseo.providers.snapshot();
  for (const entry of snapshot.entries ?? []) {
    if (entry.enabled === false) continue;
    const models = (entry.models ?? []).filter((m) => m.isSelectable !== false);
    if (models.length === 0) continue;
    const model = models.find((m) => m.isDefault) ?? models[0];
    return `${entry.provider}/${model.id}`;
  }
  throw new Error("没有可用的 provider/model，请先在 Paseo 中配置一个 coding agent。");
}

/** 用户配置的 agent 参数 → SDK config：显式字段优先，高级 JSON 提供其余项（options/systemPrompt 等）。 */
export async function resolveAgentConfig(paseo: PaseoApi, settings: AgentSettings): Promise<AgentCreateConfig> {
  let base: Record<string, unknown> = {};
  const advanced = settings.advanced.trim();
  if (advanced) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(advanced);
    } catch {
      throw new Error("agent 高级配置不是合法 JSON");
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("agent 高级配置必须是 JSON 对象");
    base = parsed as Record<string, unknown>;
  }
  const provider = settings.provider.trim() || (await defaultProvider(paseo));
  const config = { ...base, provider } as AgentCreateConfig;
  if (settings.thinkingOptionId.trim()) config.thinkingOptionId = settings.thinkingOptionId.trim();
  if (settings.modeId.trim()) config.modeId = settings.modeId.trim();
  return config;
}

function agentSettingsFor(state: WorkbenchState, repo: string, kind: "pr" | "issue"): AgentSettings {
  const repoConfig = findRepoConfig(state, repo);
  const pipeline = kind === "pr" ? repoConfig?.prReview : repoConfig?.issueHandle;
  return pipeline?.agent ?? agentSettingsSchema.parse({});
}

function newRun(repo: string, kind: "pr" | "issue", item: GhItem): RunRecord {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    repo,
    kind,
    number: item.number,
    title: item.title,
    url: item.url,
    author: item.author?.login ?? "",
    headSha: item.headRefOid ?? "",
    status: "running",
    verdict: "",
    summary: "",
    error: "",
    workspaceId: "",
    agentId: "",
    commentPosted: false,
    merged: false,
    createdAt: now,
    updatedAt: now,
  };
}

async function patchRun(runId: string, patch: Partial<RunRecord>): Promise<void> {
  await updateState((state) => {
    const run = state.runs.find((r) => r.id === runId);
    if (run) Object.assign(run, patch, { updatedAt: new Date().toISOString() });
  });
}

/** 派发一个 run：解析本地仓库 → 开 worktree（PR checkout / issue branch-off）→ 按配置创建 agent。 */
export async function startRun(paseo: PaseoApi, repo: string, kind: "pr" | "issue", item: GhItem, promptTemplate: string, agentSettings: AgentSettings): Promise<RunRecord> {
  const run = newRun(repo, kind, item);
  await updateState((state) => {
    state.runs.push(run);
    state.seen[`${repo}#${item.number}`] = kind === "pr" ? (item.headRefOid ?? "") : "1";
    state.seen[`${repo}#${item.number}:comments`] = new Date().toISOString();
  });
  try {
    const [repoPath, agentConfig] = await Promise.all([resolveRepoPath(paseo, repo), resolveAgentConfig(paseo, agentSettings)]);
    await fetchOrigin(repoPath);
    const workspace = await paseo.workspaces.create({
      title: `${repo}#${item.number} ${kind === "pr" ? "评审" : "处理"}`,
      source:
        kind === "pr"
          ? {
              kind: "worktree",
              cwd: repoPath,
              action: "checkout",
              checkoutSource: { kind: "change_request", forge: "github", number: item.number },
            }
          : {
              kind: "worktree",
              cwd: repoPath,
              action: "branch-off",
              worktreeSlug: `issue-${item.number}`,
            },
    });
    const agent = await workspace.agents.create({
      config: agentConfig,
      title: `${kind === "pr" ? "评审" : "处理"} ${repo}#${item.number}`,
      prompt: render(promptTemplate, itemVars(repo, item)),
      metadata: { [METADATA_KEY]: { runId: run.id } },
    });
    await patchRun(run.id, { workspaceId: workspace.id, agentId: agent.id });
  } catch (error) {
    await patchRun(run.id, { status: "failed", error: error instanceof Error ? error.message : String(error) });
  }
  return run;
}

/** 条目有新评论 → 追加给原 agent 继续会话；没有可复用的 agent 时回退新派发。 */
export async function followUpOnComments(paseo: PaseoApi, repoConfig: RepoConfig, kind: "pr" | "issue", item: GhItem, state: WorkbenchState): Promise<number> {
  const cursorKey = `${repoConfig.repo}#${item.number}:comments`;
  const history = state.runs.filter((r) => r.repo === repoConfig.repo && r.kind === kind && r.number === item.number && r.agentId).reverse();
  if (history.length === 0) return 0;
  const comments = await fetchComments(repoConfig.repo, kind, item.number);
  const cursor = state.seen[cursorKey];
  if (cursor === undefined) {
    // 升级前已派发的条目：只建基线，不回放历史评论
    const latest = comments.reduce((max, c) => (c.createdAt > max ? c.createdAt : max), "");
    await updateState((s) => { s.seen[cursorKey] = latest || new Date().toISOString(); });
    return 0;
  }
  const pipeline = kind === "pr" ? repoConfig.prReview : repoConfig.issueHandle;
  const fresh = comments.filter((c) => c.createdAt > cursor && !c.body.includes("paseo-github-workbench") && authorAllowed(pipeline.authors, c.author));
  if (fresh.length === 0) return 0;

  let handle: ReturnType<PaseoApi["agents"]["ref"]> | null = null;
  let source: RunRecord | null = null;
  for (const run of history) {
    const ref = paseo.agents.ref(run.agentId);
    try {
      await ref.refresh();
    } catch {
      continue;
    }
    if (ref.archivedAt) continue;
    // 当前 turn 未结束：不推进游标，下一轮再批量跟进
    if (ref.status === "running") return 0;
    handle = ref;
    source = run;
    break;
  }
  if (!handle || !source) {
    const prompt = kind === "pr" ? repoConfig.prReview.prompt : repoConfig.issueHandle.prompt;
    await startRun(paseo, repoConfig.repo, kind, item, prompt, pipeline.agent);
    return 1;
  }
  const run = newRun(repoConfig.repo, kind, item);
  run.workspaceId = source.workspaceId;
  run.agentId = source.agentId;
  const nextCursor = fresh.reduce((max, c) => (c.createdAt > max ? c.createdAt : max), cursor);
  await updateState((s) => {
    s.runs.push(run);
    s.seen[cursorKey] = nextCursor;
  });
  try {
    const vars = { ...itemVars(repoConfig.repo, item), comments: fresh.map((c) => `${c.author}: ${c.body}`).join("\n\n") };
    await handle.send(render(pipeline.followUpPrompt, vars));
  } catch (error) {
    await patchRun(run.id, { status: "failed", error: error instanceof Error ? error.message : String(error) });
  }
  return 1;
}

/** 看板一键派发：拉取最新条目后派发（可传自定义提示词，否则用默认模板）。 */
export async function dispatchItem(paseo: PaseoApi, repo: string, kind: "pr" | "issue", number: number, prompt = "", agentOverride?: AgentSettings): Promise<string> {
  const item = await fetchItem(repo, kind, number);
  const template = prompt.trim() || (kind === "pr" ? DEFAULT_PR_REVIEW_PROMPT : DEFAULT_ISSUE_PROMPT);
  const run = await startRun(paseo, repo, kind, item, template, agentOverride ?? agentSettingsFor(await readState(), repo, kind));
  if (run.status === "failed") throw new Error(run.error);
  return `已派发 ${repo}#${number}`;
}

function findRepoConfig(state: WorkbenchState, repo: string): RepoConfig | undefined {
  return state.repos.find((r) => r.repo === repo) ?? state.repos.find((r) => r.repo === ALL_REPOS);
}

function renderComments(comments: unknown): string {
  if (!Array.isArray(comments)) return "";
  return comments
    .map((c) => {
      if (typeof c !== "object" || c === null) return "";
      const { path, line, body } = c as { path?: unknown; line?: unknown; body?: unknown };
      const loc = [path, line].filter((v) => v !== undefined && v !== "").join(":");
      return `- ${loc ? `${loc} ` : ""}${String(body ?? "")}`;
    })
    .filter(Boolean)
    .join("\n");
}

/** agent turn 结束：推进 run。PR 按 verdict 分支 merge/评论；issue 评论回写。 */
export async function onTurnEnd(
  paseo: PaseoApi,
  agentId: string,
  turnId: string | null,
  outcome: { kind: string; error?: { message?: string } },
): Promise<void> {
  const state = await readState();
  const run = state.runs.find((r) => r.agentId === agentId && r.status === "running");
  if (!run) return;
  if (outcome.kind !== "completed") {
    await patchRun(run.id, {
      status: "failed",
      error: outcome.kind === "canceled" ? "agent 已取消" : (outcome.error?.message ?? "agent 执行失败"),
    });
    return;
  }
  let text = "";
  try {
    const page = await paseo.agents.ref(agentId).timeline.refetch({ direction: "tail", limit: 1, wholeTurns: true });
    const items = page.entries.filter((e) => turnId === null || e.turnId === turnId).map((e) => e.item);
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i] as { type?: string; text?: unknown };
      if (item.type === "assistant_message" && typeof item.text === "string" && item.text.trim()) {
        text = item.text;
        break;
      }
    }
  } catch {
    // 时间线读取失败按无输出处理
  }
  const parsed = parseAgentJson(text);
  const repoConfig = findRepoConfig(state, run.repo);
  try {
    if (run.kind === "pr") {
      const verdict = String(parsed?.verdict ?? "");
      if (verdict !== "approve" && verdict !== "changes_requested") {
        await patchRun(run.id, { status: "failed", error: "无法解析评审结论（verdict）", summary: text.slice(0, 2000) });
        return;
      }
      const summary = String(parsed?.summary ?? "");
      if (verdict === "approve") {
        if (repoConfig?.prReview.autoMerge) {
          const head = await fetchHead(run.repo, run.number);
          if (run.headSha && head !== run.headSha) {
            await redispatchStale(paseo, run, repoConfig);
            return;
          }
          await mergePullRequest(run.repo, run.number, repoConfig.prReview.mergeMethod, true, run.headSha);
          await patchRun(run.id, { status: "done", verdict, summary, merged: true });
        } else {
          await patchRun(run.id, { status: "awaiting_merge", verdict, summary });
        }
        return;
      }
      const body = render(repoConfig?.prReview.commentTemplate ?? DEFAULT_PR_COMMENT_TEMPLATE, {
        verdict,
        summary,
        comments: renderComments(parsed?.comments),
      });
      await postComment(run.repo, "pr", run.number, body);
      await patchRun(run.id, { status: "done", verdict, summary, commentPosted: true });
      return;
    }
    const summary = String(parsed?.summary ?? "") || text.slice(0, 2000);
    if (!summary.trim()) {
      await patchRun(run.id, { status: "failed", error: "agent 无输出" });
      return;
    }
    const body = render(repoConfig?.issueHandle.commentTemplate ?? DEFAULT_ISSUE_COMMENT_TEMPLATE, { summary });
    await postComment(run.repo, "issue", run.number, body);
    await patchRun(run.id, { status: "done", summary, commentPosted: true });
  } catch (error) {
    await patchRun(run.id, { status: "failed", error: error instanceof Error ? error.message : String(error) });
  }
}

/** head 变化阻止合并后：旧 run 标记失败并自动派发新评审。 */
async function redispatchStale(paseo: PaseoApi, run: RunRecord, repoConfig: RepoConfig | undefined): Promise<void> {
  await patchRun(run.id, { status: "failed", error: "PR head 已变化，合并已阻止，已重新派发评审" });
  const item = await fetchItem(run.repo, "pr", run.number);
  await startRun(paseo, run.repo, "pr", item, repoConfig?.prReview.prompt ?? DEFAULT_PR_REVIEW_PROMPT, repoConfig?.prReview.agent ?? agentSettingsSchema.parse({}));
}

export async function doRunAction(paseo: PaseoApi, runId: string, action: "merge" | "skip" | "retry"): Promise<string> {
  const state = await readState();
  const run = state.runs.find((r) => r.id === runId);
  if (!run) throw new Error("run 不存在");
  if (action === "merge") {
    if (run.kind !== "pr" || run.merged) throw new Error("该 run 不可合并");
    if (run.verdict !== "approve") throw new Error("评审结论不是 approve，不能合并");
    const repoConfig = findRepoConfig(state, run.repo);
    const head = await fetchHead(run.repo, run.number);
    if (run.headSha && head !== run.headSha) {
      await redispatchStale(paseo, run, repoConfig);
      return `PR 有新提交，合并已阻止，已重新派发评审 ${run.repo}#${run.number}`;
    }
    await mergePullRequest(run.repo, run.number, repoConfig?.prReview.mergeMethod ?? "squash", false, run.headSha);
    await patchRun(run.id, { status: "done", merged: true });
    return `已合并 ${run.repo}#${run.number}`;
  }
  if (action === "skip") {
    if (run.status !== "awaiting_merge") throw new Error("该 run 不在待确认状态");
    await patchRun(run.id, { status: "done", summary: `${run.summary}\n（人工跳过合并）`.trim() });
    return "已跳过合并";
  }
  if (run.status !== "failed") throw new Error("只有失败的 run 可以重试");
  const item = await fetchItem(run.repo, run.kind, run.number);
  const repoConfig = findRepoConfig(state, run.repo);
  const prompt = run.kind === "pr" ? (repoConfig?.prReview.prompt ?? DEFAULT_PR_REVIEW_PROMPT) : (repoConfig?.issueHandle.prompt ?? DEFAULT_ISSUE_PROMPT);
  await startRun(paseo, run.repo, run.kind, item, prompt, agentSettingsFor(state, run.repo, run.kind));
  return `已重试 ${run.repo}#${run.number}`;
}

const lastPoll = new Map<string, number>();
let ticking = false;

/** 轮询所有启用仓库：首次只建基线不派发，之后按 headSha/编号增量触发。 */
export async function tick(paseo: PaseoApi): Promise<string> {
  if (ticking) return "上一轮轮询尚未结束";
  ticking = true;
  try {
    const state = await readState();
    let started = 0;
    for (const repoConfig of state.repos) {
      if (!repoConfig.enabled) continue;
      if (!repoConfig.prReview.enabled && !repoConfig.issueHandle.enabled) continue;
      // 「全部仓库」展开为账号名下每个仓库，逐个按间隔轮询
      const targets = repoConfig.repo === ALL_REPOS ? await listRepos() : [repoConfig.repo];
      for (const repo of targets) {
        const intervalMs = Math.max(1, repoConfig.pollMinutes) * 60_000;
        const last = lastPoll.get(repo) ?? 0;
        if (Date.now() - last < intervalMs) continue;
        lastPoll.set(repo, Date.now());
        try {
          started += await pollRepo(paseo, { ...repoConfig, repo });
        } catch (error) {
          console.error(`[paseo-github-workbench] 轮询 ${repo} 失败:`, error);
        }
      }
    }
    return started > 0 ? `新派发 ${started} 个任务` : "没有新任务";
  } finally {
    ticking = false;
  }
}

export async function pollRepo(paseo: PaseoApi, repoConfig: RepoConfig): Promise<number> {
  const state = await readState();
  const baselineKey = `${repoConfig.repo}:baseline`;
  const firstPoll = state.seen[baselineKey] === undefined;
  let started = 0;

  if (repoConfig.prReview.enabled) {
    const prs = await listPullRequests(repoConfig.repo);
    for (const pr of prs) {
      if (pr.isDraft) continue;
      if (!authorAllowed(repoConfig.prReview.authors, pr.author?.login ?? "")) continue;
      const key = `${repoConfig.repo}#${pr.number}`;
      if (firstPoll) {
        await updateState((s) => { s.seen[key] = pr.headRefOid ?? ""; });
        continue;
      }
      if (state.seen[key] === (pr.headRefOid ?? "")) {
        started += await followUpOnComments(paseo, repoConfig, "pr", pr, state);
        continue;
      }
      await startRun(paseo, repoConfig.repo, "pr", pr, repoConfig.prReview.prompt, repoConfig.prReview.agent);
      started++;
    }
  }

  if (repoConfig.issueHandle.enabled) {
    const issues = await listIssues(repoConfig.repo);
    const label = repoConfig.issueHandle.label.trim().toLowerCase();
    for (const issue of issues) {
      if (label && !issue.labels.some((l) => l.name.toLowerCase() === label)) continue;
      if (!authorAllowed(repoConfig.issueHandle.authors, issue.author?.login ?? "")) continue;
      const key = `${repoConfig.repo}#${issue.number}`;
      if (firstPoll) {
        await updateState((s) => { s.seen[key] = "1"; });
        continue;
      }
      if (state.seen[key] !== undefined) {
        started += await followUpOnComments(paseo, repoConfig, "issue", issue, state);
        continue;
      }
      await startRun(paseo, repoConfig.repo, "issue", issue, repoConfig.issueHandle.prompt, repoConfig.issueHandle.agent);
      started++;
    }
  }

  if (firstPoll) {
    await updateState((s) => { s.seen[baselineKey] = new Date().toISOString(); });
  }
  return started;
}