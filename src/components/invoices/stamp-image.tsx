"use client";

import { useState } from "react";

import { resolveStampImageUrl } from "@/lib/invoice/resolveStampImageUrl";

function StampPlaceholder() {
  return (
    <div className="flex h-16 w-16 items-center justify-center rounded border border-slate-200 text-[10px] text-slate-400">
      ハンコ
    </div>
  );
}

/** 外部 URL の印影（next/image のドメイン制限を避け、読み込み失敗時はプレースホルダ） */
export function StampImage(props: { url: string | null | undefined }) {
  const resolved = resolveStampImageUrl(props.url);
  const [failed, setFailed] = useState(false);

  if (!resolved || failed) {
    return <StampPlaceholder />;
  }

  return (
    <div className="h-16 w-16 overflow-hidden rounded border border-slate-200">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={resolved}
        alt="印影"
        className="h-full w-full object-contain"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
