import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { SectionHeader } from "@/components/ui/section-header";
import { JournalForm } from "@/components/accounting/journal-form";
import { dateText } from "@/lib/accounting/model";
export default async function NewTransaction() {
  const user = await requireUser();
  const setting = await prisma.accountingSetting.findUnique({
    where: { userId: user.id },
  });
  if (!setting) redirect("/accounting");
  const accounts = await prisma.account.findMany({
    where: { userId: user.id },
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
