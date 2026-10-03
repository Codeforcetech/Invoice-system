import { listExpenses } from "@/actions/expense-actions";
import { ExpensesView } from "@/components/expenses/expenses-view";
export default async function ExpensesPage() {
  return <ExpensesView rows={await listExpenses()} />;
}
