import { openExternalUrl, useRpc } from "@getpaseo/plugin/client";
import { Icon, Markdown } from "@getpaseo/plugin/client/ui";
import { useToast } from "@getpaseo/plugin/client/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type ComponentRef } from "react";
import { Text, TextInput, View } from "react-native";
import { ALL_REPOS, DEFAULT_ISSUE_PROMPT, DEFAULT_PR_REVIEW_PROMPT, dispatchItem, itemComment, itemDetail, itemMerge, type AgentSettings, type RepoConfig, type RunRecord } from "../shared/contracts";
import { DispatchPanel } from "./DispatchPanel";
import { Avatar, Btn, Card, Chips, Divider, ErrorNote, IconBtn, LoadingRow, Tag, relTime, type Tone, type Ui } from "./ui";
import { useI18n } from "./i18n";
import { revealOnFocus } from "./use-keyboard-inset";

const STATE_KEY = ["paseo-github-workbench", "state"];

export interface DetailTarget {
  repo: string;
  kind: "pr" | "issue";
  number: number;
}

function checkTone(status: string, conclusion: string): Tone {
  const c = conclusion.toLowerCase();
  if (c === "success") return "success";
  if (c === "failure" || c === "timed_out" || c === "cancelled") return "danger";
  if (c === "skipped" || c === "neutral") return "muted";
  const s = status.toLowerCase();
  if (s === "completed" || s === "success") return "success";
  if (s === "failure" || s === "error") return "danger";
  return "warning";
}

