import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/ui";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { StyleProp, TextStyle, ViewStyle } from "react-native";
import { translateNow } from "./i18n";
import { revealOnFocus } from "./use-keyboard-inset";

export type Tone = "default" | "accent" | "success" | "warning" | "danger" | "muted";

const LIGHT = {
  fg: "#09090b",
  muted: "#64636e",
  faint: "#81818b",
  shell: "#f3f3f4",
  canvas: "#fbfbfb",
  card: "#ffffff",
  fill: "#f4f4f5",
  fillHover: "#efeff1",
  fillStrong: "#e9e9eb",
  border: "#e4e4e7",
  line: "#ececef",
  primary: "#18181b",
  primaryFg: "#fafafa",
  brand: "#0070e3",
  success: "#1c882d",
  warning: "#dba400",
  danger: "#e40014",
  info: "#0074c9",
  shadow: "0 1px 2px rgba(15,23,42,0.04), 0 1px 1px rgba(15,23,42,0.03)",
  shadowLift: "0 8px 24px rgba(15,23,42,0.08), 0 2px 6px rgba(15,23,42,0.05)",
};

const DARK: typeof LIGHT = {
  fg: "#fafafa",
  muted: "#c8ccd8",
  faint: "#a0a4b2",
  shell: "#21252d",
  canvas: "#282c34",
  card: "#2f333d",
  fill: "#383c48",
  fillHover: "#292d34",
  fillStrong: "#31353c",
  border: "#3f4454",
  line: "#454b5b",
  primary: "#fafafa",
  primaryFg: "#282c34",
  brand: "#7aa2f7",
  success: "#3fb950",
  warning: "#e3b341",
  danger: "#ff7b72",
  info: "#58a6ff",
  shadow: "0 1px 2px rgba(0,0,0,0.28), 0 1px 1px rgba(0,0,0,0.20)",
  shadowLift: "0 8px 24px rgba(0,0,0,0.42), 0 2px 6px rgba(0,0,0,0.30)",
};

function isDark(surface: string): boolean {
  const hex = surface.replace("#", "");
  if (hex.length < 6) return false;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
}

