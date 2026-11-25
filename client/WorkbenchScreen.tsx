import { openExternalUrl, useRpc, type PluginScreenProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import { useToast } from "@getpaseo/plugin/client/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ComponentRef } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { pollNow, runAction, stateGet, uiPrefsSave, type RunRecord } from "../shared/contracts";
import { Board } from "./Board";
import { useI18n, setLanguageMode, type LanguageMode } from "./i18n";
import { RepoSettings } from "./RepoSettings";
import { useKeyboardInset } from "./use-keyboard-inset";
import { Avatar, Btn, Card, Chips, Empty, ErrorNote, IconBtn, Select, Tag, useUi, type Tone } from "./ui";

const STATE_KEY = ["paseo-github-workbench", "state"];

const FILTERS = ["all", "running", "awaiting", "done", "failed"] as const;
type Filter = (typeof FILTERS)[number];

function matchFilter(run: RunRecord, filter: Filter): boolean {
  switch (filter) {
    case "all": return true;
    case "running": return run.status === "running";
    case "awaiting": return run.status === "awaiting_merge";
    case "done": return run.status === "done";
    case "failed": return run.status === "failed";
  }
}

export function WorkbenchScreen({ theme, layout, navigation }: PluginScreenProps) {
  const ui = useUi(theme, layout.compact);
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"board" | "runs" | "repos">("board");
  const [filter, setFilter] = useState<Filter>("all");
  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const rootRef = useRef<ComponentRef<typeof View>>(null);
  const keyboardInset = useKeyboardInset(rootRef);

  const getState = useRpc(stateGet);
  const query = useQuery({ queryKey: STATE_KEY, queryFn: () => getState({}), refetchInterval: 4000 });
  const savePrefs = useRpc(uiPrefsSave);

  const language = query.data?.state.ui.language ?? "auto";
  useEffect(() => {
    setLanguageMode(language as LanguageMode);
  }, [language]);

  const statusMeta: Record<RunRecord["status"], { label: string; tone: Tone; icon: string }> = {
    running: { label: t("runs.status.running"), tone: "accent", icon: "Loader" },
    awaiting_merge: { label: t("runs.status.awaiting"), tone: "warning", icon: "GitMerge" },
    done: { label: t("runs.status.done"), tone: "success", icon: "Check" },
    failed: { label: t("runs.status.failed"), tone: "danger", icon: "AlertCircle" },
  };

  const doPoll = useRpc(pollNow);
  const pollMutation = useMutation({
    mutationFn: () => doPoll({}),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: STATE_KEY }),
  });

  const act = useRpc(runAction);
  const actionMutation = useMutation({
    mutationFn: (input: { runId: string; action: "merge" | "skip" | "retry" }) => act(input),
    onSuccess: (result, input) => {
      const run = (query.data?.state.runs ?? []).find((r) => r.id === input.runId);
      const target = run ? `${run.repo}#${run.number}` : "";
      if (input.action === "merge") toast.show(t("runs.mergeOk", { target }));
      else if (input.action === "skip") toast.show(t("runs.skipped"));
      else toast.show(t("runs.retried", { target }));
      void queryClient.invalidateQueries({ queryKey: STATE_KEY });
    },
    onError: (e) => toast.show(e instanceof Error ? e.message : String(e)),
  });

  const state = query.data?.state;
  const gh = query.data?.gh;
  const runs = (state?.runs ?? []).filter((r) => matchFilter(r, filter)).slice().reverse();
  const awaitingCount = (state?.runs ?? []).filter((r) => r.status === "awaiting_merge").length;

  return (
    <View ref={rootRef} style={[{ flex: 1, backgroundColor: ui.c.canvas }, keyboardInset > 0 ? { marginBottom: keyboardInset } : null]}>
      <ScrollView contentContainerStyle={{ padding: ui.compact ? 12 : 20, gap: 14, maxWidth: 920, width: "100%", alignSelf: "center" }}>
        <View style={[ui.s.row, { justifyContent: "space-between", flexWrap: "wrap", gap: 8 }]}>
          <View style={[ui.s.row, ui.s.gap8]}>
            <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: ui.c.fill, alignItems: "center", justifyContent: "center" }}>
              <Icon name="GitPullRequest" size={17} color={ui.c.accent} />
            </View>
            <Text style={ui.s.title}>{t("app.title")}</Text>
          </View>
          <View style={[ui.s.row, ui.s.gap8]}>
            <View style={{ width: 120 }}>
              <Select
                ui={ui}
                value={language}
                onChange={(v) => { setLanguageMode(v as LanguageMode); void savePrefs({ language: v as LanguageMode }).catch(() => {}); }}
                options={[{ value: "auto", label: t("lang.auto"), icon: "Languages" }, { value: "zh", label: t("lang.zh") }, { value: "en", label: t("lang.en") }]}
                searchable={false}
              />
            </View>
            {gh ? <Tag ui={ui} label={gh.ok ? gh.user : t("app.ghUnauth")} tone={gh.ok ? "success" : "danger"} icon={gh.ok ? "Check" : "AlertCircle"} /> : null}
            <Btn ui={ui} label={t("app.pollNow")} icon="RefreshCw" busy={pollMutation.isPending} onPress={() => pollMutation.mutate()} />
          </View>
        </View>
        {gh && !gh.ok ? <ErrorNote ui={ui} message={gh.message} /> : null}

        <Chips
          ui={ui}
          value={tab}
          onChange={(v) => setTab(v as "board" | "runs" | "repos")}
          options={[
            { value: "board", label: t("tab.board"), icon: "LayoutGrid" },
            { value: "runs", label: awaitingCount > 0 ? t("tab.runsAwaiting", { n: awaitingCount }) : t("tab.runs"), icon: "Activity" },
            { value: "repos", label: t("tab.automation"), icon: "Zap" },
          ]}
        />

        {query.isError ? <ErrorNote ui={ui} message={t("app.stateError")} onRetry={() => void query.refetch()} /> : null}

        {tab === "board" ? (
          <Board ui={ui} runs={state?.runs ?? []} repoConfigs={state?.repos ?? []} navigation={navigation} prefs={state?.ui} />
        ) : tab === "repos" ? (
          <RepoSettings ui={ui} state={state} />
        ) : (
          <View style={ui.s.gap12}>
            <Chips ui={ui} value={filter} onChange={(v) => setFilter(v as Filter)} options={FILTERS.map((f) => ({ value: f, label: t(`runs.filter.${f}` as const) }))} />
            {runs.length === 0 ? (
              <Empty ui={ui} icon="Activity" title={t("runs.emptyTitle")} description={t("runs.emptyDesc")} />
            ) : null}
            {runs.map((run) => {
              const meta = statusMeta[run.status];
              const open = openRunId === run.id;
              return (
                <Card key={run.id} ui={ui} padded={false}>
                  <Pressable accessibilityRole="button" onPress={() => setOpenRunId(open ? null : run.id)} style={({ pressed }) => [{ padding: ui.compact ? 12 : 16, gap: 8 }, pressed && ui.s.pressed]}>
                    <View style={[ui.s.row, ui.s.gap8, { flexWrap: "wrap" }]}>
                      <Avatar ui={ui} name={run.author} size={22} />
                      <Text style={[ui.s.h3, { flexShrink: 1 }]} numberOfLines={1}>{run.repo}#{run.number}</Text>
                      <Tag ui={ui} label={meta.label} tone={meta.tone} icon={meta.icon} />
                      {run.merged ? <Tag ui={ui} label={t("runs.merged")} tone="success" icon="GitMerge" /> : null}
                      {run.commentPosted ? <Tag ui={ui} label={t("runs.commented")} tone="muted" icon="MessageSquare" /> : null}
                      <View style={ui.s.grow} />
                      <Icon name={open ? "ChevronDown" : "ChevronRight"} size={15} color={ui.c.faint} />
                    </View>
                    <Text style={ui.s.muted} numberOfLines={open ? undefined : 1}>{run.title}</Text>
                  </Pressable>
                  {open ? (
                    <View style={{ paddingHorizontal: ui.compact ? 12 : 16, paddingBottom: 12, gap: 8 }}>
                      {run.verdict ? <Text style={ui.s.body}>{t("runs.verdict", { v: run.verdict })}</Text> : null}
                      {run.summary ? <Text style={ui.s.body}>{run.summary}</Text> : null}
                      {run.error ? <ErrorNote ui={ui} message={run.error} /> : null}
                      <Text style={ui.s.tiny}>{run.author} · {new Date(run.createdAt).toLocaleString()}</Text>
                    </View>
                  ) : null}
                  <View style={[ui.s.row, ui.s.gap6, { paddingHorizontal: ui.compact ? 12 : 16, paddingBottom: 12, flexWrap: "wrap" }]}>
                    {run.status === "awaiting_merge" ? (
                      <>
                        <Btn ui={ui} label={t("runs.approveMerge")} icon="GitMerge" tone="primary" busy={actionMutation.isPending} onPress={() => actionMutation.mutate({ runId: run.id, action: "merge" })} />
                        <Btn ui={ui} label={t("common.skip")} onPress={() => actionMutation.mutate({ runId: run.id, action: "skip" })} />
                      </>
                    ) : null}
                    {run.status === "failed" ? <Btn ui={ui} label={t("common.retry")} icon="RefreshCw" busy={actionMutation.isPending} onPress={() => actionMutation.mutate({ runId: run.id, action: "retry" })} /> : null}
                    {run.agentId && navigation?.openAgent ? <Btn ui={ui} label={t("common.openAgent")} icon="Bot" onPress={() => navigation.openAgent({ agentId: run.agentId })} /> : null}
                    <IconBtn ui={ui} icon="ExternalLink" label={t("common.openGitHub")} onPress={() => void openExternalUrl(run.url)} />
                  </View>
                </Card>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}