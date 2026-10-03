-- Additive only: existing users, invoices and company tables are unchanged.
CREATE TABLE "Expense" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "supplier" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "amount" INTEGER NOT NULL CHECK ("amount" > 0),
  "costMonth" TEXT NOT NULL,
  "dueDate" DATE NOT NULL,
  "paidDate" DATE,
  "note" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ExpenseAttachment" (
  "expenseId" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "data" BYTEA NOT NULL,
  CONSTRAINT "ExpenseAttachment_pkey" PRIMARY KEY ("expenseId")
);
CREATE INDEX "Expense_userId_costMonth_idx" ON "Expense"("userId", "costMonth");
CREATE INDEX "Expense_userId_paidDate_dueDate_idx" ON "Expense"("userId", "paidDate", "dueDate");
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExpenseAttachment" ADD CONSTRAINT "ExpenseAttachment_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;
