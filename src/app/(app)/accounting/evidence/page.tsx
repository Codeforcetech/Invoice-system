import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireWorkspacePage } from "@/lib/auth/require-workspace";
import { hasRole } from "@/lib/workspace/access";
import { dateText, yen } from "@/lib/accounting/model";
import {
  EVIDENCE_KINDS,
  RETENTION_NOTE,
  evidenceKindLabel,
  evidenceSearchSchema,
  evidenceStatusLabel,
  type EvidenceKind,
} from "@/lib/evidence/model";
import { searchEvidence } from "@/lib/evidence/search";
import { PageShell } from "@/components/ui/page-shell";
import { SectionHeader } from "@/components/ui/section-header";
import { AppButtonLink, appButtonVariants } from "@/components/ui/app-button";
import { Card, CardSection } from "@/components/ui/card";
import {
  DataTableShell,
  dataTableCell,
  dataTableHeadCell,
  dataTableRow,
} from "@/components/ui/data-table";
import { inputClass, selectClass } from "@/lib/ui/form-classes";
import { EvidenceUploadForm } from "@/components/evidence/upload-form";
import { ExpenseAttachmentCopy } from "@/components/evidence/expense-copy";

const stamp = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  dateStyle: "short",
  timeStyle: "short",
});
const kb = (n: number) =>
  n >= 1024 * 1024
    ? `${(n / 1024 / 1024).toFixed(1)}MB`
    : `${Math.max(1, Math.round(n / 1024))}KB`;

