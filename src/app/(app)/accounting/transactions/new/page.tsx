import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireWorkspacePage } from "@/lib/auth/require-workspace";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { SectionHeader } from "@/components/ui/section-header";
import { EasyEntryForm } from "@/components/accounting/easy-entry-form";
import { loadMoneyOptions } from "@/lib/accounting/easy";
export default async function NewTransaction() {
  const ws = await requireWorkspacePage("EDITOR");
  const setting = await prisma.accountingSetting.findUnique({
    where: { userId: ws.ownerId },
  });
  if (!setting) redirect("/accounting");
  const { options } = await loadMoneyOptions(prisma, ws.ownerId);
  return (
    <PageShell>
      <SectionHeader
        variant="page"
        title="お金の出入りを記録する"
        description="上から順に答えていくだけで記録できます。むずかしい用語は使いません。"
      />
      <EasyEntryForm
        out={options.out}
        income={options.income}
        money={options.money}
      />
      <p className="text-xs text-slate-500">
        経理の方は、
        <Link href="/accounting/transactions/advanced" className="text-sky-700">
          仕訳（借方・貸方）で入力する画面
        </Link>
        も使えます。
      </p>
    </PageShell>
  );
}
