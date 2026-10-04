"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createSubmissionLink,
  extendSubmissionLink,
  revokeSubmissionLink,
} from "@/actions/submission-link-actions";
import { Card, CardSection } from "@/components/ui/card";
import { AppButton } from "@/components/ui/app-button";
import { inputClass, selectClass } from "@/lib/ui/form-classes";

export type LinkRow = {
  id: string;
  label: string;
  hint: string;
  status: "ACTIVE" | "EXPIRED" | "REVOKED";
  expiresAt: string;
  submissionCount: number;
  maxSubmissions: number;
  pending: number;
  aiReadsUsed: number;
  aiReadsLimit: number;
  lastUsedAt: string | null;
};
const statusLabel = {
  ACTIVE: "有効",
  EXPIRED: "期限切れ",
  REVOKED: "取り消し済み",
} as const;
const statusTone = {
  ACTIVE: "bg-emerald-100 text-emerald-900",
  EXPIRED: "bg-slate-200 text-slate-700",
  REVOKED: "bg-rose-100 text-rose-900",
} as const;
const fmt = (iso: string) =>
  new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(new Date(iso));

/** 提出リンクの発行・一覧・取り消し。発行したリンクは、この画面で1回だけ表示する。 */
export function LinkManager({ rows }: { rows: LinkRow[] }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [days, setDays] = useState("30");
  const [aiReads, setAiReads] = useState("5");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [issued, setIssued] = useState<{ url: string; label: string } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);

  const message = (url: string, who: string) =>
    `${who} 様\n\n請求書と領収書の提出は、下のリンクからお願いします（ログイン不要・あなた専用のリンクです。他の方には共有しないでください）。\n${url}\n\n提出すると、確認後に承認または差し戻しの連絡をします。`;

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError("");
    try {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "処理できませんでした。");
      else router.refresh();
    } catch {
      setError("通信できませんでした。もう一度お試しください。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardSection>
          <h2 className="font-semibold">提出リンクを発行する</h2>
          <p className="mt-1 text-xs text-slate-500">
            相手ごとに1本つくります。相手はログインなしで、請求書と領収書を提出できます。
          </p>
          <form
            className="mt-4 flex flex-wrap items-end gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              setCopied(false);
              try {
                const r = await createSubmissionLink({ label, days, aiReads });
                if (!r.ok) return setError(r.error);
                setIssued({
                  url: `${location.origin}/s/${r.token}`,
                  label: label.trim(),
                });
                setLabel("");
                router.refresh();
              } catch {
                setError("通信できませんでした。もう一度お試しください。");
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="text-sm">
              <span className="font-semibold">宛名（相手の名前・メモ）</span>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                required
                maxLength={60}
                placeholder="例：山田 太郎さん"
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="text-sm">
              <span className="font-semibold">有効期限</span>
              <select
                value={days}
                onChange={(e) => setDays(e.target.value)}
                className={`mt-1 ${selectClass}`}
              >
                <option value="7">7日間</option>
                <option value="30">30日間</option>
                <option value="90">90日間</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="font-semibold">AI読み取りの回数</span>
              <input
                type="number"
                min={0}
                max={50}
                value={aiReads}
                onChange={(e) => setAiReads(e.target.value)}
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <AppButton type="submit" disabled={busy}>
              発行する
            </AppButton>
          </form>
          <p className="mt-2 text-xs text-slate-500">
            承認待ちは同時に3件まで、合計20件までです。
          </p>
        </CardSection>
      </Card>

      {issued && (
        <div
          role="status"
          className="rounded-xl border border-sky-200 bg-sky-50 p-5 text-sm text-sky-950"
        >
          <p className="font-semibold">
            「{issued.label}
            」のリンクを発行しました。このリンクは、今だけ表示されます。
          </p>
          <p className="mt-1 text-xs">
            安全のため、リンクそのものは保存していません。あとから見ることはできないので、いまコピーして相手に送ってください（なくした場合は、新しく発行します）。
          </p>
          <input
            readOnly
            value={issued.url}
            onFocus={(e) => e.currentTarget.select()}
            className={`mt-3 ${inputClass} font-mono text-xs`}
          />
          <div className="mt-3 flex flex-wrap gap-3">
            <AppButton
              onClick={async () => {
                await navigator.clipboard
                  .writeText(message(issued.url, issued.label))
                  .catch(() => {});
                setCopied(true);
              }}
            >
              {copied ? "コピーしました" : "送付用の文面ごとコピー"}
            </AppButton>
            <AppButton
              variant="secondary"
              onClick={() =>
                navigator.clipboard
                  .writeText(issued.url)
                  .then(() => setCopied(true))
                  .catch(() => {})
              }
            >
              リンクだけコピー
            </AppButton>
          </div>
          <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-white p-3 text-xs text-slate-700">
            {message(issued.url, issued.label)}
          </pre>
        </div>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800"
        >
          {error}
        </p>
      )}

      <section className="space-y-3">
        <h2 className="font-semibold">発行したリンク</h2>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs">
              <tr>
                <th className="p-3">宛名</th>
                <th className="p-3">状態</th>
                <th className="p-3">有効期限</th>
                <th className="p-3 text-right">提出</th>
                <th className="p-3 text-right">承認待ち</th>
                <th className="p-3 text-right">AI読み取り</th>
                <th className="p-3">最後に使われた日</th>
                <th className="p-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 align-top">
                  <td className="p-3 font-medium">
                    {r.label}
                    <span className="block text-xs font-normal text-slate-400">
                      …{r.hint}
                    </span>
                  </td>
                  <td className="p-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusTone[r.status]}`}
                    >
                      {statusLabel[r.status]}
                    </span>
                  </td>
                  <td className="p-3">{fmt(r.expiresAt)}</td>
                  <td className="p-3 text-right tabular-nums">
                    {r.submissionCount} / {r.maxSubmissions}
                  </td>
                  <td className="p-3 text-right tabular-nums">{r.pending}</td>
                  <td className="p-3 text-right tabular-nums">
                    {r.aiReadsUsed} / {r.aiReadsLimit}
                  </td>
                  <td className="p-3">
                    {r.lastUsedAt ? fmt(r.lastUsedAt) : "—"}
                  </td>
                  <td className="p-3">
                    {r.status !== "REVOKED" && (
                      <div className="flex flex-wrap gap-3 text-xs">
                        <button
                          type="button"
                          disabled={busy}
                          className="text-sky-700"
                          onClick={() =>
                            void run(() =>
                              extendSubmissionLink({ id: r.id, days: 30 }),
                            )
                          }
                        >
                          30日延ばす
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          className="text-rose-700"
                          onClick={() => {
                            if (
                              confirm(
                                `「${r.label}」のリンクを取り消します。以後、このリンクでは提出も確認もできません。よろしいですか？`,
                              )
                            )
                              void run(() =>
                                revokeSubmissionLink({ id: r.id }),
                              );
                          }}
                        >
                          取り消す
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-500">
                    まだリンクはありません。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
