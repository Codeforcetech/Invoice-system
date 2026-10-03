"use server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireWorkspace } from "@/lib/auth/require-workspace";
import { accountingLock } from "@/lib/accounting/service";
import { recordAudit } from "@/lib/workspace/audit";
import { PermissionError } from "@/lib/workspace/access";
import { dateText } from "@/lib/accounting/model";
import {
  EVIDENCE_KINDS,
  counterpartyKey,
  evidenceKindLabel,
  evidenceMetaSchema,
  type EvidenceKind,
} from "@/lib/evidence/model";
import { readEvidenceFile, sha256Hex } from "@/lib/evidence/file";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

function failure(e: unknown): { ok: false; error: string } {
  if (e instanceof z.ZodError)
    return {
      ok: false,
      error: e.issues[0]?.message ?? "入力内容を確認してください。",
    };
  if (e instanceof PermissionError) return { ok: false, error: e.message };
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
    return {
      ok: false,
      error:
        "同じファイル、または同じ取り込み元の証憑がすでに保存されています。",
    };
  if (e instanceof Error && !e.message.includes("\n") && !("code" in e))
    return { ok: false, error: e.message };
  return {
    ok: false,
    error: "保存できませんでした。入力内容を確認して、もう一度お試しください。",
  };
}
const refresh = () => {
  revalidatePath("/accounting/evidence", "layout");
};

/** 保存した内容の控え（履歴・操作ログ用）。ファイルの中身は含めない。 */
const snapshot = (e: {
  kind: string;
  transactionDate: Date;
  amount: number;
  counterparty: string;
  memo: string;
}) => ({
  kind: e.kind,
  transactionDate: dateText(e.transactionDate),
  amount: e.amount,
  counterparty: e.counterparty,
  memo: e.memo,
});

const label = (k: string) => evidenceKindLabel[k as EvidenceKind] ?? k;

/** 証憑ファイルを、受け取ったままの内容で登録する。 */
export async function uploadEvidence(
  form: FormData,
): Promise<Result<{ id: string }>> {
  try {
    const ws = await requireWorkspace("EDITOR");
    const { file, ...rest } = Object.fromEntries(form);
    const meta = evidenceMetaSchema.parse(rest);
    const stored = await readEvidenceFile(file instanceof File ? file : null);
    const id = await prisma.$transaction(async (tx) => {
      await accountingLock(tx, ws.ownerId);
      const row = await tx.evidenceFile.create({
        data: {
          ownerId: ws.ownerId,
          uploadedById: ws.userId,
          ...meta,
          counterpartyKey: counterpartyKey(meta.counterparty),
          transactionDate: new Date(meta.transactionDate),
          filename: stored.filename,
          mimeType: stored.mimeType,
          size: stored.size,
          sha256: stored.sha256,
          data: stored.data,
        },
        select: { id: true },
      });
      await tx.evidenceHistory.create({
        data: {
          evidenceId: row.id,
          ownerId: ws.ownerId,
          actorId: ws.userId,
          action: "UPLOAD",
          after: {
            ...meta,
            filename: stored.filename,
            sha256: stored.sha256,
            size: stored.size,
          },
        },
      });
      await recordAudit(tx, ws, {
        action: "EVIDENCE_UPLOAD",
        entity: "EVIDENCE",
        entityId: row.id,
        summary: `証憑を登録（${label(meta.kind)}・${meta.transactionDate}・${meta.counterparty.slice(0, 60)}）`,
      });
      return row.id;
    });
    refresh();
    return { ok: true, id };
  } catch (e) {
    return failure(e);
  }
}

const correctSchema = evidenceMetaSchema.extend({
  id: z.string().min(1).max(100),
  version: z.string().datetime(),
  reason: z.string().trim().min(1, "訂正の理由を入力してください").max(300),
});

