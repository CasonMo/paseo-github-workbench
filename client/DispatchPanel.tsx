import { useState } from "react";
import { View } from "react-native";
import { agentSettingsSchema, type AgentSettings } from "../shared/contracts";
import { AgentFields } from "./AgentFields";
import { Btn, Field, type Ui } from "./ui";
import { useI18n } from "./i18n";

export function DispatchPanel({ ui, initialPrompt, initialAgent, busy, onDispatch, onCancel }: {
  ui: Ui;
  initialPrompt: string;
  initialAgent?: AgentSettings;
  busy?: boolean;
  onDispatch: (prompt: string, agent: AgentSettings) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [prompt, setPrompt] = useState(initialPrompt);
  const [agent, setAgent] = useState<AgentSettings>(initialAgent ?? agentSettingsSchema.parse({}));
  return (
    <View style={ui.s.gap12}>
      <Field ui={ui} label={t("dispatch.promptLabel")} hint={t("auto.promptHint")} value={prompt} onChangeText={setPrompt} multiline />
      <AgentFields ui={ui} value={agent} onChange={setAgent} />
      <View style={[ui.s.row, ui.s.gap8]}>
        <Btn ui={ui} label={t("common.dispatch")} icon="Bot" tone="primary" busy={busy} disabled={!prompt.trim()} onPress={() => onDispatch(prompt, agent)} />
        <Btn ui={ui} label={t("common.cancel")} icon="X" onPress={onCancel} />
      </View>
    </View>
  );
}