import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireSubmitterPage } from "@/lib/auth/require-workspace";
import { yen } from "@/lib/accounting/model";
import { PageShell } from "@/components/ui/page-shell";
import { SectionHeader } from "@/components/ui/section-header";
import { AppButtonLink } from "@/components/ui/app-button";
import { Card, CardSection } from "@/components/ui/card";
import { StatusBadge } from "@/components/submissions/submission-detail";

export default async function SubmitHome() {
  const ws = await requireSubmitterPage();
  const [profile, list] = await Promise.all([
    prisma.submitterProfile.findUnique({
      where: { userId: ws.userId },
      select: { legalName: true },
    }),
    prisma.submission.findMany({
      where: { ownerId: ws.ownerId, submitterId: ws.userId },
      orderBy: [{ updatedAt: "desc" }],
      take: 100,
      select: {
        id: true,
        month: true,
        title: true,
        status: true,
        total: true,
        rejectReason: true,
        updatedAt: true,
      },
    }),
  ]);
  const rejected = list.filter((s) => s.status === "REJECTED");
  return (
    <PageShell maxWidth="4xl">
      <SectionHeader
        variant="page"
        title="書類を提出する"
        description="報酬の請求書をつくり、領収書を添えて提出します。承認される前なら、取り下げて直せます。"
        action={
          <AppButtonLink href="/submit/new">
            ＋ 請求書をつくって提出する
          </AppButtonLink>
        }
      />
      {!profile?.legalName && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">
            最初に、自分の情報を入力してください。
          </p>
          <p className="mt-1">
            請求書の差出人（お名前・住所・振込先など）になります。
          </p>
          <div className="mt-3">
            <AppButtonLink href="/submit/profile">
              自分の情報を入力する
            </AppButtonLink>
          </div>
        </div>
      )}
      {rejected.length > 0 && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"
        >
          <p className="font-semibold">
            差し戻された提出が{rejected.length}件あります。
          </p>
          <ul className="mt-1 list-disc pl-5">
            {rejected.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/submit/${s.id}`}
                  className="font-medium underline"
                >
                  {s.month.replace("-", "年")}月分　{s.title}
                </Link>
                {s.rejectReason && <span>：{s.rejectReason}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <section className="space-y-3">
        <h2 className="font-semibold">提出の状況</h2>
        {list.map((s) => (
          <Card key={s.id}>
            <CardSection>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-slate-500">
                    {s.month.replace("-", "年")}月分
                  </p>
                  <Link
                    href={`/submit/${s.id}`}
                    className="font-semibold text-sky-700"
                  >
                    {s.title}
                  </Link>
                </div>
                <div className="flex items-center gap-4">
                  <span className="tabular-nums">¥{yen(s.total)}</span>
                  <StatusBadge status={s.status} />
                </div>
              </div>
            </CardSection>
          </Card>
        ))}
        {!list.length && (
          <p className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
            まだ提出はありません。「請求書をつくって提出する」から始めます。
          </p>
        )}
      </section>
    </PageShell>
  );
}
