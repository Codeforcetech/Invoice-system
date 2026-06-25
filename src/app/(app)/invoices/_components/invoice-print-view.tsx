import Link from "next/link";

import type { InvoiceWithItems } from "@/actions/invoice-actions";
import type { InvoiceForShare } from "@/actions/invoice-share-actions";
import { PrintButton } from "@/app/(app)/invoices/_components/print-button";
import { StampImage } from "@/components/invoices/stamp-image";
import { SuppressBrowserPrintHeaders } from "@/components/invoices/suppress-browser-print-headers";

type SystemSettings = {
  companyName: string;
  invoiceRegistrationNumber: string | null;
  postalCode: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  contactPerson: string | null;
  stampImageUrl: string | null;
  bankName: string | null;
  branchName: string | null;
  accountType: string | null;
  accountNumber: string | null;
  accountHolder: string | null;
  transferNote: string | null;
};

function yen(n: number) {
  return new Intl.NumberFormat("ja-JP").format(n);
}

function fmtDate(d: Date) {
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}年${m}月${day}日`;
}

function itemLabel(it: InvoiceWithItems["items"][number] | InvoiceForShare["items"][number]) {
  let name = it.productName;
  if (it.unit) name += `（${it.unit}）`;
  return name;
}

function formatWithholding(amount: number) {
  return `-${yen(amount)}`;
}

function bankLines(settings: SystemSettings): string[] {
  const lines: string[] = [];
  const bankBranch = [settings.bankName, settings.branchName].filter(Boolean).join(" ");
  if (bankBranch) lines.push(bankBranch);
  const account = [settings.accountType, settings.accountNumber].filter(Boolean).join(" ");
  if (account) lines.push(account);
  if (settings.accountHolder) lines.push(settings.accountHolder);
  return lines;
}

const PRINT_CSS = `
  @page { size: A4 portrait; margin: 0; }
  @media print {
    html, body {
      margin: 0 !important;
      background: #fff !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .invoice-print-outer { min-height: 0 !important; padding: 0 !important; }
    .invoice-print-pad { padding: 10mm 12mm 14mm 12mm !important; }
    .invoice-print-mask-top,
    .invoice-print-mask-bottom {
      display: block !important;
      position: fixed;
      left: 0;
      right: 0;
      background: #fff;
      z-index: 2147483647;
      pointer-events: none;
    }
    .invoice-print-mask-top { top: 0; height: 9mm; }
    .invoice-print-mask-bottom { bottom: 0; height: 11mm; }
  }
`;

export function InvoicePrintView(props: {
  invoice: InvoiceWithItems | InvoiceForShare;
  settings: SystemSettings;
  embed?: boolean;
  /** ログイン不要の共有ページ（戻るリンクなし・印刷のみ） */
  publicShare?: boolean;
}) {
  const { invoice, settings, embed, publicShare } = props;
  const taxRatePercent = invoice.taxRate / 100;
  const showWithholding = invoice.withholdingEnabled && invoice.withholdingTax > 0;
  const remarks = [invoice.company.paymentTerms, settings.transferNote].filter(Boolean).join("\n\n");
  const banks = bankLines(settings);

  return (
    <div
          className={`invoice-print-outer ${
            embed || publicShare
              ? "bg-white"
              : "min-h-screen bg-slate-100 py-8 print:bg-white print:py-0"
          }`}
    >
      <style>{PRINT_CSS}</style>
      <SuppressBrowserPrintHeaders />
      <div aria-hidden className="invoice-print-mask-top hidden" />
      <div aria-hidden className="invoice-print-mask-bottom hidden" />

      {!embed && !publicShare ? (
        <div className="mx-auto mb-4 flex w-[210mm] max-w-full items-center justify-end gap-2 print:hidden">
          <Link
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm hover:bg-zinc-50"
            href={`/invoices/${invoice.id}`}
          >
            詳細へ戻る
          </Link>
          <PrintButton />
        </div>
      ) : null}

      {!embed && publicShare ? (
        <div className="mx-auto mb-4 flex w-[210mm] max-w-full items-center justify-end gap-2 print:hidden">
          <PrintButton />
        </div>
      ) : null}

      <div
        className={
          embed || publicShare
            ? "mx-auto w-full max-w-full bg-white"
            : "mx-auto w-[210mm] max-w-full bg-white shadow-sm ring-1 ring-slate-200 print:w-auto print:shadow-none print:ring-0"
        }
      >
        <div
          className={`invoice-print-pad text-[13px] leading-normal text-zinc-900 ${
            embed ? "px-9 py-8 sm:px-10 sm:py-9" : "px-10 py-8"
          }`}
        >
          {/* タイトル */}
          <h1 className="mb-6 text-center text-[24px] font-bold tracking-[0.15em] text-zinc-900">
            請求書
          </h1>

          {/* 宛先・差出人 */}
          <div className="mb-6 flex items-start justify-between gap-8">
            <div className="min-w-0 flex-1">
              <p className="border-b-2 border-zinc-900 pb-1 text-[16px] font-semibold">
                {invoice.company.name} 御中
              </p>
              {invoice.subject ? (
                <p className="mt-2 text-[13px] leading-normal text-zinc-600">
                  件名：{invoice.subject}
                </p>
              ) : null}
            </div>

            <div className="w-[48%] shrink-0 text-[12px] leading-normal">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-0.5">
                  <p className="text-[14px] font-bold text-zinc-900">{settings.companyName}</p>
                  {settings.postalCode || settings.address ? (
                    <p>
                      {settings.postalCode ? `〒${settings.postalCode} ` : ""}
                      {settings.address ?? ""}
                    </p>
                  ) : null}
                  {settings.phone ? <p>TEL: {settings.phone}</p> : null}
                  {settings.email ? <p>{settings.email}</p> : null}
                  {settings.contactPerson ? <p>{settings.contactPerson}</p> : null}
                  {settings.invoiceRegistrationNumber ? (
                    <p className="text-zinc-600">登録番号: {settings.invoiceRegistrationNumber}</p>
                  ) : null}
                </div>
                <div className="shrink-0">
                  <StampImage url={settings.stampImageUrl} />
                </div>
              </div>

              <dl className="mt-4 space-y-1 border-t border-zinc-200 pt-3">
                <div className="flex gap-3">
                  <dt className="w-[6.5rem] shrink-0 text-zinc-500">請求書番号</dt>
                  <dd className="min-w-0 break-all font-medium text-zinc-900">{invoice.invoiceNumber}</dd>
                </div>
                <div className="flex gap-3">
                  <dt className="w-[6.5rem] shrink-0 text-zinc-500">請求日</dt>
                  <dd>{fmtDate(invoice.issueDate)}</dd>
                </div>
                <div className="flex gap-3">
                  <dt className="w-[6.5rem] shrink-0 text-zinc-500">お支払期限</dt>
                  <dd>{fmtDate(invoice.dueDate)}</dd>
                </div>
              </dl>
            </div>
          </div>

          {/* ご請求金額 */}
          <div className="mb-1.5 mt-1">
            <span className="text-[14px] text-zinc-800">ご請求金額 </span>
            <span className="text-[20px] font-bold tabular-nums">{yen(invoice.grandTotal)}</span>
            <span className="text-[14px] text-zinc-800"> 円</span>
          </div>
          <hr className="mb-5 border-zinc-800" />

          {/* 明細テーブル */}
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b-2 border-zinc-800 text-zinc-700">
                <th className="py-2 pr-4 text-left font-semibold">品目</th>
                <th className="w-[5.5rem] py-2 pr-3 text-right font-semibold">単価</th>
                <th className="w-[3.5rem] py-2 pr-3 text-right font-semibold">数量</th>
                <th className="w-[6.5rem] py-2 text-right font-semibold">価格</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((it, idx) => (
                <tr
                  key={it.id}
                  className={`border-b border-zinc-300 ${idx % 2 === 1 ? "bg-zinc-50" : "bg-white"}`}
                >
                  <td className="py-2.5 pr-4 align-top">
                    <div>{itemLabel(it)}</div>
                    {it.note ? <div className="mt-0.5 text-[12px] text-zinc-500">{it.note}</div> : null}
                  </td>
                  <td className="py-2.5 pr-3 text-right align-top tabular-nums">{yen(it.unitPrice)}</td>
                  <td className="py-2.5 pr-3 text-right align-top tabular-nums">{String(it.quantity)}</td>
                  <td className="py-2.5 text-right align-top tabular-nums">{yen(it.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* 税率別内訳（左）・集計（右） */}
          <div className="mt-4 flex items-start justify-between gap-6">
            <div className="min-w-0 flex-1">
              <p className="mb-2 text-[13px] font-semibold text-zinc-800">税率別内訳</p>
              <table className="w-full max-w-[340px] border-collapse text-[12px]">
                <thead>
                  <tr className="border-b border-zinc-400 text-zinc-700">
                    <th className="w-10 py-1.5 pr-2 text-left font-medium" />
                    <th className="border-l border-zinc-300 py-1.5 px-2 text-right font-medium">税抜金額</th>
                    <th className="py-1.5 px-2 text-right font-medium">消費税額</th>
                    <th className="py-1.5 pl-2 text-right font-medium">税込金額</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-zinc-300">
                    <td className="py-1.5 pr-2 tabular-nums">{taxRatePercent}%</td>
                    <td className="border-l border-zinc-300 py-1.5 px-2 text-right tabular-nums">
                      {yen(invoice.subtotal)}
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{yen(invoice.taxAmount)}</td>
                    <td className="py-1.5 pl-2 text-right tabular-nums">{yen(invoice.totalWithTax)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="w-[42%] min-w-[200px] shrink-0 text-[13px]">
              <div className="flex justify-between border-b border-zinc-300 py-1.5">
                <span className="text-zinc-700">小計</span>
                <span className="tabular-nums">{yen(invoice.subtotal)}</span>
              </div>
              <div className="flex justify-between border-b border-zinc-300 py-1.5">
                <span className="text-zinc-700">消費税額合計</span>
                <span className="tabular-nums">{yen(invoice.taxAmount)}</span>
              </div>
              {showWithholding ? (
                <>
                  <div className="flex justify-between border-b border-zinc-300 py-1.5">
                    <span className="text-zinc-700">税込合計</span>
                    <span className="tabular-nums">{yen(invoice.totalWithTax)}</span>
                  </div>
                  <div className="flex justify-between border-b border-zinc-300 py-1.5">
                    <span className="text-zinc-700">源泉徴収税額</span>
                    <span className="tabular-nums">{formatWithholding(invoice.withholdingTax)}</span>
                  </div>
                </>
              ) : null}
              <div className="flex justify-between border-t-2 border-zinc-800 py-2 text-[14px] font-bold">
                <span>合計</span>
                <span className="tabular-nums">{yen(invoice.grandTotal)}</span>
              </div>
            </div>
          </div>

          {/* 振込先・備考 */}
          <div className="mt-8 grid max-w-[75%] grid-cols-1 gap-5">
            <div>
              <p className="mb-1.5 text-[13px] font-semibold text-zinc-800">振込先</p>
              <div className="min-h-[3rem] rounded border border-zinc-300 px-3.5 py-2 text-[13px] leading-normal text-zinc-800">
                {banks.length > 0 ? (
                  <div className="space-y-0.5">
                    {banks.map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                  </div>
                ) : (
                  "—"
                )}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-[13px] font-semibold text-zinc-800">備考</p>
              <div className="min-h-[3rem] whitespace-pre-wrap rounded border border-zinc-300 px-3.5 py-2 text-[13px] leading-normal text-zinc-800">
                {remarks || "—"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
