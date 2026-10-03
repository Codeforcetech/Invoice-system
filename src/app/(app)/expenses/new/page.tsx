import { ExpenseForm } from "@/components/expenses/expense-form";
import { requireWorkspacePage } from "@/lib/auth/require-workspace";
export default async function NewExpensePage() {
  await requireWorkspacePage("EDITOR");
  return <ExpenseForm />;
}
