import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireWorkspacePage } from "@/lib/auth/require-workspace";
import { dateText } from "@/lib/accounting/model";
import { suggestions } from "@/lib/accounting/statements";
import { PageShell } from "@/components/ui/page-shell";
import { SectionHeader } from "@/components/ui/section-header";
import { AppButtonLink } from "@/components/ui/app-button";
import { StatementWorkspace } from "@/components/accounting/statements";
export default async function StatementsPage({
  searchParams,
}: {
  searchParams: Promise<{
    feed?: string;
    status?: string;
    page?: string;
    tab?: string;
  }>;
}) {
  const ws = await requireWorkspacePage("VIEWER");
  if (
    !(await prisma.accountingSetting.findUnique({ where: { userId: ws.ownerId } }))
  )
    redirect("/accounting");
  const sp = await searchParams;
  const [feeds, accounts] = await Promise.all([
    prisma.statementFeed.findMany({
      where: { userId: ws.ownerId },
      orderBy: { createdAt: "asc" },
    }),
    prisma.account.findMany({
      where: { userId: ws.ownerId, active: true },
      orderBy: { code: "asc" },
    }),
  ]);
  const feed = feeds.find((f) => f.id === sp.feed) ?? feeds[0];
  const status = ["PENDING", "POSTED", "LINKED", "IGNORED", "ALL"].includes(
    sp.status ?? "",
  )
    ? sp.status!
    : "PENDING";
  const page = /^\d{1,5}$/.test(sp.page ?? "")
    ? Math.max(1, Number(sp.page))
    : 1;
  const [rows, rules, counts, suggest] = feed
    ? await Promise.all([
        prisma.statementRow.findMany({
          where: {
            userId: ws.ownerId,
            feedId: feed.id,
            ...(status === "ALL" ? {} : { status }),
          },
          orderBy: [{ date: "desc" }, { createdAt: "desc" }, { id: "asc" }],
          take: 201,
          skip: (page - 1) * 200,
        }),
        prisma.statementRule.findMany({
          where: { userId: ws.ownerId, feedId: feed.id },
          include: { counterAccount: true },
          orderBy: { updatedAt: "desc" },
        }),
        prisma.statementRow.groupBy({
          by: ["status"],
          where: { userId: ws.ownerId, feedId: feed.id },
          _count: true,
        }),
        suggestions(prisma, ws.ownerId, feed),
      ])
    : [[], [], [], null];
  const linkedIds = rows
    .filter((r) => r.status === "LINKED")
    .map((r) => r.entryId!)
    .filter(Boolean);
  const reversed = linkedIds.length
    ? await prisma.journalEntry.findMany({
        where: { userId: ws.ownerId, reversalOf: { in: linkedIds } },
        select: { reversalOf: true },
      })
    : [];
  return (
    <PageShell>
      <SectionHeader
        variant="page"
        title="明細取込・自動仕訳"
        description="銀行・カードのCSVを取り込み、内容を確認して帳簿に登録します。"
        action={
          <AppButtonLink href="/accounting" variant="secondary">
            帳簿へ戻る
          </AppButtonLink>
        }
      />
      <StatementWorkspace
        key={`${feed?.id ?? "new"}:${status}:${page}`}
        feeds={feeds.map((f) => ({
          id: f.id,
          name: f.name,
          kind: f.kind,
          accountId: f.accountId,
        }))}
        accounts={accounts.map((a) => ({
          id: a.id,
          code: a.code,
          name: a.name,
          kind: a.kind,
        }))}
        feedId={feed?.id ?? ""}
        status={status}
        counts={Object.fromEntries(counts.map((c) => [c.status, c._count]))}
        limited={rows.length > 200}
        page={page}
        initialTab={sp.tab === "import" ? "import" : "rows"}
        rows={rows.slice(0, 200).map((r) => ({
          id: r.id,
          date: dateText(r.date),
          description: r.description,
          amount: r.amount,
          status: r.status,
          entryId: r.entryId,
          decision: r.decision,
          fileName: r.fileName,
          version: r.updatedAt.toISOString(),
          suggestion: suggest?.(r.description, r.amount) ?? null,
          invalidLink: reversed.some((e) => e.reversalOf === r.entryId),
        }))}
        rules={rules.map((r) => ({
          id: r.id,
          description: r.descriptionKey,
          direction: r.direction,
          account: r.counterAccount.name,
          active: r.active,
          automatic: r.automatic,
          version: r.updatedAt.toISOString(),
        }))}
      />
    </PageShell>
  );
}
