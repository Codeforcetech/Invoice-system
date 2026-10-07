import { SalesOverview } from "./sales-overview";
import type { SalesFilters, SalesSummary } from "@/lib/dashboard/sales";
import Link from "next/link";
import { AppButtonLink } from "@/components/ui/app-button";
import { AppIcon } from "@/components/ui/app-icon";
import { PageShell } from "@/components/ui/page-shell";
import { SectionHeader } from "@/components/ui/section-header";
import { InvoiceStatusBadge } from "@/app/(app)/invoices/_components/invoice-status-badge";
import type { InvoiceStatus } from "@prisma/client";
export type DashboardData = {
  name: string;
  costs: {
    month: string;
    total: number;
    paid: number;
    overdueCount: number;
    dueSoonCount: number;
  };
  filters: SalesFilters;
  sales: SalesSummary;
  companies: { id: string; name: string }[];
  confirmedCount: number;
  companyCount: number;
  invoiceCount: number;
  draftCount: number;
  setup: { company: boolean; bank: boolean; email: boolean };
  recent: {
    id: string;
    invoiceNumber: string;
    subject: string;
    grandTotal: number;
    status: InvoiceStatus;
    company: { name: string };
  }[];
};
export function DashboardView({
  data,
  reports,
  canEdit = true,
  finance = true,
}: {
  data: DashboardData;
  reports?: import("react").ReactNode;
  canEdit?: boolean;
  /** 売上・支払い・経営レポートを出すか（管理者だけ） */
  finance?: boolean;
}) {
  const money = (n: number) => new Intl.NumberFormat("ja-JP").format(n);
  const setup = [
    {
      label: "自社情報を登録",
      hint: "請求書に載せる会社名・住所",
      done: data.setup.company,
      href: "/settings#issuer",
    },
    {
      label: "振込先を設定",
      hint: "銀行・口座情報を入力",
      done: data.setup.bank,
      href: "/settings#bank",
    },
    {
      label: "送信元メールを登録",
      hint: "Gmailの下書き作成に使用",
      done: data.setup.email,
      href: "/settings#issuer",
    },
    {
      label: "取引先を追加",
      hint: "宛先と請求条件を登録",
      done: data.companyCount > 0,
      href: "/companies/new",
    },
  ];
  const complete = setup.filter((s) => s.done).length;
  return (
    <PageShell maxWidth="full">
      <SectionHeader
        variant="page"
        title="ダッシュボード"
        description={`${data.name}さん、こんにちは。今日の請求業務をここから。`}
        action={
          canEdit ? (
            <AppButtonLink href="/invoices/new">
              <AppIcon name="plus" />
              請求書を作成
            </AppButtonLink>
          ) : undefined
        }
      />
      {finance && (
        <SalesOverview
          filters={data.filters}
          sales={data.sales}
          companies={data.companies}
        />
      )}
      {finance && reports}
      {finance && (
        <section
          className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"
          aria-labelledby="dashboard-expenses"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="dashboard-expenses" className="font-semibold">
              支払いの確認{" "}
              <span className="ml-2 text-xs font-normal text-slate-500">
                {data.costs.month}
              </span>
            </h2>
            <Link href="/expenses" className="py-2 text-sm text-sky-700">
              支払管理を開く →
            </Link>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 xl:grid-cols-4">
            <div>
              <p className="text-xs text-slate-500">今月のコスト・税込</p>
              <p className="mt-2 text-xl font-semibold">
                ¥{money(data.costs.total)}
              </p>
              <p className="mt-2 text-xs text-slate-500">費用の対象月で集計</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">今月の支払実績</p>
              <p className="mt-2 text-xl font-semibold">
                ¥{money(data.costs.paid)}
              </p>
              <p className="mt-2 text-xs text-slate-500">実際の支払日で集計</p>
            </div>
            <Link
              href="/expenses?status=OVERDUE"
              className="rounded-xl bg-rose-50 p-3 text-rose-900"
            >
              <p className="text-xs">期限超過・全期間</p>
              <p className="mt-2 font-semibold">
                {data.costs.overdueCount}件を確認 →
              </p>
            </Link>
            <Link
              href="/expenses?status=SOON"
              className="rounded-xl bg-amber-50 p-3 text-amber-900"
            >
              <p className="text-xs">今日から7日以内</p>
              <p className="mt-2 font-semibold">
                {data.costs.dueSoonCount}件を確認 →
              </p>
            </Link>
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-500">
            支払いの金額は税込です。税抜請求額との差額は利益や手元資金を示すものではありません。
          </p>
        </section>
      )}
      <section
        aria-label="次にすること"
        className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5"
      >
        <h2 className="mr-2 text-sm font-semibold">次にすること</h2>
        <Link
          href="/invoices?status=DRAFT"
          className="rounded-lg bg-slate-100 px-4 py-3 text-sm hover:bg-slate-200"
        >
          下書きを再開 <strong className="ml-2">{data.draftCount}件 →</strong>
        </Link>
        <Link
          href="/invoices?status=CONFIRMED"
          className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-950 hover:bg-amber-100"
        >
          確定済み・未発行{" "}
          <strong className="ml-2">{data.confirmedCount}件 →</strong>
        </Link>
        <Link
          href="/invoices"
          className="ml-auto px-2 py-3 text-sm text-sky-700"
        >
          すべての請求書 {data.invoiceCount}件 →
        </Link>
      </section>
      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_310px]">
        <section className="min-w-0 rounded-2xl border border-slate-200/80 bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-5 sm:p-6">
            <div>
              <h2 className="font-semibold text-slate-900">
                最近更新した請求書
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                続きの作成や内容の確認に。
              </p>
            </div>
            <Link
              href="/invoices"
              className="shrink-0 text-xs font-semibold text-sky-700"
            >
              すべて見る →
            </Link>
          </div>
          {data.recent.length ? (
            <ul className="divide-y divide-slate-100">
              {data.recent.map((inv) => (
                <li key={inv.id}>
                  <Link
                    href={`/invoices/${inv.id}${inv.status === "DRAFT" ? "/edit" : ""}`}
                    className="flex flex-wrap items-center gap-3 p-5 transition-colors hover:bg-slate-50 sm:px-6"
                  >
                    <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-500 sm:flex">
                      <AppIcon name="invoice" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800">
                        {inv.company.name}
                      </p>
                      <p className="mt-1 truncate text-xs text-slate-500">
                        {inv.subject}
                      </p>
                      <p className="mt-1 text-[10px] text-slate-400">
                        {inv.invoiceNumber}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="mb-2 text-sm font-semibold tabular-nums">
                        ¥{money(inv.grandTotal)}
                      </p>
                      <InvoiceStatusBadge status={inv.status} />
                    </div>
                    <AppIcon
                      name="arrow"
                      className="ml-1 hidden h-4 w-4 text-slate-400 sm:block"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-6 py-16 text-center">
              <AppIcon
                name="invoice"
                className="mx-auto mb-4 h-10 w-10 text-slate-300"
              />
              <h3 className="font-semibold">最初の請求書を作りましょう</h3>
              <p className="mb-5 mt-2 text-sm text-slate-500">
                入力しながら完成形を確認できます。
              </p>
              <AppButtonLink href="/invoices/new">請求書を作成</AppButtonLink>
            </div>
          )}
        </section>
        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200/80 bg-white p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                {complete === 4 ? "登録情報の確認" : "はじめの準備"}
              </h2>
              <span className="text-xs text-slate-500">{complete} / 4</span>
            </div>
            <div
              className="my-5 h-1.5 overflow-hidden rounded-full bg-slate-100"
              role="progressbar"
              aria-label="初期設定"
              aria-valuenow={complete}
              aria-valuemin={0}
              aria-valuemax={4}
            >
              <div
                className="h-full rounded-full bg-brand-blue"
                style={{ width: `${(complete / 4) * 100}%` }}
              />
            </div>
            <ul className="space-y-4">
              {setup.map((s) => (
                <li key={s.label}>
                  <Link href={s.href} className="group flex items-start gap-3">
                    <span
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${s.done ? "bg-sky-100 text-sky-700" : "border border-slate-300 text-slate-400"}`}
                    >
                      {s.done && <AppIcon name="check" className="h-3 w-3" />}
                    </span>
                    <span>
                      <span className="block text-xs font-medium group-hover:text-sky-700">
                        {s.label}
                      </span>
                      <span className="mt-1 block text-[11px] text-slate-500">
                        {s.hint}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-2xl border border-sky-100 bg-sky-50 p-6">
            <AppIcon name="items" className="mb-3 text-sky-700" />
            <h2 className="text-sm font-semibold text-slate-800">
              毎回の入力を、もっと少なく。
            </h2>
            <p className="mt-2 text-xs leading-6 text-slate-600">
              よく使う品目やメール文面をテンプレートに登録すると、次の請求書作成がスムーズになります。
            </p>
            <Link
              href="/item-templates"
              className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-sky-700"
            >
              テンプレートを管理
              <AppIcon name="arrow" className="h-4 w-4" />
            </Link>
          </section>
        </div>
      </div>
      <p className="text-[11px] text-slate-500">
        発行済みは請求書の作成状態です。メールの送信状況・入金状況は含みません。
      </p>
    </PageShell>
  );
}
