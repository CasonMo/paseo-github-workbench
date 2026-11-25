import type { PluginHandlerContext, PluginServerContext } from "@getpaseo/plugin/server";
import { ALL_REPOS, attentionBadge, boardList, dispatchItem, ghCollaboratorsList, ghLabelsList, ghReposList, itemComment, itemDetail, itemMerge, pollNow, providerCatalog, repoRemove, repoSave, repoSchema, runAction, stateGet, uiPrefsSave } from "./shared/contracts";
import { authStatus, fetchDetail, listCollaborators, listLabels, listRepos, mergePullRequest, postComment, searchBoardCached } from "./server/github";
import { dispatchItem as dispatch, doRunAction, onTurnEnd, tick } from "./server/engine";
import { readState, updateState } from "./server/store";

const POLL_INTERVAL_MS = 30_000;

type PaseoApi = PluginHandlerContext["paseo"];

export default function contribute(server: PluginServerContext) {
  // 一次性迁移：默认启用「全部仓库」监听（用户之后可手动删除）
  void updateState((state) => {
    if (!state.allReposSeeded) {
      if (!state.repos.some((r) => r.repo === ALL_REPOS)) {
        state.repos.unshift(repoSchema.parse({ repo: ALL_REPOS, enabled: true, pollMinutes: 5, prReview: { enabled: true }, issueHandle: { enabled: true } }));
      }
      state.allReposSeeded = true;
    }
  }).catch((error) => console.error("[paseo-github-workbench] 初始化默认监听失败:", error));

  // 定时轮询没有 handler 上下文，借用最近一次 RPC/hook 拿到的 paseo 会话
  let paseoRef: PaseoApi | null = null;
  const capture = (paseo: PaseoApi) => {
    paseoRef = paseo;
    return paseo;
  };

  server.handle(stateGet, async (_input, { paseo }) => {
    capture(paseo);
    return { state: await readState(), gh: await authStatus() };
  });

  server.handle(repoSave, async (input) => {
    const repo = input.repo.trim();
    if (repo !== "*" && !/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error("仓库格式应为 owner/name");
    for (const [name, advanced] of [["PR 评审", input.prReview.agent.advanced], ["Issue 处理", input.issueHandle.agent.advanced]] as const) {
      const text = advanced.trim();
      if (!text) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error(`${name}的 agent 高级配置不是合法 JSON`);
      }
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error(`${name}的 agent 高级配置必须是 JSON 对象`);
    }
    return {
      state: await updateState((state) => {
        const existing = state.repos.find((r) => r.repo === repo);
        if (existing) Object.assign(existing, input, { repo });
        else state.repos.push({ ...input, repo });
      }),
    };
  });

  server.handle(repoRemove, async ({ repo }) => ({
    state: await updateState((state) => {
      state.repos = state.repos.filter((r) => r.repo !== repo);
    }),
  }));

  server.handle(runAction, async ({ runId, action }, { paseo }) => {
    const message = await doRunAction(capture(paseo), runId, action);
    return { state: await readState(), message };
  });

  server.handle(pollNow, async (_input, { paseo }) => ({
    state: await readState(),
    message: await tick(capture(paseo)),
  }));

  server.handle(boardList, async ({ kind, state }) => {
    const auth = await authStatus();
    if (!auth.ok) throw new Error(auth.message);
    const kinds = kind === "all" ? (["pr", "issue"] as const) : ([kind] as const);
    const items = (await Promise.all(kinds.map((k) => searchBoardCached(auth.user, k, state)))).flat();
    items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return { items, user: auth.user };
  });

  server.handle(attentionBadge, async (_input, { paseo }) => {
    capture(paseo);
    try {
      const auth = await authStatus();
      if (!auth.ok) return { count: 0 };
      const state = await readState();
      const [prs, issues] = await Promise.all([
        searchBoardCached(auth.user, "pr", "open"),
        searchBoardCached(auth.user, "issue", "open"),
      ]);
      const hasRun = new Set(state.runs.map((r) => `${r.repo}#${r.number}:${r.kind}`));
      const undispatched = [...prs, ...issues].filter((i) => !hasRun.has(`${i.repo}#${i.number}:${i.kind}`)).length;
      const pendingRuns = state.runs.filter((r) => r.status === "awaiting_merge" || r.status === "failed").length;
      return { count: undispatched + pendingRuns };
    } catch {
      return { count: 0 };
    }
  });

  server.handle(dispatchItem, async ({ repo, kind, number, prompt, agent }, { paseo }) => {
    const message = await dispatch(capture(paseo), repo, kind, number, prompt, agent);
    return { state: await readState(), message };
  });

  server.handle(itemDetail, async ({ repo, kind, number }) => {
    const detail = await fetchDetail(repo, kind, number);
    return { repo, kind, number, ...detail };
  });

  server.handle(itemComment, async ({ repo, kind, number, body }) => {
    const text = body.trim();
    if (!text) throw new Error("评论内容不能为空");
    await postComment(repo, kind, number, text);
    return { ok: true };
  });

  server.handle(itemMerge, async ({ repo, number, method, auto }) => {
    await mergePullRequest(repo, number, method, auto);
    return { message: auto ? `已开启自动合并 ${repo}#${number}（等 checks 通过后合）` : `已合并 ${repo}#${number}` };
  });

  server.handle(uiPrefsSave, async (input) => {
    await updateState((state) => {
      state.ui = { ...state.ui, ...input };
    });
    return { ok: true };
  });

  server.handle(providerCatalog, async (_input, { paseo }) => {
    const snapshot = await paseo.providers.snapshot();
    const providers = (snapshot.entries ?? [])
      .filter((entry) => entry.enabled !== false)
      .map((entry) => ({
        id: entry.provider,
        label: entry.label ?? entry.provider,
        models: (entry.models ?? [])
          .filter((m) => m.isSelectable !== false)
          .map((m) => ({
            id: m.id,
            label: m.label,
            isDefault: m.isDefault === true,
            thinkingOptions: (m.thinkingOptions ?? []).map((o) => ({ id: o.id, label: o.label })),
          })),
        modes: (entry.modes ?? []).map((m) => ({ id: m.id, label: m.label })),
        defaultModeId: entry.defaultModeId ?? "",
      }))
      .filter((entry) => entry.models.length > 0);
    return { providers };
  });

  server.handle(ghReposList, async () => ({ repos: await listRepos() }));
  server.handle(ghLabelsList, async ({ repo }) => ({ labels: await listLabels(repo) }));
  server.handle(ghCollaboratorsList, async ({ repo }) => ({ users: await listCollaborators(repo) }));

  server.addHook("agent.turn.after", async (event, context) => {
    await onTurnEnd(capture(context.paseo), event.agent.id, event.turnId, event.outcome);
  });

  const timer = setInterval(() => {
    if (!paseoRef) return;
    void tick(paseoRef).catch((error) => {
      console.error("[paseo-github-workbench] 定时轮询失败:", error);
    });
  }, POLL_INTERVAL_MS);

  console.log("[paseo-github-workbench] server ready");
  return () => {
    clearInterval(timer);
  };
}