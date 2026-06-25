"use client";

export type AutosaveUiState = "idle" | "saving" | "saved" | "error" | "waiting";

export function AutosaveStatus(props: {
  state: AutosaveUiState;
  lastSavedAt?: Date | null;
  hint?: string;
}) {
  const label =
    props.state === "saving"
      ? "自動保存中…"
      : props.state === "saved"
        ? "自動保存済み"
        : props.state === "error"
          ? "自動保存に失敗"
          : props.state === "waiting"
            ? "必須項目入力後に自動保存"
            : "下書き";

  const cls =
    props.state === "error"
      ? "border-red-200 bg-red-50 text-red-800"
      : props.state === "saving"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-zinc-200 bg-white text-zinc-700";

  return (
    <div className={`rounded-lg border px-3 py-2 text-xs ${cls}`}>
      <div className="font-medium">{label}</div>
      {props.lastSavedAt && props.state === "saved" ? (
        <div className="mt-0.5 text-[11px] text-zinc-500">
          {props.lastSavedAt.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </div>
      ) : null}
      {props.hint ? <div className="mt-1 text-[11px] text-zinc-500">{props.hint}</div> : null}
    </div>
  );
}
