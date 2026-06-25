"use client";

import { useEffect } from "react";

export type ToastVariant = "success" | "error" | "info";

export function Toast(props: {
  open: boolean;
  message: string;
  variant?: ToastVariant;
  onClose: () => void;
  durationMs?: number;
}) {
  const durationMs = props.durationMs ?? 2500;

  useEffect(() => {
    if (!props.open) return;
    const t = window.setTimeout(() => props.onClose(), durationMs);
    return () => window.clearTimeout(t);
  }, [props.open, durationMs, props]);

  if (!props.open) return null;

  const variant = props.variant ?? "info";
  const cls =
    variant === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : variant === "error"
        ? "border-red-200 bg-red-50 text-red-800"
        : "border-zinc-200 bg-white text-zinc-800";

  return (
    <div className="fixed bottom-4 right-4 z-50 print:hidden">
      <div className={["rounded-lg border px-4 py-3 text-sm shadow-sm", cls].join(" ")}>
        <div className="flex items-start gap-3">
          <div className="min-w-0">{props.message}</div>
          <button
            type="button"
            className="shrink-0 rounded-md border px-2 py-0.5 text-xs hover:bg-zinc-50"
            onClick={props.onClose}
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}

