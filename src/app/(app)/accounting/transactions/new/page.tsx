import { prisma } from "@/lib/db/prisma";
import { requireWorkspacePage } from "@/lib/auth/require-workspace";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { SectionHeader } from "@/components/ui/section-header";
import { JournalForm } from "@/components/accounting/journal-form";
import { dateText } from "@/lib/accounting/model";
export default async function NewTransaction() {
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
        title="取引を入力"
        description="借方・貸方の合計を確認して登録します。"
      />
      <JournalForm
        accounts={accounts}
        startDate={dateText(setting.startDate)}
      />
    </PageShell>
  );
}
