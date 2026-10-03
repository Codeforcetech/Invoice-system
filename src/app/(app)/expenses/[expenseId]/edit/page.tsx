import { notFound } from "next/navigation";
import { getExpense } from "@/actions/expense-actions";
import { ExpenseForm } from "@/components/expenses/expense-form";
export default async function EditExpensePage({
  params,
}: {
  params: Promise<{ expenseId: string }>;
}) {
  const { expenseId } = await params;
  const expense = await getExpense(expenseId);
  if (!expense) notFound();
  return <ExpenseForm expense={expense} />;
}
