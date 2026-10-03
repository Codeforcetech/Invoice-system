"use server";
import { accountingLock } from "@/lib/accounting/service";
import { syncInvoice } from "@/lib/accounting/sync";
import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/auth/require-workspace";
import { recordAudit } from "@/lib/workspace/audit";
import { PermissionError } from "@/lib/workspace/access";
import { prisma } from "@/lib/db/prisma";
import { receiptSchema } from "@/lib/invoice/receipt";
export async function recordInvoiceReceipt(raw: unknown) {
  let ws: Awaited<ReturnType<typeof requireWorkspace>>;
  try {
    ws = await requireWorkspace("EDITOR");
  } catch (e) {
    if (e instanceof PermissionError) return { ok: false, error: e.message };
    throw e;
  }
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
    await accountingLock(tx,ws.ownerId);
    const result = await tx.invoice.updateMany({
      where: {
        id: invoiceId,
        createdById: ws.ownerId,
        status: "ISSUED",
        receiptMatchId: null,
        mergedIntoId: null,
        updatedAt: new Date(version),
      },
      data: { receivedDate: receivedDate ? new Date(receivedDate) : null },
    });
    if(result.count) {
      await syncInvoice(tx,ws.ownerId,invoiceId);
      await recordAudit(tx, ws, {
        action: receivedDate ? "INVOICE_RECEIVED" : "INVOICE_RECEIVED_CLEAR",
        entity: "INVOICE",
        entityId: invoiceId,
        summary: receivedDate ? `入金を記録（${receivedDate}）` : "入金記録を解除",
      });
    }
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
