"use client";

import { useEffect, useState } from "react";

import { resolveStampImageUrl } from "@/lib/invoice/resolveStampImageUrl";

function StampPlaceholder(props: { size: number; label?: string }) {
  return (
    <div
      className="flex items-center justify-center border border-slate-200 text-[10px] text-slate-400"
      style={{ width: props.size, height: props.size }}
      role="img"
      aria-label={props.label ?? "ハンコ未設定"}
    >
      {props.label ?? "ハンコ"}
    </div>
  );
}

type StampImageProps = {
  /** 設定に保存された生 URL（Drive 共有リンク可） */
  url?: string | null;
  /** 互換: url のエイリアス */
  src?: string | null;
  alt?: string;
  size?: number;
  /** 読み込み失敗時にプレースホルダ文言を変える（設定プレビュー用） */
  failLabel?: string;
  className?: string;
};

/**
 * 外部 URL の印影表示。
 * next/image は使わず <img>（印刷・共有・PDF保存で確実に出すため）。
 * 読み込み失敗時はプレースホルダへフォールバック（ページ全体は落とさない）。
 */
export function StampImage(props: StampImageProps) {
  const raw = props.url ?? props.src;
  const resolved = resolveStampImageUrl(raw);
  const size = props.size ?? 64;
  const alt = props.alt ?? "印影";
  const [failed, setFailed] = useState(false);

  // URL 変更時は失敗状態をリセット（同じ壊れた URL の再設定ループは起こさない）
  useEffect(() => {
    setFailed(false);
  }, [resolved]);

  if (!resolved || failed) {
    return (
      <StampPlaceholder
        size={size}
        label={failed ? (props.failLabel ?? "ハンコ") : "ハンコ"}
      />
    );
  }

  return (
    <div
      className={["overflow-hidden border border-slate-200 bg-white", props.className]
        .filter(Boolean)
        .join(" ")}
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={resolved}
        alt={alt}
        width={size}
        height={size}
        className="h-full w-full object-contain"
        referrerPolicy="no-referrer"
        decoding="async"
        onError={() => {
          if (process.env.NODE_ENV === "development") {
            console.warn("[StampImage] failed to load stamp image");
          }
          setFailed(true);
        }}
      />
    </div>
  );
}
