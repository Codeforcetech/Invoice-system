"use server";
import { accountingLock } from "@/lib/accounting/service";
import { syncExpense } from "@/lib/accounting/sync";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireWorkspace } from "@/lib/auth/require-workspace";
import { recordAudit } from "@/lib/workspace/audit";
import { resolveExpenseLink } from "@/lib/stores";
import { PermissionError } from "@/lib/workspace/access";
import {
  expenseSchema,
  dateValue,
  readExpensePdf,
  type ExpenseRow,
} from "@/lib/expenses/model";
const select = {
  id: true,
  supplier: true,
  description: true,
  category: true,
  taxCategory: true,
  companyId: true,
  storeId: true,
  amount: true,
  costMonth: true,
  dueDate: true,
  paidDate: true,
  note: true,
  updatedAt: true,
  attachment: { select: { filename: true } },
} as const;
export async function listExpenses(): Promise<ExpenseRow[]> {
  const ws = await requireWorkspace("VIEWER");
  const rows = await prisma.expense.findMany({
    where: { userId: ws.ownerId },
    select,
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
  });
  return rows.map(({ updatedAt, attachment, dueDate, paidDate, ...r }) => ({
    ...r,
    dueDate: dateValue(dueDate),
    paidDate: paidDate ? dateValue(paidDate) : null,
    filename: attachment?.filename ?? null,
    version: updatedAt.toISOString(),
  }));
}
export async function getExpense(id: string): Promise<ExpenseRow | null> {
  const ws = await requireWorkspace("VIEWER");
  const row = await prisma.expense.findFirst({
    where: { id, userId: ws.ownerId },
    select,
  });
  if (!row) return null;
  const { updatedAt, attachment, dueDate, paidDate, ...r } = row;
  return {
    ...r,
    dueDate: dateValue(dueDate),
    paidDate: paidDate ? dateValue(paidDate) : null,
    filename: attachment?.filename ?? null,
    version: updatedAt.toISOString(),
  };
}
export async function saveExpense(
  form: FormData,
): Promise<{ ok: boolean; error?: string; id?: string }> {
  let ws: Awaited<ReturnType<typeof requireWorkspace>>;
  try {
    ws = await requireWorkspace("EDITOR");
  } catch (e) {
    if (e instanceof PermissionError) return { ok: false, error: e.message };
    throw e;
  }
  const parsed = expenseSchema.safeParse({
    ...Object.fromEntries(form),
    removeAttachment: form.get("removeAttachment") === "true",
  });
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。",
    };
  const {
    id,
    version,
    removeAttachment,
    paidDate,
    dueDate,
    companyId,
    storeId,
    ...values
  } = parsed.data;
  try {
    if (version) {
      const owned = await prisma.expense.findFirst({
        where: { id, userId: ws.ownerId },
        select: { updatedAt: true },
      });
      if (!owned) return { ok: false, error: "支払情報が見つかりません。" };
      if (owned.updatedAt.toISOString() !== version)
        return {
          ok: false,
          error:
            "別の画面で更新されています。一覧から最新の情報を開き直してください。",
        };
    }
    const value = form.get("pdf");
    const attachment = await readExpensePdf(
      value instanceof File ? value : null,
    );
    let link: Awaited<ReturnType<typeof resolveExpenseLink>>;
    try {
      link = await resolveExpenseLink(prisma, ws.ownerId, companyId, storeId);
    } catch {
      return { ok: false, error: "取引先・店舗の選択を確認してください。" };
    }
    const data = {
      ...values,
      ...link,
      dueDate: new Date(dueDate),
      paidDate: paidDate ? new Date(paidDate) : null,
    };
    await prisma.$transaction(async (tx) => {
      await accountingLock(tx,ws.ownerId);
      if (version) {
        const updated = await tx.expense.updateMany({
          where: { id, userId: ws.ownerId, updatedAt: new Date(version) },
          data,
        });
        if (updated.count !== 1) throw new Error("STALE_EXPENSE");
      } else {
        // Repeated submissions of the same form must not create duplicate costs.
        const existing = await tx.expense.findUnique({
          where: { id },
          select: { userId: true },
        });
        if (existing) {
          if (existing.userId !== ws.ownerId) throw new Error("UNAVAILABLE");
          return;
        }
        await tx.expense.create({ data: { ...data, id, userId: ws.ownerId } });
      }
      await syncExpense(tx,ws.ownerId,id);
      await recordAudit(tx, ws, {
        action: version ? "EXPENSE_UPDATE" : "EXPENSE_CREATE",
        entity: "PAYMENT",
        entityId: id,
        summary: version ? "支払を更新" : "支払を登録",
      });
      if (attachment) {
        await tx.expenseAttachment.upsert({
          where: { expenseId: id },
          create: { expenseId: id, ...attachment },
          update: attachment,
        });
      } else if (removeAttachment)
        await tx.expenseAttachment.deleteMany({
          where: { expenseId: id, expense: { userId: ws.ownerId } },
        });
    });
    revalidatePath("/accounting", "layout");
    revalidatePath("/expenses");
    revalidatePath("/dashboard");
    revalidatePath(`/expenses/${id}/edit`);
    return { ok: true, id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const safe = [
      "PDFファイルが空です。",
      "PDFは3MB以内で添付してください。",
      "PDFファイルを選択してください。",
      "PDFの形式を確認できません。別のファイルを選択してください。",
    ];
    return {
      ok: false,
      error:
        message === "STALE_EXPENSE"
          ? "別の画面で更新されています。一覧から最新の情報を開き直してください。"
          : safe.includes(message)
            ? message
            : "保存できませんでした。入力内容を残したまま、通信状況を確認して再試行してください。",
    };
  }
}
