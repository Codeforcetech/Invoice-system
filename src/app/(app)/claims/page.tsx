import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { visibleClaimWhere } from "@/lib/claims/access";
import { claimStatus } from "@/lib/claims/model";
import { dateText, yen } from "@/lib/accounting/model";
import { PageShell } from "@/components/ui/page-shell";
import { SectionHeader } from "@/components/ui/section-header";
import { Card, CardSection } from "@/components/ui/card";
import { AppButton, AppButtonLink } from "@/components/ui/app-button";
import { selectClass } from "@/lib/ui/form-classes";
export default async function ClaimsPage({
  searchParams,
}: {
  searchParams: Promise<{ owner?: string; status?: string; page?: string }>;
}) {
  const u = await requireUser(),
    sp = await searchParams;
  const spaces = await prisma.claimWorkspace.findMany({
    where: {
      OR: [
        { ownerId: u.id },
        { members: { some: { userId: u.id, active: true } } },
        { claims: { some: { applicantId: u.id } } },
      ],
    },
    include: { members: { where: { userId: u.id } } },
    orderBy: { name: "asc" },
  });
  const space =
      spaces.find((s) => s.ownerId === sp.owner) ??
      spaces.find((s) => s.ownerId === u.id) ??
      spaces[0],
    canSubmit =
      !!space &&
      (space.ownerId === u.id || space.members.some((m) => m.active));
  const status =
      sp.status && Object.keys(claimStatus).includes(sp.status)
        ? sp.status
        : "ALL",
    page = /^\d{1,5}$/.test(sp.page ?? "") ? Math.max(1, Number(sp.page)) : 1;
  const scope = {
    AND: [visibleClaimWhere(u.id), { ownerId: space?.ownerId ?? "__none__" }],
  };
  const [claims, counts] = await Promise.all([
    prisma.expenseClaim.findMany({
      where: { ...scope, ...(status === "ALL" ? {} : { status }) },
      include: { applicant: { select: { name: true } } },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take: 51,
      skip: (page - 1) * 50,
    }),
    prisma.expenseClaim.groupBy({ by: ["status"], where: scope, _count: true }),
  ]);
  return (
    <PageShell>
      <SectionHeader
        variant="page"
        title="経費精算"
        description="レシートを添付して申請。承認から精算の記録まで、一つの場所で確認できます。"
        action={
          <div className="flex flex-wrap gap-2">
            <AppButtonLink href="/claims/team" variant="secondary">
              メンバー設定
            </AppButtonLink>
            {canSubmit && (
              <AppButtonLink href={`/claims/new?owner=${space.ownerId}`}>
                ＋ 経費を申請
              </AppButtonLink>
            )}
          </div>
        }
      />
      {!space ? (
        <Card>
          <CardSection>
            <h2 className="text-lg font-semibold">精算先を準備しましょう</h2>
            <p className="my-3 text-sm text-slate-600">
              管理者はメンバー設定から精算先と承認者を登録してください。従業員の方は管理者にメンバー登録を依頼してください。
            </p>
            <AppButtonLink href="/claims/team">精算先を設定</AppButtonLink>
          </CardSection>
        </Card>
      ) : (
        <>
          <form className="flex flex-wrap items-end gap-3">
            <label className="min-w-64 text-sm">
              精算先
              <select
                className={`mt-1 ${selectClass}`}
                name="owner"
                defaultValue={space.ownerId}
              >
                {spaces.map((s) => (
                  <option key={s.ownerId} value={s.ownerId}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <AppButton type="submit" variant="secondary">
              表示する
            </AppButton>
          </form>
          <div className="flex flex-wrap gap-2">
            {["ALL", ...Object.keys(claimStatus)].map((s) => (
              <AppButtonLink
                key={s}
                variant={status === s ? "primary" : "secondary"}
                href={`/claims?owner=${space.ownerId}&status=${s}`}
              >
                {s === "ALL" ? "すべて" : claimStatus[s]}{" "}
                {s === "ALL"
                  ? counts.reduce((n, c) => n + c._count, 0)
                  : (counts.find((c) => c.status === s)?._count ?? 0)}
              </AppButtonLink>
            ))}
          </div>
          <p className="text-sm text-slate-500">
            承認で費用と未払金を記帳します。実際の振込後、管理者が精算を記録します。銀行送金は行いません。
          </p>
          <div className="space-y-3">
            {!claims.length && (
              <Card>
                <CardSection>
                  <p className="text-sm text-slate-500">
                    この条件の申請はありません。
                  </p>
                </CardSection>
              </Card>
            )}
            {claims.slice(0, 50).map((c) => (
              <Card key={c.id}>
                <CardSection>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-slate-500">
                        {dateText(c.date)} ／ {c.applicant.name} ／{" "}
                        {claimStatus[c.status]}
                      </p>
                      <h2 className="mt-2 break-words font-semibold">
                        {c.title}
                      </h2>
                      <p className="mt-1 text-sm text-slate-500">
                        {c.merchant} ／ ¥{yen(c.amount)}
                      </p>
                    </div>
                    <AppButtonLink href={`/claims/${c.id}`} variant="secondary">
                      内容を確認
                    </AppButtonLink>
                  </div>
                </CardSection>
              </Card>
            ))}
          </div>
          <div className="flex items-center gap-3 text-sm">
            {page}ページ目
            {page > 1 && (
              <AppButtonLink
                href={`/claims?owner=${space.ownerId}&status=${status}&page=${page - 1}`}
                variant="secondary"
              >
                前へ
              </AppButtonLink>
            )}
            {claims.length > 50 && (
              <AppButtonLink
                href={`/claims?owner=${space.ownerId}&status=${status}&page=${page + 1}`}
                variant="secondary"
              >
                次へ
              </AppButtonLink>
            )}
          </div>
        </>
      )}
    </PageShell>
  );
}
