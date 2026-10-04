"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  deleteSubmission,
  submitSubmission,
  withdrawSubmission,
} from "@/actions/submission-actions";
import { AppButton, AppButtonLink } from "@/components/ui/app-button";

/** 提出者が、自分の提出に対してできる操作（状態によって出るものが変わる）。 */
export function SubmissionActions({
  id,
  status,
  version,
}: {
  id: string;
  status: string;
  version: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (
    fn: () => Promise<{ ok: boolean; error?: string }>,
    after: () => void,
  ) => {
    setBusy(true);
    setError("");
    try {
      const r = await fn();
      if (!r.ok) return setError(r.error ?? "処理できませんでした。");
      after();
      router.refresh();
    } catch {
      setError("通信できませんでした。もう一度お試しください。");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {(status === "DRAFT" || status === "REJECTED") && (
          <>
            <AppButton
              disabled={busy}
              onClick={() =>
                void run(
                  () => submitSubmission({ id, version }),
                  () => {},
                )
              }
            >
              提出する
            </AppButton>
            <AppButtonLink href={`/submit/${id}/edit`} variant="secondary">
              内容を直す
            </AppButtonLink>
            <button
              type="button"
              disabled={busy}
              className="text-sm text-rose-700"
              onClick={() => {
                if (
                  confirm(
                    "この提出を削除します。元に戻せません。よろしいですか？",
                  )
                )
                  void run(
                    () => deleteSubmission({ id }),
                    () => router.push("/submit"),
                  );
              }}
            >
              削除する
            </button>
          </>
        )}
        {status === "SUBMITTED" && (
          <>
            <AppButton
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void run(
                  () => withdrawSubmission({ id }),
                  () => {},
                )
              }
            >
              取り下げて直す
            </AppButton>
            <span className="text-xs text-slate-500">
              承認される前なら、取り下げて内容を直せます。
            </span>
          </>
        )}
      </div>
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
