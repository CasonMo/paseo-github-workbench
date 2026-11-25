import { useRpc } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { Text, View } from "react-native";
import { providerCatalog, type AgentSettings } from "../shared/contracts";
import { Field, Select, type Ui } from "./ui";
import { useI18n } from "./i18n";

export function AgentFields({ ui, value, onChange }: { ui: Ui; value: AgentSettings; onChange: (v: AgentSettings) => void }) {
  const { t } = useI18n();
  const catalog = useRpc(providerCatalog);
  const query = useQuery({ queryKey: ["paseo-github-workbench", "providers"], queryFn: () => catalog({}) });
  const providers = query.data?.providers ?? [];
  // provider/model 中 model id 可能含 "/"（如 pi/gateway/group/model），只按第一个 "/" 切分
  const slash = value.provider.indexOf("/");
  const providerId = slash < 0 ? "" : value.provider.slice(0, slash);
  const modelId = slash < 0 ? "" : value.provider.slice(slash + 1);
  const entry = providers.find((p) => p.id === providerId);
  const model = entry?.models.find((m) => m.id === modelId);
  const defaultMode = entry?.modes.find((m) => m.id === entry.defaultModeId);
  const modelOptions = [
    { value: "", label: t("auto.agentModelDefault") },
    ...providers.flatMap((p) => p.models.map((m) => ({ value: `${p.id}/${m.id}`, label: `${p.label} / ${m.label}${m.isDefault ? " ★" : ""}` }))),
  ];
  const thinkingOptions = [
    { value: "", label: t("auto.agentOptionDefault") },
    ...(model?.thinkingOptions ?? []).map((o) => ({ value: o.id, label: o.label })),
  ];
  const modeOptions = [
    { value: "", label: entry ? t("auto.agentModeDefault", { mode: defaultMode?.label ?? (entry.defaultModeId || "-") }) : t("auto.agentOptionDefault") },
    ...(entry?.modes ?? []).map((m) => ({ value: m.id, label: m.label })),
  ];
  return (
    <View style={ui.s.gap6}>
      <Text style={ui.s.label}>{t("auto.agentModel")}</Text>
      <Select ui={ui} value={value.provider} options={modelOptions} onChange={(v) => onChange({ ...value, provider: v, thinkingOptionId: "", modeId: "" })} placeholder={t("auto.agentModelDefault")} />
      <Text style={ui.s.label}>{t("auto.agentThinking")}</Text>
      <Select ui={ui} value={value.thinkingOptionId} options={thinkingOptions} onChange={(v) => onChange({ ...value, thinkingOptionId: v })} disabled={!model} placeholder={model ? t("auto.agentOptionDefault") : t("auto.agentPickModelFirst")} />
      <Text style={ui.s.label}>{t("auto.agentMode")}</Text>
      <Select ui={ui} value={value.modeId} options={modeOptions} onChange={(v) => onChange({ ...value, modeId: v })} disabled={!entry} placeholder={entry ? t("auto.agentOptionDefault") : t("auto.agentPickModelFirst")} />
      <Field ui={ui} label={t("auto.agentAdvanced")} hint={t("auto.agentAdvancedHint")} value={value.advanced} onChangeText={(v) => onChange({ ...value, advanced: v })} multiline placeholder='{"options":{…}}' />
    </View>
  );
}