function channelLuminance(hex: string): number {
  const value = parseInt(hex.slice(1), 16);
  const linear = (shift: number) => {
    const channel = ((value >> shift) & 255) / 255;
    return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linear(16) + 0.7152 * linear(8) + 0.0722 * linear(0);
}

export function pickTextColor(hex: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return "#ffffff";
  const background = channelLuminance(hex);
  const contrast = (ink: string) => {
    const other = channelLuminance(ink);
    return (Math.max(background, other) + 0.05) / (Math.min(background, other) + 0.05);
  };
  return contrast("#ffffff") >= contrast("#111111") ? "#ffffff" : "#111111";
}

export function relTime(iso: string): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "";
  const min = Math.floor(ms / 60000);
  if (min < 1) return translateNow("time.justNow");
  if (min < 60) return translateNow("time.minutesAgo", { n: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return translateNow("time.hoursAgo", { n: hr });
  const day = Math.floor(hr / 24);
  if (day < 30) return translateNow("time.daysAgo", { n: day });
  return new Date(iso).toLocaleDateString();
}

export function useUi(theme: PluginTheme, compact: boolean) {
  return useMemo(() => {
    const dark = isDark(theme.colors.surface0);
    const t = dark ? DARK : LIGHT;
    const styles = StyleSheet.create({
      card: { backgroundColor: t.card, borderColor: t.border, borderWidth: 1, borderRadius: 12, boxShadow: t.shadow },
      cardPad: { padding: compact ? 12 : 16 },
      panel: { backgroundColor: t.card, borderColor: t.border, borderWidth: 1, borderRadius: 12, overflow: "hidden", boxShadow: t.shadow },
      row: { flexDirection: "row", alignItems: "center" },
      rowTop: { flexDirection: "row", alignItems: "flex-start" },
      grow: { flex: 1, minWidth: 0 },
      gap4: { gap: 4 },
      gap6: { gap: 6 },
      gap8: { gap: 8 },
      gap12: { gap: 12 },
      gap16: { gap: 16 },
      title: { color: t.fg, fontSize: 20, fontWeight: "600", letterSpacing: -0.2 },
      h2: { color: t.fg, fontSize: 14, fontWeight: "600" },
      h3: { color: t.fg, fontSize: 13, fontWeight: "600" },
      body: { color: t.fg, fontSize: 14, lineHeight: 20 },
      muted: { color: t.muted, fontSize: 13 },
      tiny: { color: t.muted, fontSize: 12 },
      label: { color: t.muted, fontSize: 12, fontWeight: "500" },
      pressed: { opacity: 0.65 },
      divider: { height: StyleSheet.hairlineWidth, backgroundColor: t.line },
      input: { backgroundColor: t.card, borderColor: t.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 11, paddingVertical: 8, color: t.fg, fontSize: 14, minHeight: 32 },
      inputMulti: { minHeight: 110, textAlignVertical: "top", paddingTop: 10 },
      chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: "transparent", backgroundColor: t.fill },
      chipActive: { backgroundColor: t.card, borderColor: t.border, boxShadow: t.shadow },
      chipText: { color: t.muted, fontSize: 13, fontWeight: "500" },
      chipTextActive: { color: t.fg, fontWeight: "600" },
      btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: t.border, backgroundColor: t.card, minHeight: 32 },
      btnPrimary: { backgroundColor: t.primary, borderColor: t.primary },
      btnDanger: { backgroundColor: "transparent", borderColor: t.danger },
      btnGhost: { backgroundColor: "transparent", borderColor: "transparent" },
      btnDisabled: { opacity: 0.45 },
      btnText: { color: t.fg, fontSize: 13, fontWeight: "500" },
      btnTextPrimary: { color: t.primaryFg },
      btnTextDanger: { color: t.danger },
      iconBtn: { padding: 6, borderRadius: 6 },
      badge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
      badgeText: { fontSize: 12, fontWeight: "500" },
      avatar: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
      avatarText: { fontWeight: "600" },
      empty: { alignItems: "center", justifyContent: "center", paddingVertical: 36, gap: 8 },
      listRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 32, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6 },
    });
    const palette = { ...t, dark, accent: t.brand, accentFg: "#ffffff", surface0: t.canvas, surface1: t.card, surface2: t.fill };
    return { c: palette, s: styles, compact };
  }, [theme, compact]);
}

export type Ui = ReturnType<typeof useUi>;

export function Card({ ui, children, style, padded = true }: { ui: Ui; children: ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  return <View style={[ui.s.card, padded && ui.s.cardPad, style]}>{children}</View>;
}

export function Divider({ ui, style, color }: { ui: Ui; style?: StyleProp<ViewStyle>; color?: string }) {
  return <View style={[ui.s.divider, color ? { backgroundColor: color } : null, style]} />;
}

export function Btn({ ui, label, icon, onPress, tone = "ghost", disabled, busy, style }: {
  ui: Ui; label?: string; icon?: string; onPress(): void; tone?: "ghost" | "primary" | "danger"; disabled?: boolean; busy?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const textStyle: TextStyle[] = [ui.s.btnText];
  if (tone === "primary") textStyle.push(ui.s.btnTextPrimary);
  if (tone === "danger") textStyle.push(ui.s.btnTextDanger);
  const ink = tone === "primary" ? ui.c.primaryFg : tone === "danger" ? ui.c.danger : ui.c.fg;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [ui.s.btn, tone === "primary" && ui.s.btnPrimary, tone === "danger" && ui.s.btnDanger, tone === "ghost" && ui.s.btnGhost, (disabled || busy) && ui.s.btnDisabled, pressed && ui.s.pressed, style]}
    >
      {busy ? <ActivityIndicator size="small" color={ink} /> : icon ? <Icon name={icon} size={15} color={ink} /> : null}
      {label ? <Text style={textStyle}>{label}</Text> : null}
    </Pressable>
  );
}