export function ItemDetail({ ui, target, runs, repos, navigation, onBack }: {
  ui: Ui;
  target: DetailTarget;
  runs: RunRecord[];
  repos: RepoConfig[];
  navigation?: { openAgent: (input: { agentId: string }) => void };
  onBack: () => void;
}) {
  const toast = useToast();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const detail = useRpc(itemDetail);
  const query = useQuery({
    queryKey: ["paseo-github-workbench", "detail", target.repo, target.kind, target.number],
    queryFn: () => detail(target),
  });
  const [comment, setComment] = useState("");
  const composerRef = useRef<ComponentRef<typeof View>>(null);
  const [mergeMethod, setMergeMethod] = useState<"merge" | "squash" | "rebase">("squash");

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: STATE_KEY });
    void query.refetch();
  };

  const dispatch = useRpc(dispatchItem);
  const [dispatchOpen, setDispatchOpen] = useState<null | "dispatch" | "fix">(null);
  const dispatchMutation = useMutation({
    mutationFn: (input: { prompt: string; agent: AgentSettings }) => dispatch({ ...target, ...input }),
    onSuccess: () => { setDispatchOpen(null); toast.show(t("runs.dispatched", { target: `${target.repo}#${target.number}` })); void queryClient.invalidateQueries({ queryKey: STATE_KEY }); },
    onError: (e) => toast.show(e instanceof Error ? e.message : String(e)),
  });

  const sendComment = useRpc(itemComment);
  const commentMutation = useMutation({
    mutationFn: () => sendComment({ ...target, body: comment }),
    onSuccess: () => { setComment(""); toast.show(t("detail.commentSent")); invalidate(); },
    onError: (e) => toast.show(e instanceof Error ? e.message : String(e)),
  });

  const merge = useRpc(itemMerge);
  const mergeMutation = useMutation({
    mutationFn: (auto: boolean) => merge({ repo: target.repo, number: target.number, method: mergeMethod, auto }),
    onSuccess: (_r, auto) => { toast.show(auto ? t("runs.autoMergeOk", { target: `${target.repo}#${target.number}` }) : t("runs.mergeOk", { target: `${target.repo}#${target.number}` })); invalidate(); },
    onError: (e) => toast.show(e instanceof Error ? e.message : String(e)),
  });

  const data = query.data;
  const latestRun = runs.filter((r) => r.repo === target.repo && r.number === target.number && r.kind === target.kind).at(-1);
  const failedChecks = (data?.checks ?? []).filter((c) => ["failure", "timed_out", "error"].includes(c.conclusion.toLowerCase()) || c.status.toLowerCase() === "failure");
  const cfg = repos.find((r) => r.repo === target.repo) ?? repos.find((r) => r.repo === ALL_REPOS);
  const pipeline = target.kind === "pr" ? cfg?.prReview : cfg?.issueHandle;
  const fixChecksPrompt = `请修复 {{repo}} PR #{{number}} 的失败检查。失败项：\n${failedChecks.map((c) => `- ${c.name}`).join("\n")}\n用 \`gh pr checks {{number}}\` 和 \`gh run view\` 查看失败日志，定位并修复，跑测试验证后 git commit 并 push。完成后最后一条消息只输出 JSON：{"verdict":"approve" 或 "changes_requested","summary":"修复摘要","comments":[]}`;

  return (
    <View style={ui.s.gap12}>
      <View style={[ui.s.row, { justifyContent: "space-between" }]}>
        <Btn ui={ui} label={t("detail.back")} icon="ArrowLeft" onPress={onBack} />
        {data ? <IconBtn ui={ui} icon="ExternalLink" label={t("common.openGitHub")} onPress={() => void openExternalUrl(data.url)} /> : null}
      </View>

      {query.isLoading ? <LoadingRow ui={ui} /> : null}
      {query.isError ? <ErrorNote ui={ui} message={query.error instanceof Error ? query.error.message : t("detail.readError")} onRetry={() => void query.refetch()} /> : null}

      {data ? (
        <>
          <Card ui={ui}>
            <View style={ui.s.gap8}>
              <View style={[ui.s.row, ui.s.gap8, { flexWrap: "wrap" }]}>
                <Icon name={data.kind === "pr" ? "GitPullRequest" : "CircleDot"} size={16} color={data.state.toLowerCase() === "open" ? ui.c.success : ui.c.muted} />
                <Text style={ui.s.h2}>{data.repo}#{data.number}</Text>
                <Tag ui={ui} label={data.state} tone={data.state.toLowerCase() === "open" ? "success" : "muted"} />
                {data.isDraft ? <Tag ui={ui} label="draft" tone="muted" /> : null}
                {data.reviewDecision ? <Tag ui={ui} label={data.reviewDecision} tone={data.reviewDecision === "APPROVED" ? "success" : "warning"} /> : null}
              </View>
              <Text style={[ui.s.body, { fontSize: 16, fontWeight: "600" }]}>{data.title}</Text>
              <View style={[ui.s.row, ui.s.gap8, { flexWrap: "wrap" }]}>
                <Avatar ui={ui} name={data.author} size={20} />
                <Text style={ui.s.muted}>{data.author}</Text>
                {data.labels.map((l) => <Tag key={l} ui={ui} label={l} tone="muted" />)}
              </View>
              <Divider ui={ui} />
              <View style={[ui.s.row, ui.s.gap6, { flexWrap: "wrap" }]}>
                <Btn ui={ui} label={t("common.dispatch")} icon="Bot" tone="primary" busy={dispatchMutation.isPending} onPress={() => setDispatchOpen(dispatchOpen === "dispatch" ? null : "dispatch")} />
                {latestRun?.agentId && navigation?.openAgent ? <Btn ui={ui} label={t("common.openAgent")} icon="Bot" onPress={() => navigation.openAgent({ agentId: latestRun.agentId })} /> : null}
                {data.kind === "pr" && data.state.toLowerCase() === "open" ? (
                  <>
                    <Btn ui={ui} label={t("detail.merge")} icon="GitMerge" busy={mergeMutation.isPending} disabled={data.isDraft} onPress={() => mergeMutation.mutate(false)} />
                    <Btn ui={ui} label={t("detail.autoMerge")} icon="Clock" busy={mergeMutation.isPending} disabled={data.isDraft} onPress={() => mergeMutation.mutate(true)} />
                    <Chips ui={ui} value={mergeMethod} onChange={(v) => setMergeMethod(v as "merge" | "squash" | "rebase")} options={[{ value: "merge", label: "merge" }, { value: "squash", label: "squash" }, { value: "rebase", label: "rebase" }]} />
                  </>
                ) : null}
              </View>
              {dispatchOpen ? (
                <DispatchPanel
                  ui={ui}
                  initialPrompt={dispatchOpen === "fix" ? fixChecksPrompt : (pipeline?.prompt ?? (target.kind === "pr" ? DEFAULT_PR_REVIEW_PROMPT : DEFAULT_ISSUE_PROMPT))}
                  initialAgent={pipeline?.agent}
                  busy={dispatchMutation.isPending}
                  onDispatch={(prompt, agent) => dispatchMutation.mutate({ prompt, agent })}
                  onCancel={() => setDispatchOpen(null)}
                />
              ) : null}
            </View>
          </Card>

          {data.kind === "pr" && data.checks.length > 0 ? (
            <Card ui={ui}>
              <View style={ui.s.gap8}>
                <Text style={ui.s.h2}>{t("detail.checks", { n: data.checks.length })}</Text>
                {data.checks.map((c, i) => (
                  <View key={`${c.name}-${i}`} style={[ui.s.row, ui.s.gap8]}>
                    <Tag ui={ui} label={c.conclusion || c.status || "pending"} tone={checkTone(c.status, c.conclusion)} />
                    <Text style={[ui.s.body, { flex: 1 }]} numberOfLines={1}>{c.name}</Text>
                  </View>
                ))}
                {failedChecks.length > 0 ? (
                  <Btn
                    ui={ui}
                    label={t("detail.fixChecks", { n: failedChecks.length })}
                    icon="Wrench"
                    tone="danger"
                    busy={dispatchMutation.isPending}
                    onPress={() => setDispatchOpen(dispatchOpen === "fix" ? null : "fix")}
                  />
                ) : null}
              </View>
            </Card>
          ) : null}

          {data.body ? (
            <Card ui={ui}>
              <View style={ui.s.gap8}>
                <Text style={ui.s.h2}>{t("detail.description")}</Text>
                <Markdown>{data.body}</Markdown>
              </View>
            </Card>
          ) : null}

          <View style={ui.s.gap8}>
            <Text style={ui.s.h2}>{t("detail.activity", { n: data.comments.length })}</Text>
            {data.comments.length === 0 ? (
              <Card ui={ui}><Text style={ui.s.tiny}>{t("detail.noComments")}</Text></Card>
            ) : null}
            {data.comments.map((c, i) => (
              <View key={i} style={ui.s.panel}>
                <View style={{ gap: 8, padding: ui.compact ? 12 : 16 }}>
                  <View style={[ui.s.row, ui.s.gap8]}>
                    <Avatar ui={ui} name={c.author} size={20} />
                    <Text style={[ui.s.h3, { flexShrink: 1 }]} numberOfLines={1}>{c.author}</Text>
                    <Text style={ui.s.tiny}>{relTime(c.createdAt)}</Text>
                  </View>
                  <View style={{ paddingLeft: 28 }}>
                    <Markdown>{c.body}</Markdown>
                  </View>
                </View>
              </View>
            ))}
          </View>

          <Card ui={ui}>
            <View style={ui.s.gap8}>
              <Text style={ui.s.h2}>{t("detail.commentTitle")}</Text>
              <View ref={composerRef} style={[ui.s.row, ui.s.gap8, { alignItems: "flex-end" }]}>
                <Avatar ui={ui} name="me" size={24} />
                <View style={{ flex: 1, borderWidth: 1, borderColor: ui.c.border, borderRadius: 8, backgroundColor: ui.c.surface0 }}>
                  <TextInput
                    value={comment}
                    onChangeText={setComment}
                    onFocus={() => revealOnFocus(composerRef)}
                    placeholder={t("detail.commentPlaceholder")}
                    placeholderTextColor={ui.c.faint}
                    multiline
                    style={{ minHeight: 70, paddingHorizontal: 11, paddingVertical: 8, color: ui.c.fg, fontSize: 14, textAlignVertical: "top" }}
                  />
                </View>
                <Btn ui={ui} label={t("common.send")} icon="Send" tone="primary" busy={commentMutation.isPending} disabled={!comment.trim()} onPress={() => commentMutation.mutate()} />
              </View>
            </View>
          </Card>
        </>
      ) : null}
    </View>
  );
}