import { useRpc } from "@getpaseo/plugin/client";
import { useToast } from "@getpaseo/plugin/client/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  ALL_REPOS,
  ghCollaboratorsList,
  ghLabelsList,
  ghReposList,
  repoRemove,
  repoSave,
  repoSchema,
  type AgentSettings,
  type RepoConfig,
  type WorkbenchState,
} from "../shared/contracts";
import { AgentFields } from "./AgentFields";
import { Btn, Card, Chips, Divider, Field, Select, Toggle, type Ui } from "./ui";
import { useI18n } from "./i18n";

const STATE_KEY = ["paseo-github-workbench", "state"];

function RepoPicker({ ui, value, onChange }: { ui: Ui; value: string; onChange: (v: string) => void }) {
  const { t } = useI18n();
  const list = useRpc(ghReposList);
  const query = useQuery({ queryKey: ["paseo-github-workbench", "gh-repos"], queryFn: () => list({}) });
  const options = [
    { value: ALL_REPOS, label: t("common.allReposLong"), icon: "FolderGit2" },
    ...(query.data?.repos ?? []).map((r) => ({ value: r, label: r })),
  ];
  return <Select ui={ui} value={value} options={options} onChange={onChange} placeholder={t("common.selectRepo")} />;
}

function LabelPicker({ ui, repo, value, onChange }: { ui: Ui; repo: string; value: string; onChange: (v: string) => void }) {
  const { t } = useI18n();
  const list = useRpc(ghLabelsList);
  const query = useQuery({
    queryKey: ["paseo-github-workbench", "gh-labels", repo],
    queryFn: () => list({ repo }),
    enabled: repo.includes("/"),
  });
  const options = [
    { value: "", label: t("common.allIssues") },
    ...(query.data?.labels ?? []).map((l) => ({ value: l, label: l })),
  ];
  return <Select ui={ui} value={value} options={options} onChange={onChange} placeholder={t("common.selectLabel")} />;
}