export default async function EvidencePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ws = await requireWorkspacePage("VIEWER");
  const sp = await searchParams;
  const raw = Object.fromEntries(
    Object.entries(sp).map(([k, v]) => [
      k,
      Array.isArray(v) ? v[0] : (v ?? ""),
    ]),
  );
  const parsed = evidenceSearchSchema.safeParse(raw);
  const f = parsed.success ? parsed.data : evidenceSearchSchema.parse({});
  const { rows, total, pages } = await searchEvidence(prisma, ws.ownerId, f);
  const canEdit = hasRole(ws.role, "EDITOR");

  const [expenses, copied] = canEdit
    ? await Promise.all([
        prisma.expense.findMany({
          where: { userId: ws.ownerId, attachment: { isNot: null } },
          select: {
            id: true,
            supplier: true,
            description: true,
            amount: true,
            dueDate: true,
            attachment: { select: { filename: true } },
          },
          orderBy: { dueDate: "desc" },
          take: 100,
        }),
        prisma.evidenceFile.findMany({
          where: { ownerId: ws.ownerId, sourceType: "EXPENSE" },
          select: { sourceId: true },
        }),
      ])
    : [[], []];
  const done = new Set(copied.map((c) => c.sourceId));
  const unsaved = expenses
    .filter((e) => !done.has(e.id))
    .map((e) => ({
      id: e.id,
      supplier: e.supplier,
      description: e.description,
      amount: e.amount,
      filename: e.attachment?.filename ?? "",
      defaultDate: dateText(e.dueDate),
    }));

  const query = (page: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(raw))
      if (v && k !== "page") q.set(k, v);
    q.set("page", String(page));
    return `/accounting/evidence?${q}`;
  };

  return (
    <PageShell>
      <SectionHeader
        variant="page"
        title="証憑ファイルボックス"
        description="領収書・請求書などを、受け取ったままの内容で保存し、取引年月日・金額・取引先で探せます。"
      />
      <p className="rounded-xl bg-slate-50 p-4 text-xs leading-6 text-slate-600">
        {RETENTION_NOTE}
      </p>
      {canEdit && <EvidenceUploadForm />}
      <ExpenseAttachmentCopy rows={unsaved} />
      <Card>
        <CardSection>
          <h2 className="text-lg font-semibold">証憑を探す</h2>
          <form
            className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
            method="get"
          >
            <label className="text-xs">
              取引年月日（から）
              <input
                type="date"
                name="from"
                defaultValue={f.from ?? ""}
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="text-xs">
              取引年月日（まで）
              <input
                type="date"
                name="to"
                defaultValue={f.to ?? ""}
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="text-xs">
              金額（円・以上）
              <input
                type="number"
                name="amountMin"
                min={0}
                defaultValue={f.amountMin ?? ""}
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="text-xs">
              金額（円・以下）
              <input
                type="number"
                name="amountMax"
                min={0}
                defaultValue={f.amountMax ?? ""}
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="text-xs sm:col-span-2">
              取引先（一部でも検索できます）
              <input
                name="counterparty"
                maxLength={150}
                defaultValue={f.counterparty}
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="text-xs">
              種類
              <select
                name="kind"
                defaultValue={f.kind ?? ""}
                className={`mt-1 ${selectClass}`}
              >
                <option value="">すべて</option>
                {EVIDENCE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {evidenceKindLabel[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              状態
              <select
                name="status"
                defaultValue={f.status}
                className={`mt-1 ${selectClass}`}
              >
                <option value="ACTIVE">有効のみ</option>
                <option value="VOID">無効のみ</option>
                <option value="ALL">すべて</option>
              </select>
            </label>
            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
              <button className={`rounded-xl ${appButtonVariants.primary}`}>
                検索する
              </button>
              <Link
                href="/accounting/evidence"
                className={`rounded-xl ${appButtonVariants.secondary}`}
              >
                条件をクリア
              </Link>
            </div>
          </form>
        </CardSection>
      </Card>
      <p className="text-sm text-slate-500">
        {total.toLocaleString("ja-JP")}件
      </p>
      <DataTableShell>
        <table className="w-full min-w-[760px]">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/70">
              <th className={dataTableHeadCell}>取引年月日</th>
              <th className={dataTableHeadCell}>取引先</th>
              <th className={`${dataTableHeadCell} text-right`}>金額</th>
              <th className={dataTableHeadCell}>種類</th>
              <th className={dataTableHeadCell}>ファイル</th>
              <th className={dataTableHeadCell}>登録日時</th>
              <th className={dataTableHeadCell}>状態</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={dataTableRow}>
                <td className={`${dataTableCell} whitespace-nowrap`}>
                  {dateText(r.transactionDate)}
                </td>
                <td className={dataTableCell}>
                  <Link
                    href={`/accounting/evidence/${r.id}`}
                    className="font-medium text-emerald-800 underline"
                  >
                    {r.counterparty}
                  </Link>
                </td>
                <td className={`${dataTableCell} text-right tabular-nums`}>
                  {yen(r.amount)}
                </td>
                <td className={dataTableCell}>
                  {evidenceKindLabel[r.kind as EvidenceKind] ?? r.kind}
                </td>
                <td
                  className={`${dataTableCell} max-w-[14rem] break-all text-xs`}
                >
                  {r.filename}
                  <span className="ml-1 text-slate-400">{kb(r.size)}</span>
                </td>
                <td className={`${dataTableCell} whitespace-nowrap text-xs`}>
                  {stamp.format(r.createdAt)}
                </td>
                <td className={dataTableCell}>
                  {evidenceStatusLabel[r.status] ?? r.status}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td className={dataTableCell} colSpan={7}>
                  条件に合う証憑はありません。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </DataTableShell>
      {pages > 1 && (
        <nav
          className="flex items-center justify-between text-sm"
          aria-label="ページ送り"
        >
          {f.page > 1 ? (
            <AppButtonLink href={query(f.page - 1)} variant="secondary">
              前へ
            </AppButtonLink>
          ) : (
            <span />
          )}
          <span className="text-slate-500">
            {f.page} / {pages}
          </span>
          {f.page < pages ? (
            <AppButtonLink href={query(f.page + 1)} variant="secondary">
              次へ
            </AppButtonLink>
          ) : (
            <span />
          )}
        </nav>
      )}
    </PageShell>
  );
}