export function IconBtn({ ui, icon, onPress, label, color, size = 16, busy }: { ui: Ui; icon: string; onPress(): void; label: string; color?: string; size?: number; busy?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={busy} onPress={onPress} style={({ pressed }) => [ui.s.iconBtn, pressed && ui.s.pressed]}>
      {busy ? <ActivityIndicator size="small" color={color ?? ui.c.muted} /> : <Icon name={icon} size={size} color={color ?? ui.c.muted} />}
    </Pressable>
  );
}

export function Tag({ ui, label, color, tone = "default", icon }: { ui: Ui; label: string; color?: string; tone?: Tone; icon?: string }) {
  const toneColor = color ?? (tone === "accent" ? ui.c.accent : tone === "success" ? ui.c.success : tone === "warning" ? ui.c.warning : tone === "danger" ? ui.c.danger : tone === "muted" ? ui.c.muted : ui.c.fg);
  const ink = pickTextColor(toneColor);
  return (
    <View style={[ui.s.badge, { backgroundColor: toneColor }]}>
      {icon ? <Icon name={icon} size={11} color={ink} /> : null}
      <Text style={[ui.s.badgeText, { color: ink }]}>{label}</Text>
    </View>
  );
}

export function Dot({ color, size = 7 }: { color: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;
}

const AVATAR_PAIRS: [string, string][] = [
  ["#7aa2f7", "#56b6c2"], ["#3fb950", "#56b6c2"], ["#e3b341", "#f0883e"], ["#b48ead", "#7aa2f7"],
  ["#ff7b72", "#b48ead"], ["#56b6c2", "#3fb950"], ["#f0883e", "#e3b341"], ["#a8b0c2", "#8b93a7"],
];

function avatarSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mixHex(a: string, b: string): string {
  const ch = (hex: string, i: number) => parseInt(hex.slice(i, i + 2), 16);
  const mix = (i: number) => Math.round((ch(a, i) + ch(b, i)) / 2).toString(16).padStart(2, "0");
  return `#${mix(1)}${mix(3)}${mix(5)}`;
}

export function Avatar({ name, url, size = 28, ui }: { name: string | null | undefined; url?: string | null; size?: number; ui: Ui }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [url]);
  const label = (name ?? "?").trim() || "?";
  const pair = AVATAR_PAIRS[avatarSeed(label || url || "?") % AVATAR_PAIRS.length];
  const imageUri = url && !broken && /^(https?:|data:)/i.test(url) ? url : null;
  const gradient = `linear-gradient(135deg, ${pair[0]} 0%, ${pair[1]} 100%)`;
  const glyph = Array.from(label)[0]?.toUpperCase() ?? "?";
  const glyphColor = pickTextColor(mixHex(pair[0], pair[1]));
  return (
    <View style={[ui.s.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: pair[1], backgroundImage: gradient, experimental_backgroundImage: gradient, overflow: "hidden" } as ViewStyle]}>
      <Text style={[ui.s.avatarText, { color: glyphColor, fontSize: Math.max(9, size * 0.4) }]}>{glyph}</Text>
      {imageUri ? <Image source={{ uri: imageUri }} style={{ position: "absolute", top: 0, left: 0, width: size, height: size }} onError={() => setBroken(true)} /> : null}
    </View>
  );
}

