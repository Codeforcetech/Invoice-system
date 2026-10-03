import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { visibleClaimWhere, claimPermission } from "@/lib/claims/access";
import { claimStatus, claimActions, categoryAccount } from "@/lib/claims/model";
import { dateText, yen } from "@/lib/accounting/model";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { SectionHeader } from "@/components/ui/section-header";
import { Card, CardSection } from "@/components/ui/card";
import { AppButtonLink } from "@/components/ui/app-button";
import { ClaimDecision } from "@/components/claims/decision";
export default async function ClaimPage({
  params,
}: {
  params: Promise<{ claimId: string }>;
}) {
  const u = await requireUser(),
    { claimId } = await params;
  const c = await prisma.expenseClaim.findFirst({
    where: { id: claimId, ...visibleClaimWhere(u.id) },
    include: {
      workspace: true,
      applicant: { select: { name: true } },
      receipt: { select: { filename: true, mimeType: true } },
      events: {
        include: { actor: { select: { name: true } } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 100,
      },
    },
  });
  if (!c) notFound();
  const permission = await claimPermission(prisma, c.ownerId, u.id).catch(
      () => null,
    ),
    owner = c.ownerId === u.id,
    applicant = c.applicantId === u.id,
    canApprove = !!permission && permission.role !== "SUBMITTER" && !applicant;
  const accounts =
    owner || canApprove
      ? await prisma.account.findMany({
          where: {
            userId: c.ownerId,
            active: true,
            kind: { in: ["ASSET", "EXPENSE"] },
          },
          select: { id: true, code: true, name: true, kind: true },
          orderBy: { code: "asc" },
        })
      : [];
  return (
    <PageShell>
      <SectionHeader
        variant="page"
        title={c.title}
        description={`${c.workspace.name} ／ ${claimStatus[c.status]}`}
      />
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <div className="space-y-5">
          <Card>
            <CardSection>
              <h2 className="text-lg font-semibold">申請内容</h2>
              <p className="my-4 text-3xl font-semibold tabular-nums">
                ¥{yen(c.amount)}
              </p>
              <dl className="grid grid-cols-[100px_1fr] gap-3 text-sm">
                <dt className="text-slate-500">申請者</dt>
                <dd>{c.applicant.name}</dd>
                <dt className="text-slate-500">経費の日付</dt>
                <dd>{dateText(c.date)}</dd>
                <dt className="text-slate-500">支払先</dt>
                <dd className="break-words">{c.merchant}</dd>
                <dt className="text-slate-500">分類</dt>
                <dd>{c.category}</dd>
                <dt className="text-slate-500">目的・補足</dt>
                <dd className="whitespace-pre-wrap break-words">
                  {c.note || "—"}
                </dd>
                {c.paidDate && (
                  <>
                    <dt className="text-slate-500">精算日</dt>
                    <dd>{dateText(c.paidDate)}</dd>
                  </>
                )}
              </dl>
              {owner && c.entryId && (
                <div className="mt-4">
                  <AppButtonLink
                    href={`/accounting?view=journal&from=${dateText(c.date)}&to=${dateText(c.date)}`}
                    variant="ghost"
                  >
                    承認時の仕訳を確認
                  </AppButtonLink>
                </div>
              )}
            </CardSection>
          </Card>
          <ClaimDecision
            key={c.updatedAt.toISOString()}
            id={c.id}
            version={c.updatedAt.toISOString()}
            status={c.status}
            applicant={applicant}
            owner={owner}
            canApprove={canApprove}
            active={!!permission}
            hasReceipt={!!c.receipt}
            date={dateText(c.date)}
            suggestedCode={categoryAccount[c.category] ?? "580"}
            accounts={accounts}
          />
        </div>
        <Card>
          <CardSection>
            <h2 className="text-lg font-semibold">レシート・領収書</h2>
            {c.receipt ? (
              <div className="mt-4 space-y-3">
                {c.receipt.mimeType === "image/webp" && (
                  // Authenticated evidence must not pass through a shared image-optimization cache.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/claims/${c.id}/receipt?v=${c.updatedAt.getTime()}`}
                    alt="添付されたレシート"
                    className="max-h-[640px] w-full rounded-lg bg-slate-50 object-contain"
                  />
                )}
                <a
                  href={`/api/claims/${c.id}/receipt`}
                  target="_blank"
                  rel="noreferrer"
                  className="block break-words text-sm text-sky-700 underline"
                >
                  {c.receipt.filename} を開く
                  {c.receipt.mimeType === "application/pdf"
                    ? "（PDFダウンロード）"
                    : ""}
                </a>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">
                まだ添付されていません。
              </p>
            )}
          </CardSection>
        </Card>
      </div>
      <Card>
        <CardSection>
          <h2 className="text-lg font-semibold">申請・承認履歴</h2>
          <p className="mt-1 text-xs text-slate-500">
            新しい順に100件まで表示します。
          </p>
          <ol className="mt-4 space-y-4">
            {c.events.map((e) => (
              <li key={e.id} className="border-l-2 border-slate-200 pl-4">
                <p className="text-sm font-medium">
                  {claimActions[e.action] ?? e.action} ／ {e.actor.name}
                </p>
                <p className="text-xs text-slate-500">
                  {e.createdAt.toLocaleString("ja-JP", {
                    timeZone: "Asia/Tokyo",
                  })}{" "}
                  ／ 第{e.revision}版
                </p>
                {e.comment && (
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-600">
                    {e.comment}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </CardSection>
      </Card>
    </PageShell>
  );
}