/** 検索に使う項目を訂正する。変更前後と理由は履歴に残り、ファイル自体は変わらない。 */
export async function correctEvidence(raw: unknown): Promise<Result> {
  try {
    const ws = await requireWorkspace("EDITOR");
    const { id, version, reason, ...meta } = correctSchema.parse(raw);
    await prisma.$transaction(async (tx) => {
      await accountingLock(tx, ws.ownerId);
      const cur = await tx.evidenceFile.findFirst({
        where: { id, ownerId: ws.ownerId },
        select: {
          kind: true,
          transactionDate: true,
          amount: true,
          counterparty: true,
          memo: true,
          status: true,
          updatedAt: true,
        },
      });
      if (!cur) throw new Error("証憑が見つかりません。");
      if (cur.status !== "ACTIVE")
        throw new Error("無効にした証憑は訂正できません。");
      if (cur.updatedAt.toISOString() !== version)
        throw new Error(
          "ほかの操作で更新されています。画面を開き直してください。",
        );
      const before = snapshot(cur);
      const after = { ...meta };
      if (
        JSON.stringify(before) ===
        JSON.stringify({
          kind: after.kind,
          transactionDate: after.transactionDate,
          amount: after.amount,
          counterparty: after.counterparty,
          memo: after.memo,
        })
      )
        throw new Error("変更がありません。");
      await tx.evidenceFile.update({
        where: { id },
        data: {
          ...meta,
          counterpartyKey: counterpartyKey(meta.counterparty),
          transactionDate: new Date(meta.transactionDate),
        },
      });
      await tx.evidenceHistory.create({
        data: {
          evidenceId: id,
          ownerId: ws.ownerId,
          actorId: ws.userId,
          action: "CORRECT",
          reason,
          before,
          after,
        },
      });
      await recordAudit(tx, ws, {
        action: "EVIDENCE_CORRECT",
        entity: "EVIDENCE",
        entityId: id,
        summary: `証憑の登録内容を訂正（理由: ${reason.slice(0, 100)}）`,
      });
    });
    refresh();
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}

const voidSchema = z.object({
  id: z.string().min(1).max(100),
  version: z.string().datetime(),
  reason: z.string().trim().min(1, "無効にする理由を入力してください").max(300),
});

/** 証憑を無効にする。ファイルは残り、元に戻すことはできない。 */
export async function voidEvidence(raw: unknown): Promise<Result> {
  try {
    const ws = await requireWorkspace("APPROVER");
    const { id, version, reason } = voidSchema.parse(raw);
    await prisma.$transaction(async (tx) => {
      await accountingLock(tx, ws.ownerId);
      const cur = await tx.evidenceFile.findFirst({
        where: { id, ownerId: ws.ownerId },
        select: { status: true, updatedAt: true, counterparty: true },
      });
      if (!cur) throw new Error("証憑が見つかりません。");
      if (cur.status !== "ACTIVE") throw new Error("すでに無効です。");
      if (cur.updatedAt.toISOString() !== version)
        throw new Error(
          "ほかの操作で更新されています。画面を開き直してください。",
        );
      await tx.evidenceFile.update({
        where: { id },
        data: {
          status: "VOID",
          voidedAt: new Date(),
          voidedById: ws.userId,
          voidReason: reason,
        },
      });
      await tx.evidenceHistory.create({
        data: {
          evidenceId: id,
          ownerId: ws.ownerId,
          actorId: ws.userId,
          action: "VOID",
          reason,
        },
      });
      await recordAudit(tx, ws, {
        action: "EVIDENCE_VOID",
        entity: "EVIDENCE",
        entityId: id,
        summary: `証憑を無効化（${cur.counterparty.slice(0, 60)}／理由: ${reason.slice(0, 100)}）`,
      });
    });
    refresh();
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}

const fromExpenseSchema = z.object({
  expenseId: z.string().min(1).max(100),
  kind: z.enum(EVIDENCE_KINDS),
  transactionDate: evidenceMetaSchema.shape.transactionDate,
});

/**
 * 支払い管理に添付されたPDFを、そのままファイルボックスにも保存する。
 * 元の添付は変わらない。取引先・金額は支払い、取引年月日は入力された日付を使う。
 */
export async function saveExpenseAttachmentToBox(
  raw: unknown,
): Promise<Result<{ id: string }>> {
  try {
    const ws = await requireWorkspace("EDITOR");
    const v = fromExpenseSchema.parse(raw);
    const id = await prisma.$transaction(async (tx) => {
      await accountingLock(tx, ws.ownerId);
      const e = await tx.expense.findFirst({
        where: { id: v.expenseId, userId: ws.ownerId },
        select: {
          supplier: true,
          description: true,
          amount: true,
          attachment: true,
        },
      });
      if (!e) throw new Error("支払いが見つかりません。");
      if (!e.attachment)
        throw new Error("この支払いにはPDFが添付されていません。");
      const bytes = new Uint8Array(e.attachment.data);
      const row = await tx.evidenceFile.create({
        data: {
          ownerId: ws.ownerId,
          uploadedById: ws.userId,
          kind: v.kind,
          transactionDate: new Date(v.transactionDate),
          amount: e.amount,
          counterparty: e.supplier,
          counterpartyKey: counterpartyKey(e.supplier),
          memo: e.description.slice(0, 1000),
          filename: e.attachment.filename,
          mimeType: "application/pdf",
          size: bytes.length,
          sha256: sha256Hex(bytes),
          data: bytes,
          sourceType: "EXPENSE",
          sourceId: v.expenseId,
        },
        select: { id: true },
      });
      await tx.evidenceHistory.create({
        data: {
          evidenceId: row.id,
          ownerId: ws.ownerId,
          actorId: ws.userId,
          action: "UPLOAD",
          after: {
            kind: v.kind,
            transactionDate: v.transactionDate,
            amount: e.amount,
            counterparty: e.supplier,
            source: "支払いの添付PDF",
          },
        },
      });
      await recordAudit(tx, ws, {
        action: "EVIDENCE_UPLOAD",
        entity: "EVIDENCE",
        entityId: row.id,
        summary: `支払いの添付PDFを証憑として保存（${label(v.kind)}・${v.transactionDate}・${e.supplier.slice(0, 60)}）`,
      });
      return row.id;
    });
    refresh();
    return { ok: true, id };
  } catch (e) {
    return failure(e);
  }
}
