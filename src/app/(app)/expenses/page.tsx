import { listExpenses } from "@/actions/expense-actions";
import { ExpensesView } from "@/components/expenses/expenses-view";
import { requireWorkspacePage } from "@/lib/auth/require-workspace";
import { hasRole } from "@/lib/workspace/access";
export default async function ExpensesPage() {
  const ws = await requireWorkspacePage("VIEWER");
  return (
    <ExpensesView rows={await listExpenses()} canEdit={hasRole(ws.role, "EDITOR")} />
  );
}
