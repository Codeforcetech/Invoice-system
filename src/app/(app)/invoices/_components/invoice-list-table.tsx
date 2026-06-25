"use client";

import Link from "next/link";

import type { InvoiceStatus } from "@prisma/client";
import { InvoiceStatusBadge } from "@/app/(app)/invoices/_components/invoice-status-badge";
import { DuplicateInvoiceButton } from "@/components/invoices/duplicate-invoice-button";
import { DataTableShell, dataTableCell, dataTableHeadCell, dataTableRow } from "@/components/ui/data-table";
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

const opLink = "text-xs font-medium text-sky-600 hover:text-sky-700 hover:underline";

export function InvoiceListTable(props: { rows: InvoiceRow[] }) {
  return (
    <DataTableShell>
      <table className="w-full min-w-[900px] table-fixed border-collapse">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/90">
              <th className={`${dataTableHeadCell} w-[9.5rem]`}>請求書番号</th>
              <th className={`${dataTableHeadCell} w-[6.5rem]`}>会社</th>
              <th className={dataTableHeadCell}>件名</th>
              <th className={dataTableHeadCell}>請求日</th>
              <th className={dataTableHeadCell}>支払期限</th>
              <th className={`${dataTableHeadCell} text-right`}>合計金額</th>
              <th className={dataTableHeadCell}>源泉</th>
              <th className={dataTableHeadCell}>ステータス</th>
              <th className={dataTableHeadCell}>作成日</th>
              <th className={`${dataTableHeadCell} text-right`}>操作</th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((r) => (
              <tr key={r.id} className={dataTableRow}>
                <td
                  className={`${dataTableCell} max-w-0 truncate font-mono text-xs text-slate-600`}
                  title={r.invoiceNumber}
                >
                  {formatInvoiceNumberCompact(r.invoiceNumber)}
                </td>
                <td className={`${dataTableCell} max-w-0 truncate`} title={r.company.name}>
                  {r.company.name}
                </td>
                <td className={`${dataTableCell} max-w-0 truncate`} title={r.subject}>
                  {r.subject}
                </td>
                <td className={`${dataTableCell} whitespace-nowrap tabular-nums text-slate-600`}>{fmtDate(r.issueDate)}</td>
                <td className={`${dataTableCell} whitespace-nowrap tabular-nums text-slate-600`}>{fmtDate(r.dueDate)}</td>
                <td className={`${dataTableCell} whitespace-nowrap text-right text-sm font-semibold tabular-nums text-slate-900`}>
                  {yen(r.grandTotal)}円
                </td>
                <td className={dataTableCell}>{r.withholdingEnabled ? "あり" : "なし"}</td>
                <td className={dataTableCell}>
                  <InvoiceStatusBadge status={r.status} />
                </td>
                <td className={`${dataTableCell} whitespace-nowrap tabular-nums text-slate-600`}>{fmtDate(r.createdAt)}</td>
                <td className={`${dataTableCell} text-right`}>
                  <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
                    <Link className={opLink} href={`/invoices/${r.id}`}>
                      詳細
                    </Link>
                    <Link className={opLink} href={`/invoices/${r.id}/edit`}>
                      編集
                    </Link>
                    <Link className={opLink} href={`/invoices/${r.id}/print`} target="_blank">
                      帳票
                    </Link>
                    <DuplicateInvoiceButton
                      invoiceId={r.id}
                      className="text-xs font-medium text-slate-600 underline decoration-slate-300 underline-offset-2 hover:text-sky-600 disabled:opacity-60"
                    />
                  </div>
                </td>
              </tr>
            ))}
            {props.rows.length === 0 && (
              <tr>
                <td className="px-4 py-12 text-center text-sm text-slate-500" colSpan={10}>
                  請求書がありません。「新規作成」から作成してください。
                </td>
              </tr>
            )}
          </tbody>
      </table>
    </DataTableShell>
  );
}
