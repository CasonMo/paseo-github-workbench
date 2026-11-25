import { useEffect, useState, type ComponentRef, type RefObject } from "react";
import { Dimensions, Keyboard, Platform, View, type KeyboardEvent } from "react-native";

// tsconfig 不含 DOM lib，触屏 web 分支用结构化类型访问 DOM（与 ui.tsx 的 Select 同一做法）。
type DomNode = {
  getBoundingClientRect(): { bottom: number };
  scrollIntoView?(options: { block: string; behavior: string }): void;
};
type VisualViewport = {
  height: number;
  offsetTop: number;
  scale: number;
  addEventListener(type: string, fn: () => void): void;
  removeEventListener(type: string, fn: () => void): void;
};
type WebGlobal = {
  visualViewport?: VisualViewport;
  addEventListener(type: string, fn: () => void): void;
  removeEventListener(type: string, fn: () => void): void;
  getComputedStyle(node: unknown): { marginBottom: string };
};

export function useKeyboardInset(rootRef: RefObject<ComponentRef<typeof View> | null>): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (Platform.OS === "web") {
      const web = globalThis as unknown as WebGlobal;
      const viewport = web.visualViewport;
      if (!viewport) return;
      const measure = () => {
        const node = rootRef.current as unknown as DomNode | null;
        if (!node || typeof node.getBoundingClientRect !== "function") return;
        if (Math.abs(viewport.scale - 1) > 0.01) { setInset(0); return; } // 双指缩放不处理
        const applied = Number.parseFloat(web.getComputedStyle(node).marginBottom) || 0;
        const bottom = node.getBoundingClientRect().bottom + applied;
        setInset(Math.max(0, Math.round(bottom - viewport.offsetTop - viewport.height)));
      };
      measure();
      viewport.addEventListener("resize", measure);
      viewport.addEventListener("scroll", measure);
      web.addEventListener("resize", measure);
      return () => {
        viewport.removeEventListener("resize", measure);
        viewport.removeEventListener("scroll", measure);
        web.removeEventListener("resize", measure);
      };
    }

    if (Platform.OS !== "ios") return; // android 通常由宿主 adjustResize 处理

    let applied = 0;
    const apply = (keyboardHeight: number) => {
      const commit = (next: number) => { applied = next; setInset(next); };
      const node = rootRef.current;
      if (!node || typeof node.measureInWindow !== "function") {
        commit(Math.max(0, Math.round(keyboardHeight))); return;
      }
      node.measureInWindow((_x, y, _width, height) => {
        const screenHeight = Dimensions.get("window").height;
        const rawBottom = y + height + applied; // 还原未抬升时的底边
        const gap = screenHeight - rawBottom;   // 宿主底部留白
        commit(Math.max(0, Math.round(keyboardHeight - gap)));
      });
    };
    const onChange = (e: KeyboardEvent) => apply(e.endCoordinates?.height ?? 0);
    const onHide = () => apply(0);
    const subs = [
      Keyboard.addListener("keyboardWillChangeFrame", onChange),
      Keyboard.addListener("keyboardWillHide", onHide),
    ];
    return () => { for (const s of subs) s.remove(); };
  }, [rootRef]);

  return inset;
}

// 触屏 web 的 ScrollView 不会自动滚到聚焦输入框；等键盘动画和 inset 落地后补一次。
// 原生 iOS 由 RN ScrollView 内建的键盘避让滚动处理，无需干预。
export function revealOnFocus(ref: RefObject<ComponentRef<typeof View> | null>): void {
  if (Platform.OS !== "web") return;
  setTimeout(() => {
    const node = ref.current as unknown as DomNode | null;
    if (node && typeof node.scrollIntoView === "function") {
      node.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, 350);
}