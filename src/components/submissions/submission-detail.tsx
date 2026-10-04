import { yen } from "@/lib/accounting/model";
import { taxCategoryInfo, isTaxCategory } from "@/lib/tax/categories";
import {
  submissionKindLabel,
  submissionStatusLabel,
  taxGroups,
  type SubmissionKind,
} from "@/lib/submissions/model";
import { eventLabel, type LoadedSubmission } from "@/lib/submissions/queries";
import { Card, CardSection } from "@/components/ui/card";

const statusTone: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  SUBMITTED: "bg-amber-100 text-amber-900",
  APPROVED: "bg-emerald-100 text-emerald-900",
  REJECTED: "bg-rose-100 text-rose-900",
};
export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${statusTone[status] ?? statusTone.DRAFT}`}
    >
      {submissionStatusLabel[status] ?? status}
    </span>
  );
}

const fmt = (d: Date) =>
  new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);

/** 提出の中身（請求の内容・差出人・添付・履歴）。提出者の詳細と、管理者の承認画面で共通に使う。 */
export function SubmissionDetail({
  s,
  fileHref,
}: {
  s: LoadedSubmission;
  /** 添付ファイルのリンク先。外部の人の画面では、リンク専用の取得先を渡す。 */
  fileHref?: (fileId: string) => string;
}) {
  const groups = taxGroups(s.items);
  const sender = s.senderName || s.submitter?.name || s.link?.label || "";
  return (
    <div className="space-y-5">
      <Card>
        <CardSection>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs text-slate-500">
                {s.month.replace("-", "年")}月分
              </p>
              <h2 className="text-lg font-semibold">{s.title}</h2>
            </div>
            <StatusBadge status={s.status} />
          </div>
          <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[9rem_1fr]">
            <dt className="text-slate-500">差出人</dt>
            <dd>{sender}</dd>
            {s.senderAddress && (
              <>
                <dt className="text-slate-500">住所</dt>
                <dd>{s.senderAddress}</dd>
              </>
            )}
            {s.senderRegistration && (
              <>
                <dt className="text-slate-500">登録番号</dt>
                <dd>{s.senderRegistration}</dd>
              </>
            )}
            {s.senderBank && (
              <>
                <dt className="text-slate-500">振込先</dt>
                <dd>{s.senderBank}</dd>
              </>
            )}
            {s.submittedAt && (
              <>
                <dt className="text-slate-500">提出した日時</dt>
                <dd>{fmt(s.submittedAt)}</dd>
              </>
            )}
            {s.note && (
              <>
                <dt className="text-slate-500">メッセージ</dt>
                <dd className="whitespace-pre-wrap">{s.note}</dd>
              </>
            )}
          </dl>
          {s.status === "REJECTED" && s.rejectReason && (
            <p
              role="alert"
              className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900"
            >
              <span className="font-semibold">差し戻しの理由：</span>
              <span className="whitespace-pre-wrap">{s.rejectReason}</span>
            </p>
          )}
        </CardSection>
      </Card>

      <Card>
        <CardSection>
          <h2 className="font-semibold">請求の内容</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-slate-50 text-xs">
                <tr>
                  <th className="p-2">種類</th>
                  <th className="p-2">項目</th>
                  <th className="p-2 text-right">数量</th>
                  <th className="p-2 text-right">単価</th>
                  <th className="p-2">税</th>
                  <th className="p-2 text-right">金額（税抜）</th>
                </tr>
              </thead>
              <tbody>
                {s.items.map((i) => (
                  <tr
                    key={i.id}
                    className="border-t border-slate-100 align-top"
                  >
                    <td className="p-2">
                      {submissionKindLabel[i.kind as SubmissionKind] ?? i.kind}
                    </td>
                    <td className="p-2">
                      {i.name}
                      {i.note && (
                        <span className="block text-xs text-slate-500">
                          {i.note}
                        </span>
                      )}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {Number(i.quantity)}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      ¥{yen(i.unitPrice)}
                    </td>
                    <td className="p-2">
                      {isTaxCategory(i.taxCategory)
                        ? taxCategoryInfo[i.taxCategory].short
                        : i.taxCategory}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      ¥{yen(i.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="mt-4 ml-auto max-w-xs space-y-1 text-sm">
            <div className="flex justify-between">
              <dt>小計（税抜）</dt>
              <dd className="tabular-nums">¥{yen(s.subtotal)}</dd>
            </div>
            {groups
              .filter((g) => g.tax > 0)
              .map((g) => (
                <div
                  key={g.taxCategory}
                  className="flex justify-between text-slate-600"
                >
                  <dt>消費税（{taxCategoryInfo[g.taxCategory].short}）</dt>
                  <dd className="tabular-nums">¥{yen(g.tax)}</dd>
                </div>
              ))}
            <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-semibold">
              <dt>合計（税込）</dt>
              <dd className="tabular-nums">¥{yen(s.total)}</dd>
            </div>
          </dl>
        </CardSection>
      </Card>

      <Card>
        <CardSection>
          <h2 className="font-semibold">添付ファイル</h2>
          {s.files.length ? (
            <ul className="mt-2 space-y-1 text-sm">
              {s.files.map((f) => (
                <li key={f.id}>
                  <a
                    href={
                      fileHref
                        ? fileHref(f.id)
                        : `/api/submissions/${s.id}/files/${f.id}`
                    }
                    className="text-sky-700"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {f.filename}
                  </a>
                  <span className="ml-2 text-xs text-slate-500">
                    {Math.ceil(f.size / 1024)}KB
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-slate-500">添付はありません。</p>
          )}
        </CardSection>
      </Card>

      {s.status === "APPROVED" && s.expenses.length > 0 && (
        <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">
          承認されて、支払管理に{s.expenses.length}件が反映されています。
        </p>
      )}

      <Card>
        <CardSection>
          <h2 className="font-semibold">経過</h2>
          <ol className="mt-2 space-y-1 text-sm">
            {s.events.map((e) => (
              <li key={e.id} className="text-slate-700">
                <span className="text-xs text-slate-500">
                  {fmt(e.createdAt)}
                </span>
                　{eventLabel[e.action] ?? e.action}
                {e.actorName && (
                  <span className="text-slate-500">（{e.actorName}）</span>
                )}
                {e.note && (
                  <span className="block pl-4 text-xs text-slate-600">
                    {e.note}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </CardSection>
      </Card>
    </div>
  );
}