function AuthorsField({ ui, repo, value, onChange }: { ui: Ui; repo: string; value: string; onChange: (v: string) => void }) {
  const { t } = useI18n();
  const list = useRpc(ghCollaboratorsList);
  const query = useQuery({
    queryKey: ["paseo-github-workbench", "gh-collaborators", repo],
    queryFn: () => list({ repo }),
    enabled: repo.includes("/"),
  });
  const selected = value.split(",").map((s) => s.trim()).filter(Boolean);
  const toggle = (user: string) => {
    const next = selected.includes(user) ? selected.filter((u) => u !== user) : [...selected, user];
    onChange(next.join(","));
  };
  const users = query.data?.users ?? [];
  return (
    <View style={ui.s.gap6}>
      {users.length > 0 ? (
        <View style={[ui.s.row, ui.s.gap6, { flexWrap: "wrap" }]}>
          {users.map((u) => (
            <Pressable key={u} accessibilityRole="button" onPress={() => toggle(u)} style={({ pressed }) => [ui.s.chip, selected.includes(u) && ui.s.chipActive, pressed && ui.s.pressed]}>
              <Text style={[ui.s.chipText, selected.includes(u) && ui.s.chipTextActive]}>{u}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <Field ui={ui} value={value} onChangeText={onChange} placeholder={t("auto.authorsPlaceholder")} />
    </View>
  );
}

function PipelineEditor({ ui, title, repo, value, onChange, children }: {
  ui: Ui;
  title: string;
  repo: string;
  value: { enabled: boolean; agent: AgentSettings; prompt: string; authors: string; commentTemplate: string; followUpPrompt: string };
  onChange: (patch: Partial<RepoConfig["prReview"] & RepoConfig["issueHandle"]>) => void;
  children?: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <Card ui={ui}>
      <View style={ui.s.gap12}>
        <Toggle ui={ui} label={title} value={value.enabled} onChange={(v) => onChange({ enabled: v })} />
        {value.enabled ? (
          <View style={ui.s.gap12}>
            <Field ui={ui} label={t("auto.promptTemplate")} hint={t("auto.promptHint")} value={value.prompt} onChangeText={(v) => onChange({ prompt: v })} multiline />
            <AgentFields ui={ui} value={value.agent} onChange={(agent) => onChange({ agent })} />
            <View style={ui.s.gap6}>
              <Text style={ui.s.label}>{t("auto.authors")}</Text>
              <AuthorsField ui={ui} repo={repo} value={value.authors} onChange={(v) => onChange({ authors: v })} />
            </View>
            {children}
            <Field ui={ui} label={t("auto.followUpPrompt")} hint={t("auto.followUpHint")} value={value.followUpPrompt} onChangeText={(v) => onChange({ followUpPrompt: v })} multiline />
            <Field ui={ui} label={t("auto.commentTemplate")} hint={t("auto.commentHint")} value={value.commentTemplate} onChangeText={(v) => onChange({ commentTemplate: v })} multiline />
          </View>
        ) : null}
      </View>
    </Card>
  );
}

function RepoEditor({ ui, repo }: { ui: Ui; repo: RepoConfig }) {
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<RepoConfig>(repo);
  const [expanded, setExpanded] = useState(false);
  const save = useRpc(repoSave);
  const remove = useRpc(repoRemove);
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: STATE_KEY });
  const saveMutation = useMutation({
    mutationFn: () => save(draft),
    onSuccess: () => { toast.show(t("common.saved")); invalidate(); },
    onError: (e) => toast.show(e instanceof Error ? e.message : String(e)),
  });
  const removeMutation = useMutation({
    mutationFn: () => remove({ repo: repo.repo }),
    onSuccess: () => { toast.show(t("common.deleted")); invalidate(); },
    onError: (e) => toast.show(e instanceof Error ? e.message : String(e)),
  });

  const patchPr = (patch: Partial<RepoConfig["prReview"]>) => setDraft((d) => ({ ...d, prReview: { ...d.prReview, ...patch } }));
  const patchIssue = (patch: Partial<RepoConfig["issueHandle"]>) => setDraft((d) => ({ ...d, issueHandle: { ...d.issueHandle, ...patch } }));

  return (
    <Card ui={ui} padded={false}>
      <View style={[ui.s.row, { justifyContent: "space-between", padding: ui.compact ? 12 : 16, gap: 8, flexWrap: "wrap" }]}>
        <Pressable accessibilityRole="button" onPress={() => setExpanded(!expanded)} style={{ flex: 1 }}>
          <Text style={ui.s.h2}>{repo.repo === ALL_REPOS ? t("common.allRepos") : repo.repo}</Text>
          <Text style={ui.s.tiny}>{t("auto.everyMinutes", { n: repo.pollMinutes })} · {t("auto.prSummary", { pr: repo.prReview.enabled ? t("common.on") : t("common.off"), issue: repo.issueHandle.enabled ? t("common.on") : t("common.off") })}</Text>
        </Pressable>
        <Toggle ui={ui} label={t("common.enable")} value={draft.enabled} onChange={(v) => setDraft((d) => ({ ...d, enabled: v }))} />
      </View>
      {expanded ? (
        <View style={{ paddingHorizontal: ui.compact ? 12 : 16, paddingBottom: 16, gap: 12 }}>
          <Divider ui={ui} />
          <View style={ui.s.gap6}>
            <Text style={ui.s.label}>{t("auto.pollInterval")}</Text>
            <Chips ui={ui} value={String(draft.pollMinutes)} onChange={(v) => setDraft((d) => ({ ...d, pollMinutes: Number(v) }))} options={[1, 5, 15, 30, 60].map((m) => ({ value: String(m), label: t("common.minutes", { n: m }) }))} />
          </View>
          <PipelineEditor ui={ui} title={t("auto.prReview")} repo={draft.repo} value={draft.prReview} onChange={patchPr}>
            <Toggle ui={ui} label={t("auto.autoMerge")} value={draft.prReview.autoMerge} onChange={(v) => patchPr({ autoMerge: v })} />
            <View style={ui.s.gap6}>
              <Text style={ui.s.label}>{t("auto.mergeMethod")}</Text>
              <Chips ui={ui} value={draft.prReview.mergeMethod} onChange={(v) => patchPr({ mergeMethod: v as RepoConfig["prReview"]["mergeMethod"] })} options={[{ value: "merge", label: "merge" }, { value: "squash", label: "squash" }, { value: "rebase", label: "rebase" }]} />
            </View>
          </PipelineEditor>
          <PipelineEditor ui={ui} title={t("auto.issueHandle")} repo={draft.repo} value={draft.issueHandle} onChange={patchIssue}>
            <View style={ui.s.gap6}>
              <Text style={ui.s.label}>{t("auto.triggerLabel")}</Text>
              <LabelPicker ui={ui} repo={draft.repo} value={draft.issueHandle.label} onChange={(v) => patchIssue({ label: v })} />
            </View>
          </PipelineEditor>
          <View style={[ui.s.row, ui.s.gap8]}>
            <Btn ui={ui} label={t("common.save")} icon="Check" tone="primary" busy={saveMutation.isPending} onPress={() => saveMutation.mutate()} />
            <Btn ui={ui} label={t("common.delete")} icon="Trash2" tone="danger" busy={removeMutation.isPending} onPress={() => removeMutation.mutate()} />
          </View>
        </View>
      ) : null}
    </Card>
  );
}

export function RepoSettings({ ui, state }: { ui: Ui; state: WorkbenchState | undefined }) {
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [newRepo, setNewRepo] = useState("");
  const save = useRpc(repoSave);
  const addMutation = useMutation({
    mutationFn: () => save(repoSchema.parse({ repo: newRepo.trim(), enabled: true, pollMinutes: 5 })),
    onSuccess: () => { setNewRepo(""); toast.show(t("auto.added")); void queryClient.invalidateQueries({ queryKey: STATE_KEY }); },
    onError: (e) => toast.show(e instanceof Error ? e.message : String(e)),
  });

  return (
    <View style={ui.s.gap12}>
      <Text style={ui.s.muted}>{t("auto.intro")}</Text>
      <Card ui={ui}>
        <View style={ui.s.gap8}>
          <Text style={ui.s.h2}>{t("auto.addTitle")}</Text>
          <RepoPicker ui={ui} value={newRepo} onChange={setNewRepo} />
          <View style={[ui.s.row, { justifyContent: "flex-end" }]}>
            <Btn ui={ui} label={t("common.add")} icon="Plus" tone="primary" busy={addMutation.isPending} disabled={!newRepo.trim()} onPress={() => addMutation.mutate()} />
          </View>
        </View>
      </Card>
      {(state?.repos ?? []).map((repo) => (
        <RepoEditor key={repo.repo} ui={ui} repo={repo} />
      ))}
    </View>
  );
}