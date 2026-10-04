"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * 画面を切り替えている間の、上部の進行バー。
 * リンクを押した瞬間に出て、次の画面が表示されたら消える（本文の表示は遅らせない）。
 * 「読み込み中」の枠（loading.tsx）にしないのは、Reactが、枠を出したあとの本文の表示を
 * 最低約0.3秒遅らせるため（速い画面ほど、かえって遅く見える）。
 */
function Bar() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const key = `${pathname}?${search}`;
  const keyRef = useRef(key);
  // 切り替えを始めたときの場所。いまの場所と同じ間は、まだ切り替え中。場所が変われば、自然に終わる。
  const [from, setFrom] = useState<string | null>(null);
  const [width, setWidth] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const pending = from !== null && from === key;

  useEffect(() => {
    keyRef.current = key;
  }, [key]);

  // 内部リンクが押されたら、進行バーを始める。
  useEffect(() => {
    const clear = () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
    const onClick = (e: MouseEvent) => {
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      )
        return;
      const a = (e.target as Element | null)?.closest?.(
        "a[href]",
      ) as HTMLAnchorElement | null;
      if (
        !a ||
        (a.target && a.target !== "_self") ||
        a.hasAttribute("download")
      )
        return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search)
        return; // 同じ場所、またはページ内の移動
      if (url.pathname.startsWith("/api/")) return; // ダウンロードなど
      clear();
      setFrom(keyRef.current);
      setWidth(12);
      timers.current.push(
        setTimeout(() => setWidth(45), 150),
        setTimeout(() => setWidth(70), 600),
        setTimeout(() => setWidth(85), 1800),
        // 念のため、10秒で消す（遷移が起きなかったとき）。
        setTimeout(() => setFrom(null), 10_000),
      );
    };
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      clear();
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.navigating = pending ? "1" : "";
  }, [pending]);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5"
      style={{ opacity: pending ? 1 : 0, transition: "opacity 200ms" }}
    >
      <div
        className="h-full bg-brand-gold"
        style={{ width: `${width}%`, transition: "width 400ms ease-out" }}
      />
    </div>
  );
}

export function NavigationProgress() {
  return (
    <Suspense fallback={null}>
      <Bar />
    </Suspense>
  );
}
