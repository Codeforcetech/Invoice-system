"use server";
import { requireWorkspace } from "@/lib/auth/require-workspace";
import { PermissionError } from "@/lib/workspace/access";
import { recordAudit } from "@/lib/workspace/audit";
import { prisma } from "@/lib/db/prisma";
import { accountingLock } from "@/lib/accounting/service";
import { annotationSchema } from "@/lib/management/model";
import { revalidatePath } from "next/cache";
export async function saveReportAnnotation(raw: unknown) {
  let ws: Awaited<ReturnType<typeof requireWorkspace>>;
  try {
    ws = await requireWorkspace("EDITOR");
  } catch (e) {
    if (e instanceof PermissionError) return { ok: false, error: e.message };
    throw e;
  }
  const parsed = annotationSchema.safeParse(raw);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0].message };
  try {
    const v = parsed.data;
    if (v.department === "__none__" || v.office === "__none__")
      throw new Error("この分類名は使用できません。");
    await prisma.$transaction(async (tx) => {
      await accountingLock(tx, ws.ownerId);
      const target =
        v.targetType === "INVOICE"
          ? await tx.invoice.findFirst({
              where: { id: v.targetId, createdById: ws.ownerId },
            })
          : v.targetType === "EXPENSE"
            ? await tx.expense.findFirst({
                where: { id: v.targetId, userId: ws.ownerId },
              })
            : v.targetType === "CLAIM"
              ? await tx.expenseClaim.findFirst({
                  where: {
                    id: v.targetId,
                    ownerId: ws.ownerId,
                    status: { in: ["APPROVED", "PAID"] },
                  },
                })
              : v.targetType === "ASSET"
                ? await tx.fixedAsset.findFirst({
                    where: { id: v.targetId, userId: ws.ownerId },
                  })
                : await tx.journalEntry.findFirst({
                    where: {
                      id: v.targetId,
                      userId: ws.ownerId,
                      reversalOf: null,
                      source: { in: ["MANUAL", "STATEMENT"] },
                    },
                  });
      if (!target) throw new Error("対象の取引を利用できません。");
      const where = {
        userId_targetType_targetId: {
          userId: ws.ownerId,
          targetType: v.targetType,
          targetId: v.targetId,
        },
      };
      const current = await tx.reportAnnotation.findUnique({ where });
      if ((current?.version ?? 0) !== v.version)
        throw new Error("別の操作で更新されています。画面を更新してください。");
      const { version, ...values } = v;
      const data = {
        ...values,
        plannedDate: v.plannedDate ? new Date(v.plannedDate) : null,
        version: version + 1,
      };
      await tx.reportAnnotation.upsert({
        where,
        create: { ...data, userId: ws.ownerId },
        update: data,
      });
      await recordAudit(tx, ws, {
        action: "ANNOTATION_SAVE",
        entity: "REPORT",
        entityId: v.targetId,
        summary: `部門・事業所の分類を保存（${v.targetType}）`,
      });
    });
    revalidatePath("/reports");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error && !e.message.includes("\n")
          ? e.message
          : "保存できませんでした。入力内容を確認してください。",
    };
  }
}
