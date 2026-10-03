import { randomUUID } from "node:crypto";
import { requireUser } from "@/lib/auth/require-user";
import { prisma } from "@/lib/db/prisma";
import { dateText } from "@/lib/accounting/model";
import { japanToday } from "@/lib/expenses/model";
import {
  AssetForm,
  PrepareAssetAccounts,
} from "@/components/accounting/asset-form";
import { AccountingSetup } from "@/components/accounting/setup";
import { PageShell } from "@/components/ui/page-shell";
import { SectionHeader } from "@/components/ui/section-header";
import { AppButtonLink } from "@/components/ui/app-button";
export default async function NewAssetPage() {
  const user = await requireUser();
  const [setting, accounts] = await Promise.all([
    prisma.accountingSetting.findUnique({ where: { userId: user.id } }),
    prisma.account.findMany({
      where: { userId: user.id, active: true },
      orderBy: { code: "asc" },
    }),
  ]);
  const expense = accounts.find(
    (a) => a.code === "DEP" && a.kind === "EXPENSE",
  );
  const today = japanToday();
  return (
    <PageShell>
      <SectionHeader
        variant="page"
        title="固定資産を登録"
        description="情報を入力すると、初年度の償却費をその場で確認できます。"
        action={
          <AppButtonLink href="/accounting/assets" variant="secondary">
            台帳へ戻る
          </AppButtonLink>
        }
      />
      {!setting ? (
        <AccountingSetup />
      ) : !expense ? (
        <PrepareAssetAccounts />
      ) : (
        <AssetForm
          today={today}
          startDate={dateText(setting.startDate)}
          locked={false}
          accounts={accounts}
          initial={{
            id: randomUUID(),
            name: "",
            acquiredDate: today,
            serviceDate: today,
            cost: 0,
            method: "STRAIGHT",
            usefulLife: 4,
            fiscalStartMonth: 1,
            assetAccountId:
              accounts.find((a) => a.code === "150" && a.kind === "ASSET")
                ?.id ?? "",
            expenseAccountId: expense.id,
            note: "",
          }}
        />
      )}
    </PageShell>
  );
}
