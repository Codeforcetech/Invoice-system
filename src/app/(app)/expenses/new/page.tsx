import { ExpenseForm } from "@/components/expenses/expense-form";
import { prisma } from "@/lib/db/prisma";
import { companiesWithStores } from "@/lib/stores";
import { requireWorkspacePage } from "@/lib/auth/require-workspace";
export default async function NewExpensePage() {
  const ws = await requireWorkspacePage("EDITOR");
  return <ExpenseForm companies={await companiesWithStores(prisma, ws.ownerId)} />;
}
