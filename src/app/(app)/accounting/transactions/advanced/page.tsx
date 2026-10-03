import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireWorkspacePage } from "@/lib/auth/require-workspace";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { SectionHeader } from "@/components/ui/section-header";
import { JournalForm } from "@/components/accounting/journal-form";
import { dateText } from "@/lib/accounting/model";
export default async function AdvancedTransaction() {
  const ws = await requireWorkspacePage("EDITOR");
  const setting = await prisma.accountingSetting.findUnique({
    where: { userId: ws.ownerId },
  });
  if (!setting) redirect("/accounting");
  const accounts = await prisma.account.findMany({
    where: { userId: ws.ownerId },
    orderBy: { code: "asc" },
  });
  return (
    <PageShell>
      <SectionHeader
        variant="page"
        title="仕訳で入力（経理の方向け）"
        description="借方・貸方の合計を確認して登録します。簿記になじみのない方は、かんたん入力をお使いください。"
      />
      <Link
        href="/accounting/transactions/new"
        className="text-sm text-sky-700"
      >
        ← かんたん入力にもどる
      </Link>
      <JournalForm
        accounts={accounts}
        startDate={dateText(setting.startDate)}
      />
    </PageShell>
  );
}
