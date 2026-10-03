"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/auth/require-workspace";
import { recordAudit } from "@/lib/workspace/audit";
import { PermissionError } from "@/lib/workspace/access";
import { prisma } from "@/lib/db/prisma";
import {
  daySchema,
  journalSchema,
  templateAccounts,
} from "@/lib/accounting/model";
import {
  accountingLock,
  postJournal,
  reverseJournal,
} from "@/lib/accounting/service";
const refresh = () => revalidatePath("/accounting", "layout");
export async function initializeAccounting(raw: unknown) {
  const ws = await requireWorkspace("ADMIN");
  const input = z
    .object({
      startDate: daySchema,
      industry: z.enum(["SERVICE", "RETAIL", "CONSTRUCTION"]),
    })
    .parse(raw);
  await prisma.$transaction(async (tx) => {
    await accountingLock(tx, ws.ownerId);
    if (await tx.accountingSetting.findUnique({ where: { userId: ws.ownerId } }))
      return;
    await tx.accountingSetting.create({
      data: {
        userId: ws.ownerId,
        startDate: new Date(input.startDate),
        industry: input.industry,
      },
    });
    await tx.account.createMany({
      data: templateAccounts(input.industry).map((a) => ({
        ...a,
        userId: ws.ownerId,
        system: true,
      })),
    });
    await recordAudit(tx, ws, {
      action: "ACCOUNTING_INIT",
      entity: "SETTING",
      summary: `会計の初期設定（開始日 ${input.startDate}）`,
    });
  });
  refresh();
}
export async function saveAccount(raw: unknown) {
  const ws = await requireWorkspace("ADMIN");
  const v = z
    .object({
      id: z.string().optional(),
      code: z.string().regex(/^[0-9A-Za-z-]{1,12}$/),
      name: z.string().trim().min(1).max(60),
      kind: z.enum(["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"]),
      active: z.boolean(),
    })
    .parse(raw);
  await prisma.$transaction(async (tx) => {
    await accountingLock(tx, ws.ownerId);
    if (
      !(await tx.accountingSetting.findUnique({ where: { userId: ws.ownerId } }))
    )
      throw new Error("会計の初期設定が必要です。");
    if (v.id) {
      const a = await tx.account.findFirst({
        where: { id: v.id, userId: ws.ownerId },
        include: { _count: { select: { lines: true, assetAccounts: true, depreciationAccounts: true } } },
      });
      if (!a) throw new Error("科目が見つかりません。");
      if (
        (a.system || a._count.lines > 0 || a._count.assetAccounts > 0 || a._count.depreciationAccounts > 0) &&
        (a.code !== v.code || a.kind !== v.kind || (a.system && !v.active))
      )
        throw new Error(
          "標準科目・使用済み科目のコードと分類は変更できません。標準科目は無効化できません。",
        );
      await tx.account.update({
        where: { id: a.id },
        data: { name: v.name, code: v.code, kind: v.kind, active: v.active },
      });
      await recordAudit(tx, ws, {
        action: "ACCOUNT_UPDATE",
        entity: "ACCOUNT",
        entityId: a.id,
        summary: `勘定科目 ${v.code} ${v.name} を更新${v.active ? "" : "（無効）"}`,
      });
    } else {
      const created = await tx.account.create({
        data: {
          userId: ws.ownerId,
          code: v.code,
          name: v.name,
          kind: v.kind,
          active: v.active,
        },
      });
      await recordAudit(tx, ws, {
        action: "ACCOUNT_CREATE",
        entity: "ACCOUNT",
        entityId: created.id,
        summary: `勘定科目 ${v.code} ${v.name} を追加`,
      });
    }
  });
  refresh();
}
export async function saveJournal(raw: unknown) {
  const parsed = journalSchema.safeParse(raw);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0].message };
  try {
    const ws = await requireWorkspace("EDITOR");
    await prisma.$transaction(async (tx) => {
      await accountingLock(tx, ws.ownerId);
      const entry = await postJournal(tx, ws.ownerId, parsed.data);
      await recordAudit(tx, ws, {
        action: "JOURNAL_POST",
        entity: "JOURNAL",
        entityId: entry.id,
        summary: `仕訳を登録（${parsed.data.date}）${parsed.data.memo.slice(0, 80)}`,
      });
    });
    refresh();
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof PermissionError ||
        (e instanceof Error && !e.message.includes("\n"))
          ? e.message
          : "登録できませんでした。入力内容を確認してください。",
    };
  }
}
export async function cancelJournal(raw: unknown) {
  const ws = await requireWorkspace("APPROVER");
  const v = z
    .object({
      id: z.string(),
      date: daySchema,
      reason: z.string().trim().min(1).max(300),
    })
    .parse(raw);
  await prisma.$transaction(async (tx) => {
    await accountingLock(tx, ws.ownerId);
    const e = await tx.journalEntry.findFirst({
      where: { id: v.id, userId: ws.ownerId, source: "MANUAL" },
    });
    if (!e) throw new Error("自動仕訳は元の請求・支払画面で訂正してください。");
    if (new Date(v.date) < e.date)
      throw new Error("元の取引日以降を指定してください。");
    await reverseJournal(tx, ws.ownerId, v.id, v.date, v.reason);
    await recordAudit(tx, ws, {
      action: "JOURNAL_CANCEL",
      entity: "JOURNAL",
      entityId: v.id,
      summary: `仕訳を取消（${v.date}）理由: ${v.reason.slice(0, 100)}`,
    });
  });
  refresh();
}
