import { notFound } from "next/navigation";
import { requireWorkspacePage } from "@/lib/auth/require-workspace";
import { prisma } from "@/lib/db/prisma";
import { dateText, yen } from "@/lib/accounting/model";
import { japanToday } from "@/lib/expenses/model";
import {
  depreciationSchedule,
  fiscalMonths,
  fiscalYear,
  methods,
  type AssetInput,
} from "@/lib/assets/model";
import { AssetForm } from "@/components/accounting/asset-form";
import {
  AssetPosting,
  AssetHistoryControls,
} from "@/components/accounting/asset-posting";
import { PageShell } from "@/components/ui/page-shell";
import { SectionHeader } from "@/components/ui/section-header";
import { AppButton, AppButtonLink } from "@/components/ui/app-button";
import { Card, CardSection } from "@/components/ui/card";
import { selectClass } from "@/lib/ui/form-classes";
export default async function AssetDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ assetId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ws = await requireWorkspacePage("VIEWER"),
    { assetId } = await params,
    sp = await searchParams;
  const asset = await prisma.fixedAsset.findFirst({
    where: { id: assetId, userId: ws.ownerId },
    include: {
      assetAccount: true,
      expenseAccount: true,
      postings: {
        orderBy: [{ month: "desc" }, { createdAt: "desc" }],
        include: { entry: { select: { date: true } } },
      },
    },
  });
  if (!asset) notFound();
  const today = japanToday(),
    firstYear = fiscalYear(
      dateText(asset.serviceDate).slice(0, 7),
      asset.fiscalStartMonth,
    );
  const currentYear = fiscalYear(today.slice(0, 7), asset.fiscalStartMonth);
  const lastYear = Math.min(
    2098,
    Math.max(currentYear + 1, firstYear + asset.usefulLife + 1),
  );
  const year =
    typeof sp.year === "string" && /^20\d{2}$/.test(sp.year)
      ? Math.max(firstYear, Math.min(lastYear, Number(sp.year)))
      : currentYear;
  const months = fiscalMonths(year, asset.fiscalStartMonth);
  const initial: AssetInput = {
    ...asset,
    acquiredDate: dateText(asset.acquiredDate),
    serviceDate: dateText(asset.serviceDate),
    method: asset.method as AssetInput["method"],
    version: asset.updatedAt.toISOString(),
  };
  if (sp.edit === "1") {
    const [accounts, setting] = await Promise.all([
      prisma.account.findMany({
        where: {
          userId: ws.ownerId,
          OR: [
            { active: true },
            { id: { in: [asset.assetAccountId, asset.expenseAccountId] } },
          ],
        },
        orderBy: { code: "asc" },
      }),
      prisma.accountingSetting.findUniqueOrThrow({
        where: { userId: ws.ownerId },
      }),
    ]);
    return (
      <PageShell>
        <SectionHeader
          variant="page"
          title="固定資産を編集"
          description={asset.name}
        />
        <AssetForm
          key={initial.version}
          initial={initial}
          accounts={accounts}
          locked={asset.postings.length > 0}
          today={today}
          startDate={dateText(setting.startDate)}
        />
      </PageShell>
    );
  }
  const schedule = depreciationSchedule(initial, months[11]);
  const active = asset.postings.filter((p) => p.active),
    posted = new Set(active.map((p) => p.month));
  const rows = schedule
    .filter((r) => months.includes(r.month))
    .map((r) => ({ ...r, posted: posted.has(r.month) }));
  const blocked = schedule.some(
    (r) => r.month < months[0] && r.amount > 0 && !posted.has(r.month),
  );
  const total = active.reduce((s, p) => s + p.amount, 0),
    annual = rows.reduce((s, r) => s + r.amount, 0);
  const defaultMonth =
    rows.find((r) => !r.posted && r.amount > 0)?.month ??
    rows[0]?.month ??
    months[0];
  const groups = Array.from(new Set(asset.postings.map((p) => p.entryId))).map(
    (entryId) => {
      const p = asset.postings.filter((p) => p.entryId === entryId);
      return {
        entryId,
        date: dateText(p[0].entry.date),
        active: p[0].active,
        reason: p[0].canceledReason,
        from: p[p.length - 1].month,
        to: p[0].month,
        amount: p.reduce((s, r) => s + r.amount, 0),
      };
    },
  );
  return (
    <PageShell>
      <SectionHeader
        variant="page"
        title={asset.name}
        description={`${methods[initial.method]} ／ ${initial.method === "NONE" ? "償却対象外" : `耐用年数 ${asset.usefulLife}年`} ／ ${asset.archived ? "保管済み" : "管理中"}`}
        action={
          <div className="flex gap-2">
            <AppButtonLink variant="secondary" href="/accounting/assets">
              台帳へ戻る
            </AppButtonLink>
            <AppButtonLink
              href={`/accounting/assets/${asset.id}?edit=1`}
              variant="secondary"
            >
              編集する
            </AppButtonLink>
          </div>
        }
      />
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["取得価額（税込）", asset.cost],
          ["記帳済みの償却累計", total],
          ["記帳後の帳簿価額", asset.cost - total],
        ].map(([label, amount]) => (
          <Card key={String(label)}>
            <CardSection>
              <p className="text-sm text-slate-500">{label}</p>
              <p className="mt-3 text-2xl font-semibold tabular-nums">
                ¥{yen(Number(amount))}
              </p>
            </CardSection>
          </Card>
        ))}
      </div>
      <Card>
        <CardSection>
          <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-slate-500">取得日</dt>
              <dd className="mt-1">{initial.acquiredDate}</dd>
            </div>
            <div>
              <dt className="text-slate-500">使用開始日</dt>
              <dd className="mt-1">{initial.serviceDate}</dd>
            </div>
            <div>
              <dt className="text-slate-500">資産科目</dt>
              <dd className="mt-1">{asset.assetAccount.name}</dd>
            </div>
            <div>
              <dt className="text-slate-500">事業年度</dt>
              <dd className="mt-1">{asset.fiscalStartMonth}月開始・12か月</dd>
            </div>
          </dl>
          {asset.note && (
            <p className="mt-5 whitespace-pre-wrap text-sm text-slate-600">
              {asset.note}
            </p>
          )}
          <p className="mt-4 text-xs text-slate-500">
            この台帳以外で記帳した償却費は累計に含みません。取得時の仕訳は別途記帳してください。
          </p>
          <AppButtonLink
            href="/accounting/transactions/new"
            variant="ghost"
            className="mt-2"
          >
            取得時の仕訳を入力 →
          </AppButtonLink>
        </CardSection>
      </Card>
      {initial.method !== "NONE" && (
        <>
          <Card>
            <CardSection>
              <form className="flex flex-wrap items-end gap-3">
                <label className="text-sm">
                  償却予定の年度
                  <select
                    name="year"
                    defaultValue={year}
                    className={`mt-1 ${selectClass}`}
                  >
                    {Array.from(
                      {
                        length:
                          Math.min(
                            2098,
                            Math.max(
                              currentYear + 1,
                              firstYear + asset.usefulLife + 1,
                            ),
                          ) -
                          firstYear +
                          1,
                      },
                      (_, i) => firstYear + i,
                    ).map((y) => (
                      <option key={y} value={y}>
                        {y}年度（{fiscalMonths(y, asset.fiscalStartMonth)[0]}〜
                        {fiscalMonths(y, asset.fiscalStartMonth)[11]}）
                      </option>
                    ))}
                  </select>
                </label>
                <AppButton type="submit">表示する</AppButton>
              </form>
              <div className="mt-5 flex flex-wrap justify-between gap-3">
                <h2 className="font-semibold">月別の償却予定</h2>
                <p className="text-sm">
                  年度合計 <strong>¥{yen(annual)}</strong>
                </p>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                予定帳簿価額は、前の期間も含めてすべて償却した場合の計算値です。1円未満を切り捨て、月ごとの配分差を調整します。
              </p>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[500px] text-left text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      {["対象月", "償却費", "予定帳簿価額", "状態"].map((t) => (
                        <th className="p-3" key={t}>
                          {t}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.month} className="border-b border-slate-100">
                        <td className="p-3">
                          {r.month}
                          {r.revised && (
                            <span className="ml-2 text-xs text-slate-500">
                              改定償却
                            </span>
                          )}
                        </td>
                        <td className="p-3 tabular-nums">¥{yen(r.amount)}</td>
                        <td className="p-3 tabular-nums">¥{yen(r.closing)}</td>
                        <td className="p-3">
                          <span
                            className={`rounded-full px-2 py-1 text-xs ${r.posted ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}
                          >
                            {r.posted
                              ? "登録済み"
                              : r.amount === 0
                                ? "償却なし"
                                : "未登録"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardSection>
          </Card>
          {!asset.archived && rows.length > 0 && (
            <Card>
              <CardSection>
                <AssetPosting
                  key={`${initial.version}:${year}`}
                  id={asset.id}
                  version={initial.version!}
                  year={year}
                  rows={rows}
                  yearEnd={months[11]}
                  today={today}
                  defaultMonth={defaultMonth}
                  expenseName={asset.expenseAccount.name}
                  assetName={asset.assetAccount.name}
                  blocked={blocked}
                />
              </CardSection>
            </Card>
          )}
        </>
      )}
      <Card>
        <CardSection>
          <h2 className="text-lg font-semibold">仕訳の履歴</h2>
          {!groups.length ? (
            <p className="mt-3 text-sm text-slate-500">
              まだ償却費を記帳していません。
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {groups.map((g) => (
                <li
                  key={g.entryId}
                  className="flex flex-wrap items-center justify-between gap-3 py-4"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {g.from}〜{g.to} ／ ¥{yen(g.amount)} ／{" "}
                      {g.active ? "登録済み" : "取消済み"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      仕訳日 {g.date}
                      {g.reason && ` ／ 取消理由：${g.reason}`}
                    </p>
                  </div>
                  <AppButtonLink
                    variant="ghost"
                    href={`/accounting?from=${g.date}&to=${g.date}&view=journal`}
                  >
                    仕訳を見る →
                  </AppButtonLink>
                </li>
              ))}
            </ul>
          )}
        </CardSection>
      </Card>
      <details className="rounded-xl border border-slate-200 bg-white p-5">
        <summary className="cursor-pointer text-sm font-semibold">
          取消・保管の操作
        </summary>
        <div className="mt-5">
          <AssetHistoryControls
            key={initial.version}
            id={asset.id}
            version={initial.version!}
            entryId={active[0]?.entryId}
            archived={asset.archived}
          />
        </div>
      </details>
    </PageShell>
  );
}
