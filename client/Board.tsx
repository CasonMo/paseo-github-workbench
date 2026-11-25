import { openExternalUrl, useRpc } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import { useToast } from "@getpaseo/plugin/client/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { ALL_REPOS, DEFAULT_ISSUE_PROMPT, DEFAULT_PR_REVIEW_PROMPT, boardList, dispatchItem, uiPrefsSave, type AgentSettings, type RepoConfig, type RunRecord, type WorkbenchState } from "../shared/contracts";
import { ItemDetail, type DetailTarget } from "./ItemDetail";
import { DispatchPanel } from "./DispatchPanel";
import { useI18n } from "./i18n";
import { revealOnFocus } from "./use-keyboard-inset";
import { Avatar, Btn, Card, Chips, Empty, ErrorNote, IconBtn, LoadingRow, Select, Tag, relTime, type Tone, type Ui } from "./ui";

const STATE_KEY = ["paseo-github-workbench", "state"];

const RUN_STATUS_TONE: Record<RunRecord["status"], Tone> = {
  running: "accent",
  awaiting_merge: "warning",
  done: "success",
  failed: "danger",
};
const RUN_STATUS_KEY = { running: "runs.status.running", awaiting_merge: "runs.status.awaiting", done: "runs.status.done", failed: "runs.status.failed" } as const;

