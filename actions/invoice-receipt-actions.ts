"use server";
import { accountingLock } from "@/lib/accounting/service";
import { syncInvoice } from "@/lib/accounting/sync";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require-user";
import { prisma } from "@/lib/db/prisma";
import { receiptSchema } from "@/lib/invoice/receipt";
export async function recordInvoiceReceipt(raw: unknown) {
  const user = await requireUser();
  const parsed = receiptSchema.safeParse(raw);
  if (!parsed.success)
    return {
      ok: false,
      error:
        "入金日などの入力内容を確認してください。未来の日付は登録できません。",
    };
  const { invoiceId, version, receivedDate } = parsed.data;
  try {
    const result = await prisma.$transaction(async tx=>{
    await accountingLock(tx,user.id);
    const result = await tx.invoice.updateMany({
      where: {
        id: invoiceId,
        createdById: user.id,
        status: "ISSUED",
        receiptMatchId: null,
        mergedIntoId: null,
        updatedAt: new Date(version),
      },
      data: { receivedDate: receivedDate ? new Date(receivedDate) : null },
    });
    if(result.count) await syncInvoice(tx,user.id,invoiceId);
    return result;
    });
    revalidatePath("/accounting", "layout");
    if (!result.count)
      return {
        ok: false,
        error:
          "請求書が更新されたか、記録できない状態です。画面を再読み込みして確認してください。",
      };
    for (const path of [
      "/invoices",
      `/invoices/${invoiceId}`,
      `/invoices/${invoiceId}/edit`,
      "/dashboard",
      "/companies",
    ])
      revalidatePath(path);
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "入金記録を保存できませんでした。時間をおいて再度お試しください。",
    };
  }
}
