"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { cancelJournal } from "@/actions/accounting-actions";
import { AppButton } from "@/components/ui/app-button";
import { inputClass } from "@/lib/ui/form-classes";
import { japanToday } from "@/lib/expenses/model";
export function CancelEntry({ id, date }: { id: string; date: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <>
      <AppButton variant="ghost" onClick={() => setOpen(!open)}>
        {open ? "閉じる" : "取消仕訳を登録"}
      </AppButton>
      {open && (
        <form
          className="mt-3 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const f = new FormData(e.currentTarget);
            try {
              await cancelJournal({
                id,
                date: f.get("date"),
                reason: f.get("reason"),
              });
              setOpen(false);
              router.refresh();
            } catch {
              setError(
                "取消できませんでした。取引日と入力元を確認してください。",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="block text-xs">
            取消日
            <input
              name="date"
              type="date"
              required
              min={date}
              defaultValue={japanToday() > date ? japanToday() : date}
              className={inputClass}
            />
          </label>
          <label className="block text-xs">
            取消理由
            <input
              name="reason"
              required
              maxLength={300}
              className={inputClass}
            />
          </label>
          <AppButton type="submit" disabled={busy}>
            履歴を残して取り消す
          </AppButton>
          {error && <p role="alert">{error}</p>}
        </form>
      )}
    </>
  );
}
