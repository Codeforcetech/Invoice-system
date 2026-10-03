"use client";
import { useEffect } from "react";

/** ガイドの開閉できる項目（`<details data-guide>`）。 */
const SECTIONS = "details[data-guide]";

/** 指定したIDの要素までたどって、囲んでいる項目をすべて開き、その位置へスクロールする。 */
function openAndScroll(id: string) {
  if (!id) return false;
  const target = document.getElementById(id);
  if (!target) return false;
  let node: Element | null = target;
  while (node) {
    if (node instanceof HTMLDetailsElement) node.open = true;
    node = node.parentElement;
  }
  // 開いて高さが変わったあとの位置へ移動する。
  requestAnimationFrame(() =>
    target.scrollIntoView({ block: "start", behavior: "smooth" }),
  );
  return true;
}

/**
 * ページ内リンク（#id）や、URLのハッシュ付きで開かれたときに、該当する項目を自動で開く。
 * 項目が閉じていても、リンクを押せば開いてその位置まで移動する。画面には何も描かない。
 */
export function GuideBehavior() {
  useEffect(() => {
    const fromHash = () =>
      openAndScroll(decodeURIComponent(window.location.hash.slice(1)));
    fromHash();
    window.addEventListener("hashchange", fromHash);
    const onClick = (e: MouseEvent) => {
      const link = (e.target as Element | null)?.closest?.('a[href^="#"]');
      if (!link) return;
      const id = decodeURIComponent((link.getAttribute("href") ?? "").slice(1));
      if (openAndScroll(id)) {
        e.preventDefault();
        history.replaceState(null, "", `#${id}`);
      }
    };
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("hashchange", fromHash);
      document.removeEventListener("click", onClick);
    };
  }, []);
  return null;
}

/** すべての項目を開く／閉じる。 */
export function GuideToggleAll() {
  const set = (open: boolean) =>
    document
      .querySelectorAll<HTMLDetailsElement>(SECTIONS)
      .forEach((d) => (d.open = open));
  const button =
    "rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50";
  return (
    <div className="flex gap-2">
      <button type="button" className={button} onClick={() => set(true)}>
        すべて開く
      </button>
      <button type="button" className={button} onClick={() => set(false)}>
        すべて閉じる
      </button>
    </div>
  );
}
