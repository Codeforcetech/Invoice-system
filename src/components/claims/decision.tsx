"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { processClaim } from "@/actions/claim-actions";
import { japanToday } from "@/lib/expenses/model";
import { Card, CardSection } from "@/components/ui/card";
import { AppButton, AppButtonLink } from "@/components/ui/app-button";
import { inputClass, selectClass, textareaClass } from "@/lib/ui/form-classes";
export function ClaimDecision(p: {
  id: string;
  version: string;
  status: string;
  applicant: boolean;
  owner: boolean;
  canApprove: boolean;
  active: boolean;
  hasReceipt: boolean;
  date: string;
  suggestedCode: string;
  accounts: { id: string; code: string; name: string; kind: string }[];
}) {
  const router = useRouter(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [comment, setComment] = useState(""),
    [date, setDate] = useState(japanToday());
  const [expense, setExpense] = useState(
      p.accounts.find((a) => a.code === p.suggestedCode)?.id ?? "",
    ),
    [bank, setBank] = useState(
      p.accounts.find((a) => a.code === "110")?.id ?? "",
    );
  async function run(action: string) {
    setBusy(true);
    setMessage("");
    try {
      const r = await processClaim({
        id: p.id,
        version: p.version,
        action,
        comment,
        date,
        accountId: action === "PAY" ? bank : expense,
      });
      setMessage(r.ok ? "処理を保存しました。" : r.error);
      if (r.ok) router.refresh();
    } catch {
      setMessage(
        "通信できませんでした。最新の状態を確認して再試行してください。",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!p.active)
    return (
      <p className="text-sm text-slate-500">
        精算先の利用が停止されています。過去の申請のみ閲覧できます。
      </p>
    );
  return (
    <Card>
      <CardSection>
        <h2 className="text-lg font-semibold">次の操作</h2>
        {message && (
          <p role="status" className="my-3 text-sm text-sky-800">
            {message}
          </p>
        )}
        {p.applicant && ["DRAFT", "REJECTED"].includes(p.status) && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-slate-600">
              件名・金額・レシートを確認して申請してください。申請後は取り下げるまで編集できません。
            </p>
            {!p.hasReceipt && (
              <p className="text-sm text-amber-800">
                申請するにはレシートの添付が必要です。
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <AppButtonLink href={`/claims/${p.id}/edit`} variant="secondary">
                内容を編集
              </AppButtonLink>
              <AppButton
                disabled={busy || !p.hasReceipt}
                onClick={() => void run("SUBMIT")}
              >
                確認して申請する
              </AppButton>
            </div>
          </div>
        )}
        {p.applicant && p.status === "PENDING" && (
          <div className="mt-4">
            <p className="mb-3 text-sm text-slate-600">
              承認者の確認を待っています。
            </p>
            <AppButton
              variant="secondary"
              disabled={busy}
              onClick={() => void run("WITHDRAW")}
            >
              申請を取り下げる
            </AppButton>
          </div>
        )}
        {p.canApprove && p.status === "PENDING" && (
          <div className="mt-4 space-y-4">
            <label className="block max-w-sm text-sm">
              費用の勘定科目
              <select
                className={`mt-1 ${selectClass}`}
                value={expense}
                onChange={(e) => setExpense(e.target.value)}
              >
                <option value="">選択してください</option>
                {p.accounts
                  .filter((a) => a.kind === "EXPENSE")
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} {a.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="block text-sm">
              コメント（差戻し時は必須）
              <textarea
                className={`mt-1 ${textareaClass}`}
                maxLength={1000}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-3">
              <AppButton
                disabled={busy || !expense}
                onClick={() => void run("APPROVE")}
              >
                承認して仕訳を登録
              </AppButton>
              <AppButton
                disabled={busy || !comment.trim()}
                variant="secondary"
                onClick={() => void run("REJECT")}
              >
                理由を添えて差し戻す
              </AppButton>
            </div>
            <p className="text-xs text-slate-500">
              承認すると、経費の日付で「費用／未払金」を記帳します。
            </p>
          </div>
        )}
        {p.owner && p.status === "APPROVED" && (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-slate-600">
              実際の振込が完了してから記録してください。この操作では送金しません。
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                精算日
                <input
                  type="date"
                  value={date}
                  min={p.date}
                  max={japanToday()}
                  onChange={(e) => setDate(e.target.value)}
                  className={`mt-1 ${inputClass}`}
                />
              </label>
              <label className="text-sm">
                支払元の勘定科目
                <select
                  value={bank}
                  onChange={(e) => setBank(e.target.value)}
                  className={`mt-1 ${selectClass}`}
                >
                  <option value="">選択してください</option>
                  {p.accounts
                    .filter((a) => a.kind === "ASSET")
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} {a.name}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <AppButton
              disabled={busy || !bank || !date}
              onClick={() => void run("PAY")}
            >
              振込済みとして精算を記録
            </AppButton>
          </div>
        )}
        {((p.canApprove && p.status === "APPROVED") ||
          (p.owner && p.status === "PAID")) && (
          <details className="mt-5">
            <summary className="cursor-pointer text-sm text-sky-700">
              {p.status === "PAID"
                ? "精算記録を取り消す"
                : "承認を取り消して差し戻す"}
            </summary>
            <p className="my-2 text-xs text-slate-500">
              元の仕訳を消さず、同日の取消仕訳を記録します。
            </p>
            <label className="block text-sm">
              取消理由
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                maxLength={1000}
                className={`mt-1 ${textareaClass}`}
              />
            </label>
            <AppButton
              variant="secondary"
              disabled={busy || !comment.trim()}
              onClick={() =>
                void run(p.status === "PAID" ? "UNDO_PAY" : "REVOKE")
              }
            >
              理由を添えて取り消す
            </AppButton>
          </details>
        )}
        {!p.owner &&
          !p.canApprove &&
          ["APPROVED", "PAID"].includes(p.status) && (
            <p className="mt-3 text-sm text-slate-600">
              {p.status === "PAID"
                ? "精算が記録されています。"
                : "承認済みです。管理者による精算をお待ちください。"}
            </p>
          )}
      </CardSection>
    </Card>
  );
}
