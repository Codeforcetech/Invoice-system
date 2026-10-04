import { notFound } from "next/navigation";
import { getExpense } from "@/actions/expense-actions";
import { prisma } from "@/lib/db/prisma";
import { companiesWithStores } from "@/lib/stores";
import { requireWorkspacePage } from "@/lib/auth/require-workspace";
import { ExpenseForm } from "@/components/expenses/expense-form";
export default async function EditExpensePage({
  params,
}: {
  params: Promise<{ expenseId: string }>;
}) {
  const ws = await requireWorkspacePage("EDITOR");
  const { expenseId } = await params;
  const [expense, companies] = await Promise.all([
    getExpense(expenseId),
    companiesWithStores(prisma, ws.ownerId),
  ]);
  if (!expense) notFound();
  return <ExpenseForm expense={expense} companies={companies} />;
}
