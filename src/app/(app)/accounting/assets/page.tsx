import Link from "next/link";
import { requireUser } from "@/lib/auth/require-user";
import { prisma } from "@/lib/db/prisma";
import { dateText, yen } from "@/lib/accounting/model";
import { methods } from "@/lib/assets/model";
import { AccountingSetup } from "@/components/accounting/setup";
import { PageShell } from "@/components/ui/page-shell";
import { SectionHeader } from "@/components/ui/section-header";
import { AppButtonLink, AppButton } from "@/components/ui/app-button";
import { Card, CardSection } from "@/components/ui/card";
import { inputClass, selectClass } from "@/lib/ui/form-classes";
export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser(),
    sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 120) : "";
  const archived = sp.status === "archived";
  const page = Math.min(100000, Math.max(1, Number(sp.page) || 1)) | 0;
  const setting = await prisma.accountingSetting.findUnique({
    where: { userId: user.id },
  });
  const where = {
    userId: user.id,
    archived,
    ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
  };
  const [count, assets] = await Promise.all([
    prisma.fixedAsset.count({ where }),
    prisma.fixedAsset.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * 50,
      take: 50,
      include: {
        assetAccount: true,
        postings: { where: { active: true }, select: { amount: true } },
      },
    }),
  ]);
  return (
    <PageShell>
      <SectionHeader
        variant="page"
        title="固定資産"
        description="パソコン・設備・車両などの資産と、毎月の償却を管理します。"
        action={
          setting ? (
            <AppButtonLink href="/accounting/assets/new">
              ＋ 資産を登録
            </AppButtonLink>
          ) : undefined
        }
      />
      <div className="flex flex-wrap gap-3">
        <AppButtonLink href="/accounting" variant="secondary">
          会計・帳簿へ
        </AppButtonLink>
        <AppButtonLink href="/guide#fixed-assets" variant="ghost">
          使い方を見る
        </AppButtonLink>
      </div>
      {!setting ? (
        <AccountingSetup />
      ) : (
        <>
          <Card>
            <CardSection>
              <form className="flex flex-wrap items-end gap-3">
                <label className="min-w-0 flex-1 text-sm">
                  資産を探す
                  <input
                    name="q"
                    defaultValue={q}
                    placeholder="資産名で検索"
                    maxLength={120}
                    className={`mt-1 ${inputClass}`}
                  />
                </label>
                <label className="text-sm">
                  表示する資産
                  <select
                    name="status"
                    defaultValue={archived ? "archived" : "active"}
                    className={`mt-1 ${selectClass}`}
                  >
                    <option value="active">管理中</option>
                    <option value="archived">保管済み</option>
                  </select>
                </label>
                <AppButton type="submit">表示する</AppButton>
              </form>
            </CardSection>
          </Card>
          <div className="flex flex-wrap justify-between gap-2">
            <h2 className="font-semibold">
              固定資産台帳{" "}
              <span className="text-sm font-normal text-slate-500">
                {count}件
              </span>
            </h2>
            <p className="text-xs text-slate-500">
              帳簿価額＝取得価額−この台帳から記帳した償却費
            </p>
          </div>
          {!assets.length ? (
            <Card>
              <CardSection className="py-12 text-center">
                <h2 className="font-semibold">
                  {q || archived
                    ? "該当する資産はありません"
                    : "はじめての資産を登録しましょう"}
                </h2>
                <p className="mx-auto mt-3 max-w-lg text-sm leading-7 text-slate-500">
                  資産の情報を登録 → 償却予定を確認 →
                  仕訳を登録。入力した内容から、月ごとの費用を自動計算します。
                </p>
                <AppButtonLink href="/accounting/assets/new" className="mt-5">
                  資産を登録
                </AppButtonLink>
              </CardSection>
            </Card>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {assets.map((a) => {
                const total = a.postings.reduce((s, p) => s + p.amount, 0);
                return (
                  <Link
                    href={`/accounting/assets/${a.id}`}
                    key={a.id}
                    className="rounded-xl focus-visible:outline-sky-500"
                  >
                    <Card className="h-full transition-colors hover:border-sky-300">
                      <CardSection>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs text-slate-500">
                              {a.assetAccount.name} ／{" "}
                              {methods[a.method as keyof typeof methods]}
                            </p>
                            <h3 className="mt-2 text-lg font-semibold">
                              {a.name}
                            </h3>
                          </div>
                          <span className="whitespace-nowrap rounded-full bg-slate-100 px-3 py-1 text-xs">
                            {a.archived
                              ? "保管済み"
                              : total === a.cost - 1 && a.method !== "NONE"
                                ? "償却完了"
                                : "管理中"}
                          </span>
                        </div>
                        <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <dt className="text-slate-500">取得価額</dt>
                            <dd className="mt-1 font-semibold tabular-nums">
                              ¥{yen(a.cost)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-slate-500">記帳後の帳簿価額</dt>
                            <dd className="mt-1 font-semibold tabular-nums">
                              ¥{yen(a.cost - total)}
                            </dd>
                          </div>
                        </dl>
                        <div className="mt-5 flex justify-between gap-3 text-xs">
                          <span className="text-slate-500">
                            取得日 {dateText(a.acquiredDate)}
                          </span>
                          <span className="font-medium text-sky-700">
                            償却予定・詳細を見る →
                          </span>
                        </div>
                      </CardSection>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
          <div className="flex items-center gap-3 text-sm">
            {page > 1 && (
              <AppButtonLink
                variant="secondary"
                href={`/accounting/assets?${new URLSearchParams({ q, status: archived ? "archived" : "active", page: String(page - 1) })}`}
              >
                前へ
              </AppButtonLink>
            )}
            <span>{page}ページ目</span>
            {page * 50 < count && (
              <AppButtonLink
                variant="secondary"
                href={`/accounting/assets?${new URLSearchParams({ q, status: archived ? "archived" : "active", page: String(page + 1) })}`}
              >
                次へ
              </AppButtonLink>
            )}
          </div>
          <p className="text-xs leading-6 text-slate-500">
            台帳への登録と、取得時の会計仕訳は別の操作です。購入を支払管理で費用として登録済みの場合は、資産科目への振替を確認してください。
          </p>
        </>
      )}
    </PageShell>
  );
}
