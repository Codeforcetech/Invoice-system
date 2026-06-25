import type { ReactNode } from "react";

const maxMap = {
  "4xl": "max-w-4xl",
  "5xl": "max-w-5xl",
  "6xl": "max-w-6xl",
  "7xl": "max-w-7xl",
} as const;

export type PageShellMax = keyof typeof maxMap;

/**
 * アプリ内ページの共通ラッパー（横パディング・最大幅・見出し〜本文の縦リズム）
 */
export function PageShell(props: {
  children: ReactNode;
  /** デフォルト 6xl。フォーム中心は 4xl、請求書フォームは 7xl など */
  maxWidth?: PageShellMax;
  className?: string;
}) {
  const max = maxMap[props.maxWidth ?? "6xl"];
  return (
    <div
      className={[
        "mx-auto flex w-full min-w-0 flex-col gap-8",
        max,
        "px-4 py-6 sm:px-5 md:py-8",
        props.className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {props.children}
    </div>
  );
}
