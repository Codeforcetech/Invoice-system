"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/auth/require-workspace";
import { recordAudit } from "@/lib/workspace/audit";
import { PermissionError } from "@/lib/workspace/access";
import { prisma } from "@/lib/db/prisma";
import {
  accountingLock,
  postJournal,
  reverseJournal,
} from "@/lib/accounting/service";
import { dateText } from "@/lib/accounting/model";
import { japanToday } from "@/lib/expenses/model";
import {
  assetSchema,
  depreciationSchedule,
  fiscalMonths,
  monthEnd,
  monthSchema,
} from "@/lib/assets/model";

function refresh() {
  revalidatePath("/accounting", "layout");
}
function failure(e: unknown) {
  return {
    ok: false as const,
    error:
      e instanceof z.ZodError
        ? e.issues[0].message
        : e instanceof PermissionError ||
            (e instanceof Error &&
            !e.message.includes("\n") &&
            !e.message.includes("prisma"))
          ? e.message
          : "保存できませんでした。画面を更新して再度お試しください。",
  };
}
export async function prepareAssetAccounts() {
  try {
    const ws = await requireWorkspace("ADMIN");
    await prisma.$transaction(async (tx) => {
      await accountingLock(tx, ws.ownerId);
      if (
        !(await tx.accountingSetting.findUnique({ where: { userId: ws.ownerId } }))
      )
        throw new Error("会計の初期設定が必要です。");
      // Reserved new code: do not silently overwrite an existing custom account.
      const existing = await tx.account.findUnique({
        where: { userId_code: { userId: ws.ownerId, code: "DEP" } },
      });
      if (existing && (existing.kind !== "EXPENSE" || !existing.active))
        throw new Error(
          "科目コードDEPが使用されています。勘定科目画面で有効な費用科目を準備してください。",
        );
      if (!existing)
        await tx.account.create({
          data: {
            userId: ws.ownerId,
            code: "DEP",
            name: "減価償却費",
            kind: "EXPENSE",
            system: true,
          },
        });
      if (!existing)
        await recordAudit(tx, ws, { action: "ASSET_ACCOUNT_PREPARE", entity: "ACCOUNT", summary: "減価償却費の勘定科目を準備" });
    });
    refresh();
    return { ok: true as const };
  } catch (e) {
    return failure(e);
  }
}
export async function saveAsset(raw: unknown) {
  try {
    const ws = await requireWorkspace("ADMIN");
    const { id, version, ...input } = assetSchema.parse(raw);
    await prisma.$transaction(async (tx) => {
      await accountingLock(tx, ws.ownerId);
      const setting = await tx.accountingSetting.findUnique({
        where: { userId: ws.ownerId },
      });
      if (!setting) throw new Error("会計の初期設定が必要です。");
      if (input.serviceDate < dateText(setting.startDate))
        throw new Error(
          "この台帳は会計開始日以降に使用を開始した資産に対応しています。過年度償却済み資産の移行には未対応です。",
        );
      if (input.serviceDate > japanToday() || input.acquiredDate > japanToday())
        throw new Error("取得日・使用開始日は今日以前で指定してください。");
      const accounts = await tx.account.findMany({
        where: {
          userId: ws.ownerId,
          active: true,
          id: { in: [input.assetAccountId, input.expenseAccountId] },
        },
      });
      if (
        !accounts.some(
          (a) => a.id === input.assetAccountId && a.kind === "ASSET",
        ) ||
        !accounts.some(
          (a) => a.id === input.expenseAccountId && a.kind === "EXPENSE",
        )
      )
        throw new Error("有効な資産科目と費用科目を選択してください。");
      const existing = await tx.fixedAsset.findUnique({
        where: { id },
        include: { _count: { select: { postings: true } } },
      });
      const data = {
        ...input,
        acquiredDate: new Date(input.acquiredDate),
        serviceDate: new Date(input.serviceDate),
      };
      if (existing) {
        if (existing.userId !== ws.ownerId)
          throw new Error("資産が見つかりません。");
        if (existing.updatedAt.toISOString() !== version)
          throw new Error("内容が更新されています。画面を開き直してください。");
        if (existing._count.postings > 0) {
          const changed = Object.entries(data).some(([k, value]) => {
            if (k === "name" || k === "note") return false;
            const old = existing[k as keyof typeof existing];
            return value instanceof Date && old instanceof Date
              ? +value !== +old
              : value !== old;
          });
          if (changed)
            throw new Error(
              "仕訳履歴がある資産の計算条件は変更できません。名称・メモのみ編集できます。",
            );
        }
        await tx.fixedAsset.update({
          where: { id },
          data: { ...data, revision: { increment: 1 } },
        });
        await recordAudit(tx, ws, { action: "ASSET_UPDATE", entity: "ASSET", entityId: id, summary: `固定資産「${input.name.slice(0, 60)}」を更新` });
      } else {
        if (version) throw new Error("資産が見つかりません。");
        await tx.fixedAsset.create({ data: { id, userId: ws.ownerId, ...data } });
        await recordAudit(tx, ws, { action: "ASSET_CREATE", entity: "ASSET", entityId: id, summary: `固定資産「${input.name.slice(0, 60)}」を登録` });
      }
    });
    refresh();
    return { ok: true as const, id };
  } catch (e) {
    return failure(e);
  }
}
export async function postDepreciation(raw: unknown) {
  try {
    const ws = await requireWorkspace("EDITOR");
    const input = z
      .object({
        id: z.string().uuid(),
        version: z.string(),
        mode: z.enum(["MONTH", "YEAR"]),
        month: monthSchema,
        year: z.coerce.number().int().min(2000).max(2098),
      })
      .parse(raw);
    const count = await prisma.$transaction(async (tx) => {
      await accountingLock(tx, ws.ownerId);
      const asset = await tx.fixedAsset.findFirst({
        where: { id: input.id, userId: ws.ownerId },
        include: { postings: { where: { active: true } } },
      });
      if (!asset) throw new Error("資産が見つかりません。");
      if (asset.archived) throw new Error("保管済みの資産は記帳できません。");
      if (asset.method === "NONE") throw new Error("償却しない資産です。");
      if (asset.updatedAt.toISOString() !== input.version)
        throw new Error(
          "内容が更新されています。画面を更新して登録済みの金額を確認してください。",
        );
      const months =
        input.mode === "MONTH"
          ? [input.month]
          : fiscalMonths(input.year, asset.fiscalStartMonth);
      const end = months[months.length - 1];
      const date = monthEnd(end);
      if (date > japanToday())
        throw new Error("月末・年度末を迎えた期間のみ仕訳を登録できます。");
      const schedule = depreciationSchedule(
        {
          ...asset,
          method: asset.method as "STRAIGHT" | "DECLINING",
          serviceDate: dateText(asset.serviceDate),
        },
        end,
      );
      const posted = new Set(asset.postings.map((p) => p.month));
      if (
        schedule.some(
          (r) => r.month < months[0] && r.amount > 0 && !posted.has(r.month),
        )
      )
        throw new Error(
          "前の期間に未登録の償却があります。古い期間から順に登録してください。",
        );
      const rows = schedule.filter(
        (r) => months.includes(r.month) && r.amount > 0 && !posted.has(r.month),
      );
      if (!rows.length) return 0;
      const amount = rows.reduce((s, r) => s + r.amount, 0);
      const entry = await postJournal(
        tx,
        ws.ownerId,
        {
          requestKey: `asset:${asset.id}:${asset.revision}:${input.mode}:${end}`,
          date,
          memo: `減価償却: ${asset.name}（${rows[0].month}〜${rows[rows.length - 1].month}）`,
          lines: [
            { accountId: asset.expenseAccountId, debit: amount, credit: 0 },
            { accountId: asset.assetAccountId, debit: 0, credit: amount },
          ],
        },
        "DEPRECIATION",
        asset.id,
      );
      await tx.depreciationPosting.createMany({
        data: rows.map((r) => ({
          userId: ws.ownerId,
          assetId: asset.id,
          entryId: entry.id,
          month: r.month,
          amount: r.amount,
        })),
      });
      await tx.fixedAsset.update({
        where: { id: asset.id },
        data: { revision: { increment: 1 } },
      });
      await recordAudit(tx, ws, {
        action: "DEPRECIATION_POST",
        entity: "ASSET",
        entityId: asset.id,
        summary: `減価償却を記帳（${rows[0].month}〜${rows[rows.length - 1].month}）${asset.name.slice(0, 60)}`,
      });
      return rows.length;
    });
    refresh();
    return { ok: true as const, count };
  } catch (e) {
    return failure(e);
  }
}
export async function cancelDepreciation(raw: unknown) {
  try {
    const ws = await requireWorkspace("APPROVER");
    const v = z
      .object({
        id: z.string().uuid(),
        entryId: z.string().min(1),
        version: z.string(),
        reason: z.string().trim().min(1, "取消理由を入力してください").max(300),
      })
      .parse(raw);
    await prisma.$transaction(async (tx) => {
      await accountingLock(tx, ws.ownerId);
      const asset = await tx.fixedAsset.findFirst({
        where: { id: v.id, userId: ws.ownerId },
        include: {
          postings: { where: { active: true }, orderBy: { month: "desc" } },
        },
      });
      if (!asset || asset.updatedAt.toISOString() !== v.version)
        throw new Error(
          "資産が見つからないか、更新されています。画面を更新してください。",
        );
      if (asset.postings[0]?.entryId !== v.entryId)
        throw new Error("最後に登録した期間から順に取り消してください。");
      const entry = await tx.journalEntry.findFirstOrThrow({
        where: {
          id: v.entryId,
          userId: ws.ownerId,
          source: "DEPRECIATION",
          sourceId: asset.id,
        },
      });
      await reverseJournal(
        tx,
        ws.ownerId,
        entry.id,
        dateText(entry.date),
        v.reason,
      );
      await tx.depreciationPosting.updateMany({
        where: {
          userId: ws.ownerId,
          assetId: asset.id,
          entryId: entry.id,
          active: true,
        },
        data: {
          active: false,
          canceledAt: new Date(),
          canceledReason: v.reason,
        },
      });
      await tx.fixedAsset.update({
        where: { id: asset.id },
        data: { revision: { increment: 1 } },
      });
      await recordAudit(tx, ws, {
        action: "DEPRECIATION_CANCEL",
        entity: "ASSET",
        entityId: asset.id,
        summary: `減価償却の記帳を取消（${asset.name.slice(0, 60)}）理由: ${v.reason.slice(0, 100)}`,
      });
    });
    refresh();
    return { ok: true as const };
  } catch (e) {
    return failure(e);
  }
}
export async function archiveAsset(raw: unknown) {
  try {
    const ws = await requireWorkspace("ADMIN");
    const v = z
      .object({
        id: z.string().uuid(),
        version: z.string(),
        archived: z.boolean(),
      })
      .parse(raw);
    await prisma.$transaction(async (tx) => {
      await accountingLock(tx, ws.ownerId);
      const asset = await tx.fixedAsset.findFirst({
        where: { id: v.id, userId: ws.ownerId },
      });
      if (!asset || asset.updatedAt.toISOString() !== v.version)
        throw new Error("内容が更新されています。画面を更新してください。");
      await tx.fixedAsset.update({
        where: { id: asset.id },
        data: { archived: v.archived, revision: { increment: 1 } },
      });
      await recordAudit(tx, ws, { action: v.archived ? "ASSET_ARCHIVE" : "ASSET_RESTORE", entity: "ASSET", entityId: asset.id, summary: `固定資産「${asset.name.slice(0, 60)}」を${v.archived ? "保管" : "復帰"}` });
    });
    refresh();
    return { ok: true as const };
  } catch (e) {
    return failure(e);
  }
}