export function Board({ ui, runs, repoConfigs, navigation, prefs }: { ui: Ui; runs: RunRecord[]; repoConfigs: RepoConfig[]; navigation?: { openAgent: (input: { agentId: string }) => void }; prefs?: WorkbenchState["ui"] }) {
  const toast = useToast();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<"all" | "pr" | "issue">(prefs?.boardKind ?? "all");
  const [stateFilter, setStateFilter] = useState<"open" | "closed" | "all">(prefs?.boardState ?? "all");
  const [repoFilter, setRepoFilter] = useState(prefs?.boardRepo ?? "");
  const [search, setSearch] = useState("");
  const searchRef = useRef<ComponentRef<typeof View>>(null);
  const [selected, setSelected] = useState<DetailTarget | null>(null);

  const savePrefs = useRpc(uiPrefsSave);
  const touched = useRef(false);
  const persist = (patch: Partial<WorkbenchState["ui"]>) => {
    touched.current = true;
    void savePrefs(patch).catch(() => {});
  };
  useEffect(() => {
    if (touched.current || !prefs) return;
    setKind(prefs.boardKind);
    setStateFilter(prefs.boardState);
    setRepoFilter(prefs.boardRepo);
  }, [prefs]);

  const list = useRpc(boardList);
  const query = useQuery({
    queryKey: ["paseo-github-workbench", "board", kind, stateFilter],
    queryFn: () => list({ kind, state: stateFilter }),
    refetchInterval: 30_000,
  });
  const dispatch = useRpc(dispatchItem);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [dispatchFor, setDispatchFor] = useState<string | null>(null);
  const dispatchMutation = useMutation({
    mutationFn: (input: { repo: string; kind: "pr" | "issue"; number: number; prompt: string; agent: AgentSettings }) => {
      setPendingKey(`${input.repo}#${input.number}`);
      return dispatch(input);
    },
    onSettled: () => setPendingKey(null),
    onSuccess: (result) => {
      setDispatchFor(null);
      toast.show(t("runs.dispatched", { target: `${result.state.runs.at(-1)?.repo ?? ""}#${result.state.runs.at(-1)?.number ?? ""}` }));
      void queryClient.invalidateQueries({ queryKey: STATE_KEY });
    },
    onError: (error) => toast.show(error instanceof Error ? error.message : String(error)),
  });

  const pipelineFor = (repo: string, kind: "pr" | "issue") => {
    const cfg = repoConfigs.find((r) => r.repo === repo) ?? repoConfigs.find((r) => r.repo === ALL_REPOS);
    return kind === "pr" ? cfg?.prReview : cfg?.issueHandle;
  };

  const allItems = query.data?.items ?? [];
  const repos = useMemo(() => [...new Set(allItems.map((i) => i.repo))].sort(), [allItems]);
  const keyword = search.trim().toLowerCase();
  const items = allItems.filter(
    (i) =>
      (!repoFilter || i.repo === repoFilter) &&
      (!keyword || i.title.toLowerCase().includes(keyword) || i.repo.toLowerCase().includes(keyword) || String(i.number).includes(keyword)),
  );

  if (selected) {
    return <ItemDetail ui={ui} target={selected} runs={runs} repos={repoConfigs} navigation={navigation} onBack={() => setSelected(null)} />;
  }

  return (
    <View style={ui.s.gap12}>
      <View style={[ui.s.row, { justifyContent: "space-between", flexWrap: "wrap", gap: 8 }]}>
        <View style={[ui.s.row, ui.s.gap6, { flexWrap: "wrap" }]}>
          <Chips ui={ui} value={kind} onChange={(k) => { setKind(k); persist({ boardKind: k }); }} options={[{ value: "all", label: t("common.all") }, { value: "pr", label: t("board.pr"), icon: "GitPullRequest" }, { value: "issue", label: t("board.issue"), icon: "CircleDot" }]} />
          <Chips ui={ui} value={stateFilter} onChange={(s) => { setStateFilter(s); persist({ boardState: s }); }} options={[{ value: "open", label: t("common.open") }, { value: "closed", label: t("common.closed") }, { value: "all", label: t("common.allStates") }]} />
        </View>
        <IconBtn ui={ui} icon="RefreshCw" label={t("common.refresh")} busy={query.isFetching} onPress={() => void query.refetch()} />
      </View>

      <View style={[ui.s.row, ui.s.gap8, { flexWrap: "wrap" }]}>
        <View style={{ flex: 1, minWidth: 180 }}>
          <Select ui={ui} value={repoFilter} onChange={(v) => { setRepoFilter(v); persist({ boardRepo: v }); }} placeholder={t("common.allRepos")} options={[{ value: "", label: t("common.allRepos"), icon: "FolderGit2" }, ...repos.map((r) => ({ value: r, label: r }))]} />
        </View>
        <View ref={searchRef} style={[ui.s.row, ui.s.gap6, { flex: 1, minWidth: 180, borderWidth: 1, borderColor: ui.c.border, borderRadius: 8, backgroundColor: ui.c.surface0, paddingHorizontal: 10, minHeight: 32 }]}>
          <Icon name="Search" size={13} color={ui.c.faint} />
          <TextInput value={search} onChangeText={setSearch} onFocus={() => revealOnFocus(searchRef)} placeholder={t("board.searchPlaceholder")} placeholderTextColor={ui.c.faint} autoCapitalize="none" style={{ flex: 1, fontSize: 13, color: ui.c.fg, paddingVertical: 6 }} />
        </View>
      </View>

      {query.isError ? <ErrorNote ui={ui} message={query.error instanceof Error ? query.error.message : t("board.readError")} onRetry={() => void query.refetch()} /> : null}
      {query.isLoading ? <LoadingRow ui={ui} /> : null}
      {!query.isLoading && items.length === 0 ? <Empty ui={ui} icon="Inbox" title={t("board.emptyTitle")} description={t("board.emptyDesc")} /> : null}

      <View style={ui.s.gap8}>
        {items.map((item) => {
          const key = `${item.repo}#${item.number}`;
          const latestRun = runs.filter((r) => r.repo === item.repo && r.number === item.number && r.kind === item.kind).at(-1);
          const pending = pendingKey === key;
          return (
            <Card key={key} ui={ui} padded={false}>
              <Pressable accessibilityRole="button" onPress={() => setSelected({ repo: item.repo, kind: item.kind, number: item.number })} style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [{ padding: ui.compact ? 12 : 14, gap: 8 }, hovered && { backgroundColor: ui.c.fillHover }, pressed && ui.s.pressed]}>
                <View style={[ui.s.row, ui.s.gap8, { flexWrap: "wrap" }]}>
                  <Icon name={item.kind === "pr" ? "GitPullRequest" : "CircleDot"} size={15} color={item.state === "open" ? ui.c.success : ui.c.muted} />
                  <Text style={[ui.s.h3, { flexShrink: 1 }]} numberOfLines={1}>{item.title}</Text>
                  <View style={ui.s.grow} />
                  {item.state !== "open" ? <Tag ui={ui} label={item.state} tone={item.state === "merged" ? "success" : "muted"} /> : null}
                  {item.isDraft ? <Tag ui={ui} label="draft" tone="muted" /> : null}
                  {latestRun ? <Tag ui={ui} label={t(RUN_STATUS_KEY[latestRun.status])} tone={RUN_STATUS_TONE[latestRun.status]} /> : null}
                </View>
                <View style={[ui.s.row, ui.s.gap8, { flexWrap: "wrap" }]}>
                  <Avatar ui={ui} name={item.author} size={18} />
                  <Text style={ui.s.tiny}>{item.repo}#{item.number}</Text>
                  <Text style={ui.s.tiny}>{item.author}</Text>
                  <Text style={ui.s.tiny}>{relTime(item.updatedAt)}</Text>
                  {item.labels.slice(0, 3).map((l) => <Tag key={l} ui={ui} label={l} tone="muted" />)}
                </View>
              </Pressable>
              <View style={[ui.s.row, ui.s.gap6, { paddingHorizontal: ui.compact ? 12 : 14, paddingBottom: 12, flexWrap: "wrap" }]}>
                <Btn ui={ui} label={latestRun?.status === "running" ? t("common.redispatch") : t("common.dispatch")} icon="Bot" tone="primary" busy={pending} onPress={() => setDispatchFor(dispatchFor === key ? null : key)} />
                {latestRun?.agentId && navigation?.openAgent ? <Btn ui={ui} label={t("common.openAgent")} icon="Bot" onPress={() => navigation.openAgent({ agentId: latestRun.agentId })} /> : null}
                <IconBtn ui={ui} icon="ExternalLink" label={t("common.openGitHub")} onPress={() => void openExternalUrl(item.url)} />
              </View>
              {dispatchFor === key ? (
                <View style={{ paddingHorizontal: ui.compact ? 12 : 14, paddingBottom: 12 }}>
                  <DispatchPanel
                    ui={ui}
                    initialPrompt={pipelineFor(item.repo, item.kind)?.prompt ?? (item.kind === "pr" ? DEFAULT_PR_REVIEW_PROMPT : DEFAULT_ISSUE_PROMPT)}
                    initialAgent={pipelineFor(item.repo, item.kind)?.agent}
                    busy={pending}
                    onDispatch={(prompt, agent) => dispatchMutation.mutate({ repo: item.repo, kind: item.kind, number: item.number, prompt, agent })}
                    onCancel={() => setDispatchFor(null)}
                  />
                </View>
              ) : null}
            </Card>
          );
        })}
      </View>
    </View>
  );
}