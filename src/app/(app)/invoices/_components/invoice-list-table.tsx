"use client";

import { useState } from "react";
import { ReceiptBadge } from "@/components/invoices/invoice-receipt";
import { InvoicePreviewModal } from "@/components/invoices/invoice-preview-modal";
import Link from "next/link";

import type { InvoiceStatus } from "@prisma/client";
import { InvoiceStatusBadge } from "@/app/(app)/invoices/_components/invoice-status-badge";
import { DuplicateInvoiceButton } from "@/components/invoices/duplicate-invoice-button";
import {
  DataTableShell,
  dataTableCell,
  dataTableHeadCell,
  dataTableRow,
} from "@/components/ui/data-table";
import { formatInvoiceNumberCompact } from "@/lib/invoice/formatInvoiceNumber";

type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  subject: string;
  issueDate: Date;
  dueDate: Date;
  grandTotal: number;
  withholdingEnabled: boolean;
  status: InvoiceStatus;
  createdAt: Date;
  receivedDate: Date | null;
  company: { id: string; name: string };
};

function yen(n: number) {
  return new Intl.NumberFormat("ja-JP").format(n);
}

function fmtDate(d: Date) {
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

const opLink =
  "text-xs font-medium text-sky-600 hover:text-sky-700 hover:underline";

export function InvoiceListTable({ rows }: { rows: InvoiceRow[] }) {
  const [previewId, setPreviewId] = useState<string | null>(null);
  if (!rows.length)
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
        <h2 className="font-semibold text-slate-800">
          該当する請求書がありません
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          検索条件を変えるか、新しい請求書を作成してください。
        </p>
      </div>
    );
  return (
    <>
      <InvoicePreviewModal
        open={!!previewId}
        invoiceId={previewId}
        onClose={() => setPreviewId(null)}
      />
      <div className="space-y-3 md:hidden">
        {rows.map((r) => (
          <article
            key={r.id}
            className="rounded-2xl border border-slate-200 bg-white p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <Link
                href={`/invoices/${r.id}`}
                className="min-w-0 font-semibold text-slate-800"
              >
                <span className="block truncate">{r.company.name}</span>
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  {r.invoiceNumber}
                </span>
              </Link>
              <div className="flex flex-col items-start gap-2">
                <InvoiceStatusBadge status={r.status} />
                <ReceiptBadge invoice={r} />
                {r.receivedDate && (
                  <span className="text-xs text-slate-500">
                    {fmtDate(r.receivedDate)}
                  </span>
                )}
              </div>
            </div>
            <p className="my-3 text-sm text-slate-600">{r.subject}</p>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-slate-500">
                支払期限 {fmtDate(r.dueDate)}
              </span>
              <strong className="text-lg tabular-nums">
                ¥{yen(r.grandTotal)}
              </strong>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-slate-100 pt-4">
              <button
                type="button"
                className={opLink}
                onClick={() => setPreviewId(r.id)}
              >
                プレビュー
              </button>
              <Link className={opLink} href={`/invoices/${r.id}`}>
                詳細を見る
              </Link>
              <Link className={opLink} href={`/invoices/${r.id}/edit`}>
                編集
              </Link>
              <DuplicateInvoiceButton invoiceId={r.id} className={opLink} />
            </div>
          </article>
        ))}
      </div>
      <DataTableShell className="hidden md:block">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/90">
              <th className={dataTableHeadCell}>取引先 / 件名</th>
              <th className={dataTableHeadCell}>請求日 / 支払期限</th>
              <th className={`${dataTableHeadCell} text-right`}>請求金額</th>
              <th className={dataTableHeadCell}>状態</th>
              <th className={`${dataTableHeadCell} text-right`}>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={dataTableRow}>
                <td className={`${dataTableCell} max-w-[300px]`}>
                  <Link
                    className="block truncate font-semibold text-slate-900 hover:text-sky-700"
                    href={`/invoices/${r.id}`}
                  >
                    {r.company.name}
                  </Link>
                  <p
                    className="mt-1 truncate text-xs text-slate-500"
                    title={r.subject}
                  >
                    {r.subject}
                  </p>
                  <p
                    className="mt-1 text-[10px] text-slate-400"
                    title={r.invoiceNumber}
                  >
                    {formatInvoiceNumberCompact(r.invoiceNumber)}
                  </p>
                </td>
                <td
                  className={`${dataTableCell} whitespace-nowrap text-xs tabular-nums`}
                >
                  <p>{fmtDate(r.issueDate)}</p>
                  <p className="mt-2 text-slate-500">
                    期限 {fmtDate(r.dueDate)}
                  </p>
                </td>
                <td
                  className={`${dataTableCell} whitespace-nowrap text-right font-semibold tabular-nums`}
                >
                  ¥{yen(r.grandTotal)}
                  {r.withholdingEnabled && (
                    <p className="mt-1 text-[10px] font-normal text-slate-500">
                      源泉控除あり
                    </p>
                  )}
                </td>
                <td className={dataTableCell}>
                  <div className="flex flex-col items-start gap-2">
                    <InvoiceStatusBadge status={r.status} />
                    <ReceiptBadge invoice={r} />
                    {r.receivedDate && (
                      <span className="text-xs text-slate-500">
                        {fmtDate(r.receivedDate)}
                      </span>
                    )}
                  </div>
                </td>
                <td className={dataTableCell}>
                  <div className="flex flex-wrap justify-end gap-3">
                    <button
                      type="button"
                      className={opLink}
                      onClick={() => setPreviewId(r.id)}
                    >
                      プレビュー
                    </button>
                    <Link className={opLink} href={`/invoices/${r.id}`}>
                      詳細
                    </Link>
                    <Link className={opLink} href={`/invoices/${r.id}/edit`}>
                      編集
                    </Link>
                    <DuplicateInvoiceButton
                      invoiceId={r.id}
                      className={opLink}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </DataTableShell>
    </>
  );
}
