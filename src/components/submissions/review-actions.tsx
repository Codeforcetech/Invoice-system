"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  approveSubmission,
  rejectSubmission,
} from "@/actions/submission-actions";
import { AppButton } from "@/components/ui/app-button";
import { textareaClass } from "@/lib/ui/form-classes";

/** 管理者が、提出を承認する／差し戻す。承認すると、支払管理に反映される。 */
export function ReviewActions({
  id,
  version,
}: {
  id: string;
  version: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const run = async (
    fn: () => Promise<{ ok: boolean; error?: string; expenses?: number }>,
    done: (r: { expenses?: number }) => string,
  ) => {
    setBusy(true);
    setError("");
    try {
      const r = await fn();
      if (!r.ok) return setError(r.error ?? "処理できませんでした。");
      setNotice(done(r));
      router.refresh();
    } catch {
      setError("通信できませんでした。もう一度お試しください。");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <AppButton
          disabled={busy}
          onClick={() => {
            if (
              confirm(
                "この内容で承認します。支払管理に、支払い予定として反映されます。よろしいですか？",
              )
            )
              void run(
                () => approveSubmission({ id, version }),
                (r) =>
                  `承認しました。支払管理に${r.expenses}件を反映しました。`,
              );
          }}
        >
          承認して、支払管理に反映する
        </AppButton>
      </div>
      <div className="rounded-xl border border-slate-200 p-4">
        <label className="block text-sm">
          <span className="font-semibold">
            差し戻す（理由は、提出した人に伝わります）
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            placeholder="例：9月の交通費の領収書が不足しています。"
            className={`mt-1 ${textareaClass}`}
          />
        </label>
        <div className="mt-2">
          <AppButton
            variant="secondary"
            disabled={busy || !reason.trim()}
            onClick={() =>
              void run(
                () => rejectSubmission({ id, version, reason }),
                () => "差し戻しました。",
              )
            }
          >
            差し戻す
          </AppButton>
        </div>
      </div>
      {notice && (
        <p
          role="status"
          className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900"
        >
          {notice}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800"
        >
          {error}
        </p>
      )}
    </div>
  );
}
