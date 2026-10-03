"use server";
import { requireUser } from "@/lib/auth/require-user";
import { prisma } from "@/lib/db/prisma";
import { accountingLock } from "@/lib/accounting/service";
import { annotationSchema } from "@/lib/management/model";
import { revalidatePath } from "next/cache";
export async function saveReportAnnotation(raw: unknown) {
  const user = await requireUser();
  const parsed = annotationSchema.safeParse(raw);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0].message };
  try {
    const v = parsed.data;
    if (v.department === "__none__" || v.office === "__none__")
      throw new Error("この分類名は使用できません。");
    await prisma.$transaction(async (tx) => {
      await accountingLock(tx, user.id);
      const target =
        v.targetType === "INVOICE"
          ? await tx.invoice.findFirst({
              where: { id: v.targetId, createdById: user.id },
            })
          : v.targetType === "EXPENSE"
            ? await tx.expense.findFirst({
                where: { id: v.targetId, userId: user.id },
              })
            : v.targetType === "CLAIM"
              ? await tx.expenseClaim.findFirst({
                  where: {
                    id: v.targetId,
                    ownerId: user.id,
                    status: { in: ["APPROVED", "PAID"] },
                  },
                })
              : v.targetType === "ASSET"
                ? await tx.fixedAsset.findFirst({
                    where: { id: v.targetId, userId: user.id },
                  })
                : await tx.journalEntry.findFirst({
                    where: {
                      id: v.targetId,
                      userId: user.id,
                      reversalOf: null,
                      source: { in: ["MANUAL", "STATEMENT"] },
                    },
                  });
      if (!target) throw new Error("対象の取引を利用できません。");
      const where = {
        userId_targetType_targetId: {
          userId: user.id,
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
        create: { ...data, userId: user.id },
        update: data,
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
