import Link from "next/link";
import { requireWorkspacePage } from "@/lib/auth/require-workspace";
import { japanToday } from "@/lib/expenses/model";
import { filterSchema, reportViews } from "@/lib/management/model";
import { managementReport } from "@/lib/management/report";
import { PageShell } from "@/components/ui/page-shell";
import { SectionHeader } from "@/components/ui/section-header";
import { Card, CardSection } from "@/components/ui/card";
import { AppButtonLink, appButtonVariants } from "@/components/ui/app-button";
import { inputClass, selectClass } from "@/lib/ui/form-classes";
import { ReportView } from "@/components/management/report-view";
import { AnnotationForm } from "@/components/management/annotation-form";
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ws = await requireWorkspacePage("VIEWER"),
    sp = await searchParams;
  const str = (key: string) =>
    typeof sp[key] === "string" ? (sp[key] as string) : "";
  const current = japanToday().slice(0, 7);
  const parsed = filterSchema.safeParse({
    view: str("view") || "profit",
    from: str("from") || current,
    to: str("to") || current,
    department: str("department"),
    office: str("office"),
  });
  const f = parsed.success
    ? parsed.data
    : filterSchema.parse({ from: current, to: current });
  let report: Awaited<ReturnType<typeof managementReport>> | null = null,
    error = parsed.success
      ? ""
      : "指定条件が正しくありません。今月・全ての分類を表示しています。";
  try {
    report = await managementReport(ws.ownerId, f);
  } catch (e) {
    error =
      e instanceof Error && !e.message.includes("\n")
        ? e.message
        : "レポートを読み込めませんでした。時間をおいて再度お試しください。";
  }
  const page = Math.min(10000, Math.max(1, Number.parseInt(str("page")) || 1));
  const q = str("q").slice(0, 100);
  const targets =
    report?.targets.filter(
      (t) =>
        !q ||
        `${t.name} ${t.type} ${t.annotation.department} ${t.annotation.office}`
          .toLowerCase()
          .includes(q.toLowerCase()),
    ) ?? [];
  const count = Math.max(1, Math.ceil(targets.length / 50)),
    tagPage = Math.min(count, page);
  const query = new URLSearchParams({ ...f, q });
  return (
    <PageShell maxWidth="full">
      <SectionHeader
        variant="page"
        title="経営レポート"
        description="入出金の予定と、記帳した損益を確認します。"
        action={
          <AppButtonLink href="/dashboard" variant="secondary">
            ダッシュボードへ
          </AppButtonLink>
        }
      />
      <nav aria-label="経営レポートの種類" className="flex flex-wrap gap-2">
        {Object.entries(reportViews).map(([key, label]) => (
          <AppButtonLink
            key={key}
            href={`/reports?${new URLSearchParams({ ...f, view: key })}`}
            variant={f.view === key ? "selected" : "secondary"}
          >
            {label}
          </AppButtonLink>
        ))}
      </nav>
      <Card>
        <CardSection>
          <form className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="view" value={f.view} />
            <label className="text-sm">
              開始月
              <input
                type="month"
                name="from"
                required
                defaultValue={f.from}
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="text-sm">
              終了月
              <input
                type="month"
                name="to"
                required
                defaultValue={f.to}
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="text-sm">
              部門
              <select
                name="department"
                defaultValue={f.department}
                className={`mt-1 ${selectClass}`}
              >
                <option value="">全ての部門</option>
                <option value="__none__">未分類</option>
                {report?.departments.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              事業所
              <select
                name="office"
                defaultValue={f.office}
                className={`mt-1 ${selectClass}`}
              >
                <option value="">全ての事業所</option>
                <option value="__none__">未分類</option>
                {report?.offices.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>
            <button className={`rounded-xl ${appButtonVariants.primary}`}>
              表示する
            </button>
            <Link
              href={`/reports?view=${f.view}`}
              className="py-2 text-sm text-slate-500"
            >
              条件をリセット
            </Link>
          </form>
        </CardSection>
      </Card>
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800"
        >
          {error}
        </p>
      )}
      {report && !report.setting && (
        <p className="rounded-xl bg-amber-50 p-4 text-sm">
          損益・費用を表示するには、
          <Link href="/accounting" className="underline">
            会計の初期設定と取引の記帳
          </Link>
          が必要です。
        </p>
      )}
      {report && (
        <p className="text-xs leading-5 text-slate-500">
          収益ランキングは発行済み請求書の税抜額。損益・費用は仕訳の税込額です。会計開始日
          {report.startDate ? ` ${report.startDate}` : "は未設定"}
          。未連携・未記帳の取引は損益に含まれません。同じ支払いを支払管理と経費精算に二重登録しないでください。
        </p>
      )}
      {report &&
        (f.view === "tags" ? (
          <>
            <Card>
              <CardSection>
                <h2 className="font-semibold">取引に部門・事業所を付ける</h2>
                <p className="mt-2 text-sm text-slate-500">
                  取引を開いて分類を保存します。同じ請求・支払・資産に紐づく仕訳と取消仕訳にも反映されます。1取引につき部門・事業所を各1つ設定できます。変更は過去のレポートにも反映されます。
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  期間内の取引・仕訳の元データと、表示対象の未払い分を掲載。部門または事業所が未分類：
                  {report.unclassified}件
                </p>
                <form className="mt-4 flex flex-wrap gap-2">
                  {Object.entries(f).map(([key, value]) => (
                    <input key={key} type="hidden" name={key} value={value} />
                  ))}
                  <input
                    name="q"
                    aria-label="分類する取引を検索"
                    defaultValue={q}
                    placeholder="件名・部門で検索"
                    className={inputClass}
                  />
                  <button
                    className={`rounded-xl ${appButtonVariants.secondary}`}
                  >
                    検索
                  </button>
                </form>
              </CardSection>
            </Card>
            {targets.slice((tagPage - 1) * 50, tagPage * 50).map((t) => (
              <AnnotationForm
                key={`${t.key}-${t.annotation.version}`}
                target={t}
                departments={report.departments}
                offices={report.offices}
              />
            ))}
            {!targets.length && (
              <p className="p-8 text-center text-sm text-slate-500">
                対象の取引がありません。期間や検索条件を変更してください。
              </p>
            )}
            <nav
              aria-label="取引分類のページ"
              className="flex items-center gap-4 text-sm"
            >
              {tagPage > 1 && (
                <Link href={`/reports?${query}&page=${tagPage - 1}`}>
                  ← 前へ
                </Link>
              )}
              <span>
                {tagPage} / {count}ページ（{targets.length}件）
              </span>
              {tagPage < count && (
                <Link href={`/reports?${query}&page=${tagPage + 1}`}>
                  次へ →
                </Link>
              )}
            </nav>
          </>
        ) : (
          <ReportView report={report} page={page} />
        ))}
    </PageShell>
  );
}
