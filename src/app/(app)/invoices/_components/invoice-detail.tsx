import type { MailTemplate, Prisma } from "@prisma/client";
import { InvoiceStatusBadge } from "@/app/(app)/invoices/_components/invoice-status-badge";
import { InvoiceDetailToolbar } from "@/app/(app)/invoices/_components/invoice-detail-toolbar";
import { Card, CardSection } from "@/components/ui/card";
import { pageDescriptionClass, pageTitleClass } from "@/components/ui/section-header";

const innerBox = "rounded-lg border border-slate-200/90 px-4 py-3";

type InvoiceDetailData = {
  id: string;
  invoiceNumber: string;
  subject: string;
  issueDate: Date;
  dueDate: Date;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  totalWithTax: number;
  withholdingEnabled: boolean;
  withholdingTax: number;
  grandTotal: number;
  status: "DRAFT" | "CONFIRMED" | "ISSUED";
  createdAt: Date;
  company: { id: string; name: string };
  items: {
    id: string;
    sortOrder: number;
    productName: string;
    unit: string | null;
    quantity: Prisma.Decimal;
    unitPrice: number;
    amount: number;
    amountManuallyEdited: boolean;
    note: string | null;
  }[];
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

export function InvoiceDetail(props: {
  invoice: InvoiceDetailData;
  mailTemplates: Pick<MailTemplate, "id" | "name" | "subjectTemplate" | "bodyTemplate">[];
}) {
  const inv = props.invoice;

  return (
    <div className="space-y-6">
      <Card>
        <CardSection>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className={pageTitleClass}>請求書詳細</h1>
                <InvoiceStatusBadge status={inv.status} />
              </div>
              <p className={pageDescriptionClass}>
                請求書番号:{" "}
                <span className="font-mono text-[0.8125rem] text-slate-600">{inv.invoiceNumber}</span>
              </p>
            </div>
            <InvoiceDetailToolbar invoiceId={inv.id} mailTemplates={props.mailTemplates} />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className={innerBox}>
              <div className="text-xs text-slate-600">発行先会社</div>
              <div className="mt-1 text-sm font-medium text-slate-900">{inv.company.name}</div>
            </div>
            <div className={innerBox}>
              <div className="text-xs text-slate-600">件名</div>
              <div className="mt-1 text-sm font-medium text-slate-900">{inv.subject}</div>
            </div>
            <div className={innerBox}>
              <div className="text-xs text-slate-600">請求日</div>
              <div className="mt-1 text-sm font-medium text-slate-900">{fmtDate(inv.issueDate)}</div>
            </div>
            <div className={innerBox}>
              <div className="text-xs text-slate-600">支払期限</div>
              <div className="mt-1 text-sm font-medium text-slate-900">{fmtDate(inv.dueDate)}</div>
            </div>
            <div className={`md:col-span-2 ${innerBox} bg-slate-50/80`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-600">源泉所得税</div>
                  <div className="mt-1 text-sm font-medium text-slate-900">
                    {inv.withholdingEnabled ? "あり（ON）" : "なし（OFF）"}
                  </div>
                </div>
                <div className="text-sm text-slate-600">
                  作成日: <span className="font-medium text-slate-900">{fmtDate(inv.createdAt)}</span>
                </div>
              </div>
            </div>
          </div>
        </CardSection>
      </Card>

      <Card>
        <CardSection>
          <h2 className="text-base font-semibold text-slate-900">明細</h2>
          <div className="mt-3 overflow-hidden rounded-xl border border-slate-200/90">
            <div className="overflow-x-auto">
              <table className="min-w-[900px] w-full border-collapse">
                <thead>
                  <tr className="border-b border-slate-200/90 bg-slate-50 text-left text-xs text-slate-600">
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">商品名</th>
                    <th className="px-3 py-2">単位</th>
                    <th className="px-3 py-2 text-right">数量</th>
                    <th className="px-3 py-2 text-right">単価(円)</th>
                    <th className="px-3 py-2 text-right">金額(円)</th>
                    <th className="px-3 py-2">備考</th>
                  </tr>
                </thead>
                <tbody>
                  {inv.items.map((it) => (
                    <tr key={it.id} className="border-b border-slate-100 last:border-b-0">
                      <td className="px-3 py-2 text-sm text-slate-600">{it.sortOrder}</td>
                      <td className="px-3 py-2 text-sm text-slate-900">{it.productName}</td>
                      <td className="px-3 py-2 text-sm text-slate-900">{it.unit ?? ""}</td>
                      <td className="px-3 py-2 text-right text-sm tabular-nums text-slate-900">{String(it.quantity)}</td>
                      <td className="px-3 py-2 text-right text-sm tabular-nums text-slate-900">{yen(it.unitPrice)}円</td>
                      <td className="px-3 py-2 text-right text-sm tabular-nums text-slate-900">
                        <span
                          className={
                            it.amountManuallyEdited ? "rounded bg-amber-50 px-2 py-0.5 text-amber-800" : ""
                          }
                        >
                          {yen(it.amount)}円
                        </span>
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-900">{it.note ?? ""}</td>
                    </tr>
                  ))}
                  {inv.items.length === 0 && (
                    <tr>
                      <td className="px-3 py-10 text-center text-sm text-slate-500" colSpan={7}>
                        明細がありません。
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </CardSection>
      </Card>

      <Card>
        <CardSection>
          <h2 className="text-base font-semibold text-slate-900">合計</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className={`flex items-center justify-between ${innerBox}`}>
              <span className="text-sm text-slate-600">税抜合計</span>
              <span className="text-sm font-semibold text-slate-900">{yen(inv.subtotal)}円</span>
            </div>
            <div className={`flex items-center justify-between ${innerBox}`}>
              <span className="text-sm text-slate-600">消費税</span>
              <span className="text-sm font-semibold text-slate-900">{yen(inv.taxAmount)}円</span>
            </div>
            <div className={`flex items-center justify-between ${innerBox}`}>
              <span className="text-sm text-slate-600">税込合計</span>
              <span className="text-sm font-semibold text-slate-900">{yen(inv.totalWithTax)}円</span>
            </div>
            <div className={`flex items-center justify-between ${innerBox}`}>
              <span className="text-sm text-slate-600">源泉所得税</span>
              <span className="text-sm font-semibold text-slate-900">{yen(inv.withholdingTax)}円</span>
            </div>
            <div className="md:col-span-2 flex items-center justify-between rounded-lg border border-slate-200/90 bg-slate-50/80 px-4 py-4">
              <span className="text-sm font-medium text-slate-900">合計金額</span>
              <span className="text-lg font-semibold text-slate-900">{yen(inv.grandTotal)}円</span>
            </div>
          </div>
        </CardSection>
      </Card>
    </div>
  );
}
