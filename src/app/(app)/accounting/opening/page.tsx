import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireWorkspacePage } from "@/lib/auth/require-workspace";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { SectionHeader } from "@/components/ui/section-header";
import { OpeningForm } from "@/components/accounting/opening-form";
import { dateText } from "@/lib/accounting/model";
import { hasOpeningBalance } from "@/lib/accounting/opening";
export default async function OpeningPage() {
  const ws = await requireWorkspacePage("ADMIN");
  const setting = await prisma.accountingSetting.findUnique({
    where: { userId: ws.ownerId },
  });
  if (!setting) redirect("/accounting");
  const done = await hasOpeningBalance(prisma, ws.ownerId);
  return (
    <PageShell>
      <SectionHeader
        variant="page"
        title="いまの状況を入力する（開始残高）"
        description="会計をはじめる日に、現金や預金がいくらあったかを入力します。"
      />
      {done ? (
        <p className="rounded-xl bg-emerald-50 p-5 text-sm text-emerald-900">
          開始残高は、入力済みです。直したいときは、経理の方に相談してください。{" "}
          <Link href="/accounting" className="text-sky-700">
            お金の出入りへ
          </Link>
        </p>
      ) : (
        <OpeningForm startDate={dateText(setting.startDate)} />
      )}
    </PageShell>
  );
}
