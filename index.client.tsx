import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text } from "react-native";
import { attentionBadge } from "./shared/contracts";
import { useI18n } from "./client/i18n";
import { WorkbenchScreen } from "./client/WorkbenchScreen";

// 与 assets/icon.png 同款蓝绿发光分支图形（侧边栏只接受 Lucide/内联 SVG/组件）
const BRAND_ICON = {
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><defs><linearGradient id="gwb" x1="9" y1="5" x2="18" y2="15" gradientUnits="userSpaceOnUse"><stop stop-color="#38bdf8"/><stop offset="1" stop-color="#4ade80"/></linearGradient></defs><path d="M9 7.5v9" stroke="#38bdf8" stroke-width="2" stroke-linecap="round"/><path d="M9 8c0 4 4.5 4.6 6.8 5.7" stroke="url(#gwb)" stroke-width="2" stroke-linecap="round"/><circle cx="9" cy="5" r="2.5" fill="#0ea5e9" stroke="#7dd3fc" stroke-width="1.4"/><circle cx="9" cy="19" r="2.5" fill="#0ea5e9" stroke="#7dd3fc" stroke-width="1.4"/><circle cx="18" cy="15" r="2.5" fill="#22c55e" stroke="#86efac" stroke-width="1.4"/></svg>`,
};

function SidebarItem({ currentScreen, openScreen, theme }: PluginSidebarItemProps) {
  const { t } = useI18n();
  const fetchBadge = useRpc(attentionBadge);
  const fetchRef = useRef(fetchBadge);
  fetchRef.current = fetchBadge;
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const result = await fetchRef.current({});
        if (alive) setCount(result.count);
      } catch {
        // 取数失败保留上次计数，下一轮轮询自愈
      }
    };
    void load();
    const timer = setInterval(() => void load(), 30_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  const active = currentScreen?.screenId === "github-workbench";
  const text = count > 99 ? "99+" : String(count);
  const trailing = count > 0 ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("sidebar.badgeLabel", { n: text })}
      onPress={() => openScreen({ screenId: "github-workbench" })}
      style={({ pressed }) => [
        { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.accent },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text style={{ color: theme.colors.accentForeground, fontSize: 10, fontWeight: "600" }}>{text}</Text>
    </Pressable>
  ) : undefined;
  return (
    <SidebarRow
      icon={BRAND_ICON}
      label={count > 0 ? t("sidebar.badgeLabel", { n: text }) : "GitHub 工作台"}
      active={active}
      trailing={trailing}
      onPress={() => openScreen({ screenId: "github-workbench" })}
    />
  );
}

export default function contribute(client: PluginClientContext) {
  client.addScreen({ id: "github-workbench", title: "GitHub 工作台", Component: WorkbenchScreen });
  client.addSidebarHeaderItem({ id: "github-workbench", title: "GitHub 工作台", Component: SidebarItem });
  return () => {};
}