"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { withdrawViaLink } from "@/actions/public-submission-actions";
import { AppButton, AppButtonLink } from "@/components/ui/app-button";

/** 外部の人が、自分の提出に対してできる操作。承認される前なら、取り下げて直せる。 */
export function ExternalActions({
  token,
  id,
  status,
}: {
  token: string;
  id: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (status === "APPROVED") return null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {status === "SUBMITTED" && (
          <>
            <AppButton
              variant="secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const r = await withdrawViaLink({ token, id });
                  if (!r.ok) return setError(r.error);
                  router.push(`/s/${token}/${id}/edit`);
                  router.refresh();
                } catch {
                  setError("通信できませんでした。もう一度お試しください。");
                } finally {
                  setBusy(false);
                }
              }}
            >
              取り下げて直す
            </AppButton>
            <span className="text-xs text-slate-500">
              承認される前なら、取り下げて内容を直せます。
            </span>
          </>
        )}
        {(status === "REJECTED" || status === "DRAFT") && (
          <AppButtonLink href={`/s/${token}/${id}/edit`}>
            内容を直して出し直す
          </AppButtonLink>
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