export function Select<const T extends string>({ ui, value, options, onChange, placeholder, disabled, searchable = true }: {
  ui: Ui; value: T | null | undefined; options: readonly { value: T; label: string; icon?: string; color?: string }[]; onChange(value: T): void; placeholder?: string; disabled?: boolean; searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const boxRef = useRef<View | null>(null);
  const current = options.find((option) => option.value === value);
  const needle = q.trim().toLowerCase();
  const list = needle ? options.filter((option) => option.label.toLowerCase().includes(needle)) : options;
  useEffect(() => {
    if (!open) return;
    type Doc = { addEventListener(type: string, fn: (e: { key?: string; target?: unknown }) => void): void; removeEventListener(type: string, fn: (e: { key?: string; target?: unknown }) => void): void };
    const doc = (globalThis as { document?: Doc }).document;
    if (!doc) return;
    const onDown = (e: { target?: unknown }) => {
      const box = boxRef.current as unknown as { contains?(node: unknown): boolean } | null;
      if (box?.contains && !box.contains(e.target)) setOpen(false);
    };
    const onKey = (e: { key?: string }) => { if (e.key === "Escape") setOpen(false); };
    doc.addEventListener("mousedown", onDown);
    doc.addEventListener("keydown", onKey);
    return () => { doc.removeEventListener("mousedown", onDown); doc.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <View ref={boxRef}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={current?.label ?? placeholder}
        accessibilityState={{ expanded: open }}
        disabled={disabled}
        onPress={() => { setOpen(!open); setQ(""); }}
        style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [ui.s.row, { gap: 6, minHeight: 32, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: open ? ui.c.accent : ui.c.border, backgroundColor: ui.c.surface0 }, hovered && !open && { borderColor: ui.c.faint }, pressed && ui.s.pressed, disabled && { opacity: 0.5 }]}
      >
        {current?.color ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: current.color }} /> : current?.icon ? <Icon name={current.icon} size={13} color={ui.c.muted} /> : null}
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, color: current ? ui.c.fg : ui.c.faint }}>{current?.label ?? placeholder ?? ""}</Text>
        <Icon name="ChevronDown" size={13} color={ui.c.muted} />
      </Pressable>
      {open ? (
        <View style={{ marginTop: 4, borderRadius: 10, borderWidth: 1, borderColor: ui.c.border, backgroundColor: ui.c.card, boxShadow: ui.c.shadowLift, overflow: "hidden" }}>
          {searchable && options.length > 8 ? (
            <View style={[ui.s.row, { gap: 6, paddingHorizontal: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: ui.c.line }]}>
              <Icon name="Search" size={12} color={ui.c.faint} />
              <TextInput value={q} onChangeText={setQ} onFocus={() => revealOnFocus(boxRef)} autoFocus placeholder={translateNow("common.search")} placeholderTextColor={ui.c.faint} style={{ flex: 1, fontSize: 12, color: ui.c.fg, paddingVertical: 2 }} />
            </View>
          ) : null}
          <ScrollView style={{ maxHeight: 224 }}>
            {list.length === 0 ? <Text style={[ui.s.tiny, { padding: 10 }]}>{translateNow("common.noOptions")}</Text> : null}
            {list.map((option) => (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                accessibilityLabel={option.label}
                accessibilityState={{ selected: option.value === value }}
                onPress={() => { onChange(option.value); setOpen(false); }}
                style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [ui.s.row, { gap: 6, paddingHorizontal: 10, paddingVertical: 7 }, hovered && { backgroundColor: ui.c.fillHover }, pressed && ui.s.pressed, option.value === value && { backgroundColor: ui.c.fillStrong }]}
              >
                {option.color ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: option.color }} /> : option.icon ? <Icon name={option.icon} size={13} color={ui.c.muted} /> : null}
                <Text numberOfLines={1} style={{ flex: 1, fontSize: 12.5, color: ui.c.fg }}>{option.label}</Text>
                {option.value === value ? <Icon name="Check" size={13} color={ui.c.accent} /> : null}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

export function Field({ ui, label, value, onChangeText, placeholder, multiline, hint }: { ui: Ui; label?: string; value: string; onChangeText(value: string): void; placeholder?: string; multiline?: boolean; hint?: string }) {
  const fieldRef = useRef<ComponentRef<typeof View>>(null);
  return (
    <View ref={fieldRef} style={ui.s.gap6}>
      {label ? <Text style={ui.s.label}>{label}</Text> : null}
      <TextInput value={value} onChangeText={onChangeText} onFocus={() => revealOnFocus(fieldRef)} placeholder={placeholder} placeholderTextColor={ui.c.faint} multiline={multiline} autoCapitalize="none" autoCorrect={false} style={[ui.s.input, multiline && ui.s.inputMulti]} />
      {hint ? <Text style={ui.s.tiny}>{hint}</Text> : null}
    </View>
  );
}

export function Chips<const T extends string>({ ui, options, value, onChange }: { ui: Ui; options: readonly { value: T; label: string; icon?: string }[]; value: T; onChange(value: T): void }) {
  return (
    <View style={[ui.s.row, ui.s.gap6, { flexWrap: "wrap" }]}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable accessibilityRole="button" key={option.value} accessibilityLabel={option.label} accessibilityState={{ selected: active }} onPress={() => onChange(option.value)} style={({ pressed }) => [ui.s.chip, active && ui.s.chipActive, pressed && ui.s.pressed]}>
            {option.icon ? <Icon name={option.icon} size={12} color={active ? ui.c.fg : ui.c.muted} /> : null}
            <Text style={[ui.s.chipText, active && ui.s.chipTextActive]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Toggle({ ui, label, value, onChange }: { ui: Ui; label: string; value: boolean; onChange(v: boolean): void }) {
  return (
    <Pressable accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: value }} onPress={() => onChange(!value)} style={[ui.s.row, ui.s.gap8]}>
      <View style={{ width: 34, height: 20, borderRadius: 999, backgroundColor: value ? ui.c.accent : ui.c.fillStrong, justifyContent: "center", paddingHorizontal: 2, alignItems: value ? "flex-end" : "flex-start" }}>
        <View style={{ width: 16, height: 16, borderRadius: 999, backgroundColor: value ? "#ffffff" : ui.c.faint }} />
      </View>
      <Text style={{ color: ui.c.fg, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

export function Empty({ ui, icon, title, description, action }: { ui: Ui; icon: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <View style={ui.s.empty}>
      <View style={{ width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: ui.c.fill }}>
        <Icon name={icon} size={20} color={ui.c.muted} />
      </View>
      <Text style={[ui.s.h2, { textAlign: "center" }]}>{title}</Text>
      {description ? <Text style={[ui.s.muted, { textAlign: "center", maxWidth: 380 }]}>{description}</Text> : null}
      {action ? <View style={{ marginTop: 6 }}>{action}</View> : null}
    </View>
  );
}

export function LoadingRow({ ui, label = translateNow("common.loading") }: { ui: Ui; label?: string }) {
  return (
    <View style={[ui.s.row, ui.s.gap8, { paddingVertical: 24, justifyContent: "center" }]}>
      <ActivityIndicator size="small" color={ui.c.muted} />
      <Text style={ui.s.muted}>{label}</Text>
    </View>
  );
}

export function ErrorNote({ ui, message, onRetry }: { ui: Ui; message: string; onRetry?: () => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, borderColor: `${ui.c.danger}55`, borderWidth: 1, backgroundColor: `${ui.c.danger}12`, borderRadius: 8, padding: 10 }}>
      <Icon name="AlertCircle" size={16} color={ui.c.danger} />
      <Text style={[ui.s.muted, { color: ui.c.danger, flex: 1 }]}>{message}</Text>
      {onRetry ? <Btn ui={ui} label={translateNow("common.retry")} onPress={onRetry} /> : null}
    </View>
  );
}

export function SectionHeader({ ui, title, trailing }: { ui: Ui; title: string; trailing?: ReactNode }) {
  return (
    <View style={[ui.s.row, { justifyContent: "space-between", marginBottom: 8 }]}>
      <Text style={ui.s.h2}>{title}</Text>
      {trailing}
    </View>
  );
}

export function KV({ ui, k, v }: { ui: Ui; k: string; v: ReactNode }) {
  return (
    <View style={[ui.s.rowTop, { paddingVertical: 5, gap: 10 }]}>
      <Text style={[ui.s.muted, { width: 88 }]}>{k}</Text>
      {typeof v === "string" ? <Text style={[ui.s.body, { flex: 1 }]}>{v}</Text> : <View style={{ flex: 1 }}>{v}</View>}
    </View>
  );
}