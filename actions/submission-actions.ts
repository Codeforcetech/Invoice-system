"use server";
import { z, ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireWorkspace } from "@/lib/auth/require-workspace";
import { PermissionError } from "@/lib/workspace/access";
import { recordAudit } from "@/lib/workspace/audit";
import { accountingLock } from "@/lib/accounting/service";
import { syncExpense } from "@/lib/accounting/sync";
import { notifyUsers } from "@/lib/notifications/service";
import { counterpartyKey } from "@/lib/evidence/model";
import { EvidenceFileError, readEvidenceFile } from "@/lib/evidence/file";
import {
  MAX_SUBMISSION_FILES,
  bankText,
  expenseGroups,
  needsReceipt,
  profileSchema,
  submissionKindLabel,
  submissionSchema,
  submissionTotals,
} from "@/lib/submissions/model";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

class SubmissionError extends Error {}
const fail = (m: string): never => {
  throw new SubmissionError(m);
};

function failure(e: unknown): { ok: false; error: string } {
  if (e instanceof ZodError)
    return {
      ok: false,
      error: e.issues[0]?.message ?? "入力内容を確認してください。",
    };
  if (
    e instanceof PermissionError ||
    e instanceof SubmissionError ||
    e instanceof EvidenceFileError
  )
    return { ok: false, error: e.message };
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
    return {
      ok: false,
      error: "同じ内容がすでに登録されています。画面を開き直してください。",
    };
  return {
    ok: false,
    error: "処理できませんでした。入力内容を確認して、もう一度お試しください。",
  };
}
const refresh = () => {
  revalidatePath("/submit", "layout");
  revalidatePath("/accounting", "layout");
  revalidatePath("/expenses", "layout");
  revalidatePath("/notifications");
};
const versionOf = (d: Date) => d.toISOString();

/** 承認・差戻しをお知らせする相手（事業所の管理者と、承認者以上のメンバー）。 */
async function approverIds(tx: Prisma.TransactionClient, ownerId: string) {
  const members = await tx.workspaceMember.findMany({
    where: { ownerId, active: true, role: { in: ["APPROVER", "ADMIN"] } },
    select: { userId: true },
  });
  return [ownerId, ...members.map((m) => m.userId)];
}

/** 自分の下書き・差戻しの提出を取得する（他人のものは見つからない扱い）。 */
async function ownEditable(
  tx: Prisma.TransactionClient,
  id: string,
  ownerId: string,
  userId: string,
) {
  const row = await tx.submission.findFirst({
    where: { id, ownerId, submitterId: userId },
    include: { files: { select: { id: true } } },
  });
  if (!row) return fail("提出が見つかりません。");
  return row as NonNullable<typeof row>;
}

// ---------- 自分の情報 ----------

export async function saveSubmitterProfile(raw: unknown): Promise<Result> {
  try {
    const ws = await requireWorkspace("SUBMITTER");
    const v = profileSchema.parse(raw);
    await prisma.$transaction(async (tx) => {
      await tx.submitterProfile.upsert({
        where: { userId: ws.userId },
        create: { userId: ws.userId, ownerId: ws.ownerId, ...v },
        update: { ownerId: ws.ownerId, ...v },
      });
      await recordAudit(tx, ws, {
        action: "SUBMITTER_PROFILE_SAVE",
        entity: "SUBMISSION",
        summary: "提出者が、自分の情報（請求書の差出人）を保存",
      });
    });
    refresh();
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}

// ---------- 保存（下書き・差戻しの修正） ----------

export async function saveSubmission(
  form: FormData,
): Promise<Result<{ id: string; version: string }>> {
  try {
    const ws = await requireWorkspace("SUBMITTER");
    let payload: unknown;
    try {
      payload = JSON.parse(String(form.get("payload") ?? ""));
    } catch {
      return fail("入力内容を読み取れませんでした。");
    }
    const v = submissionSchema.parse(payload);
    const removeIds = z
      .array(z.string().max(60))
      .max(50)
      .parse(JSON.parse(String(form.get("removeFiles") || "[]")));
    const newFiles = form
      .getAll("files")
      .filter((f): f is File => f instanceof File && f.size > 0);
    // ファイルの確認は、保存の前に済ませる。
    const read: Awaited<ReturnType<typeof readEvidenceFile>>[] = [];
    for (const f of newFiles) read.push(await readEvidenceFile(f));
    const totals = submissionTotals(v.items);

    const version = await prisma.$transaction(async (tx) => {
      const existing = await tx.submission.findUnique({
        where: { id: v.id },
        include: { files: { select: { id: true } } },
      });
      if (
        existing &&
        (existing.ownerId !== ws.ownerId || existing.submitterId !== ws.userId)
      )
        return fail("提出が見つかりません。");
      if (existing) {
        if (!["DRAFT", "REJECTED"].includes(existing.status))
          return fail(
            "承認待ち・承認済みの提出は、修正できません。承認待ちの場合は、取り下げてから修正してください。",
          );
        if (v.version && versionOf(existing.updatedAt) !== v.version)
          return fail("別の画面で更新されています。画面を開き直してください。");
      }
      const keep = (existing?.files ?? []).filter(
        (f) => !removeIds.includes(f.id),
      ).length;
      if (keep + read.length > MAX_SUBMISSION_FILES)
        return fail(`添付は${MAX_SUBMISSION_FILES}件までです。`);
      const data = {
        month: v.month,
        title: v.title,
        note: v.note,
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        total: totals.total,
        status: "DRAFT",
      };
      let saved: { updatedAt: Date };
      if (existing) {
        saved = await tx.submission.update({
          where: { id: v.id },
          data: { ...data, revision: { increment: 1 } },
        });
        await tx.submissionItem.deleteMany({ where: { submissionId: v.id } });
        if (removeIds.length)
          await tx.submissionFile.deleteMany({
            where: { submissionId: v.id, id: { in: removeIds } },
          });
      } else {
        saved = await tx.submission.create({
          data: {
            id: v.id,
            ownerId: ws.ownerId,
            submitterId: ws.userId,
            ...data,
          },
        });
      }
      await tx.submissionItem.createMany({
        data: totals.items.map((i, n) => ({
          submissionId: v.id,
          sortOrder: n,
          kind: i.kind,
          name: i.name,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          amount: i.amount,
          taxCategory: i.taxCategory,
          note: i.note,
        })),
      });
      for (const f of read)
        await tx.submissionFile.create({
          data: {
            submissionId: v.id,
            filename: f.filename,
            mimeType: f.mimeType,
            size: f.size,
            sha256: f.sha256,
            data: f.data,
          },
        });
      await tx.submissionEvent.create({
        data: {
          submissionId: v.id,
          actorId: ws.userId,
          action: existing ? "SAVE" : "CREATE",
        },
      });
      await recordAudit(tx, ws, {
        action: existing ? "SUBMISSION_SAVE" : "SUBMISSION_CREATE",
        entity: "SUBMISSION",
        entityId: v.id,
        summary: `提出の${existing ? "下書きを保存" : "下書きを作成"}（${v.month}分・${v.title.slice(0, 60)}）`,
      });
      return versionOf(saved.updatedAt);
    });
    refresh();
    return { ok: true, id: v.id, version };
  } catch (e) {
    return failure(e);
  }
}

// ---------- 提出・取り下げ・削除 ----------

export async function submitSubmission(raw: unknown): Promise<Result> {
  try {
    const ws = await requireWorkspace("SUBMITTER");
    const v = z
      .object({ id: z.string().uuid(), version: z.string().datetime() })
      .parse(raw);
    await prisma.$transaction(async (tx) => {
      const row = await tx.submission.findFirst({
        where: { id: v.id, ownerId: ws.ownerId, submitterId: ws.userId },
        include: { items: true, files: { select: { id: true } } },
      });
      if (!row) return fail("提出が見つかりません。");
      if (row.status !== "DRAFT")
        return fail("下書きの提出だけを、提出できます。");
      if (versionOf(row.updatedAt) !== v.version)
        return fail("別の画面で更新されています。画面を開き直してください。");
      if (!row.items.length || row.total <= 0)
        return fail("明細と金額を入力してください。");
      if (needsReceipt(row.items) && !row.files.length)
        return fail("交通費・経費の明細があるので、領収書を添付してください。");
      const profile = await tx.submitterProfile.findUnique({
        where: { userId: ws.userId },
      });
      if (!profile || !profile.legalName.trim())
        return fail(
          "先に「自分の情報」で、お名前（会社名）などを入力してください。",
        );
      await tx.submission.update({
        where: { id: row.id },
        data: {
          status: "SUBMITTED",
          submittedAt: new Date(),
          rejectReason: null,
          revision: { increment: 1 },
          senderName: profile.legalName,
          senderAddress: profile.address,
          senderRegistration: profile.registrationNumber,
          senderBank: bankText(profile),
        },
      });
      await tx.submissionEvent.create({
        data: { submissionId: row.id, actorId: ws.userId, action: "SUBMIT" },
      });
      await recordAudit(tx, ws, {
        action: "SUBMISSION_SUBMIT",
        entity: "SUBMISSION",
        entityId: row.id,
        summary: `提出（${row.month}分・${profile.legalName.slice(0, 40)}・¥${row.total.toLocaleString("ja-JP")}）`,
      });
      await notifyUsers(
        tx,
        (await approverIds(tx, ws.ownerId)).filter((u) => u !== ws.userId),
        `submission:${row.id}:submitted:${row.revision + 1}`,
        `${profile.legalName}さんから、${row.month}分の提出があります`,
        `/accounting/submissions/${row.id}`,
      );
    });
    refresh();
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}

export async function withdrawSubmission(raw: unknown): Promise<Result> {
  try {
    const ws = await requireWorkspace("SUBMITTER");
    const v = z.object({ id: z.string().uuid() }).parse(raw);
    await prisma.$transaction(async (tx) => {
      const row = await ownEditable(tx, v.id, ws.ownerId, ws.userId);
      if (row.status !== "SUBMITTED")
        return fail("承認待ちの提出だけを、取り下げられます。");
      const r = await tx.submission.updateMany({
        where: { id: row.id, status: "SUBMITTED" },
        data: { status: "DRAFT", revision: { increment: 1 } },
      });
      if (r.count !== 1)
        return fail(
          "すでに承認または差し戻しされています。画面を開き直してください。",
        );
      await tx.submissionEvent.create({
        data: { submissionId: row.id, actorId: ws.userId, action: "WITHDRAW" },
      });
      await recordAudit(tx, ws, {
        action: "SUBMISSION_WITHDRAW",
        entity: "SUBMISSION",
        entityId: row.id,
        summary: `提出を取り下げ（${row.month}分）`,
      });
    });
    refresh();
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}

export async function deleteSubmission(raw: unknown): Promise<Result> {
  try {
    const ws = await requireWorkspace("SUBMITTER");
    const v = z.object({ id: z.string().uuid() }).parse(raw);
    await prisma.$transaction(async (tx) => {
      const row = await ownEditable(tx, v.id, ws.ownerId, ws.userId);
      if (!["DRAFT", "REJECTED"].includes(row.status))
        return fail(
          "下書き・差戻しの提出だけを、削除できます。承認待ちの場合は、先に取り下げてください。",
        );
      await tx.submission.delete({ where: { id: row.id } });
      await recordAudit(tx, ws, {
        action: "SUBMISSION_DELETE",
        entity: "SUBMISSION",
        entityId: row.id,
        summary: `提出（${row.status === "DRAFT" ? "下書き" : "差戻し"}・${row.month}分）を削除`,
      });
    });
    refresh();
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}

// ---------- 管理者：承認・差戻し ----------

export async function approveSubmission(
  raw: unknown,
): Promise<Result<{ expenses: number }>> {
  try {
    const ws = await requireWorkspace("APPROVER");
    const v = z
      .object({ id: z.string().uuid(), version: z.string().datetime() })
      .parse(raw);
    const created = await prisma.$transaction(async (tx) => {
      await accountingLock(tx, ws.ownerId);
      const row = await tx.submission.findFirst({
        where: { id: v.id, ownerId: ws.ownerId },
        include: {
          items: { orderBy: { sortOrder: "asc" } },
          files: true,
          submitter: { select: { name: true } },
        },
      });
      if (!row) return fail("提出が見つかりません。");
      if (row.status !== "SUBMITTED")
        return fail("承認待ちの提出だけを、承認できます。");
      if (versionOf(row.updatedAt) !== v.version)
        return fail(
          "提出の内容が更新されています。画面を開き直して、内容を確認してください。",
        );
      if (row.submitterId === ws.userId)
        return fail("自分の提出は、承認できません。");
      const guard = await tx.submission.updateMany({
        where: { id: row.id, status: "SUBMITTED", updatedAt: row.updatedAt },
        data: {
          status: "APPROVED",
          decidedById: ws.userId,
          decidedAt: new Date(),
          rejectReason: null,
          revision: { increment: 1 },
        },
      });
      if (guard.count !== 1)
        return fail(
          "すでに承認または取り下げされています。画面を開き直してください。",
        );

      // 支払管理へ反映：「種類 × 税区分」ごとに1件（金額は税込）。
      const [y, m] = row.month.split("-").map(Number);
      const dueDate = new Date(Date.UTC(y, m + 1, 0)); // 翌月末（支払管理で変更できる）
      const groups = expenseGroups(row.items);
      for (const g of groups) {
        const names =
          g.names.slice(0, 3).join("・") + (g.names.length > 3 ? " ほか" : "");
        const expense = await tx.expense.create({
          data: {
            userId: ws.ownerId,
            supplier: row.senderName || row.submitter.name,
            description:
              `${row.month}分 ${submissionKindLabel[g.kind]}（${names}）`.slice(
                0,
                300,
              ),
            category: g.category,
            taxCategory: g.taxCategory,
            amount: g.gross,
            costMonth: row.month,
            dueDate,
            note: `提出：${row.title}`.slice(0, 500),
            submissionId: row.id,
          },
          select: { id: true },
        });
        await syncExpense(tx, ws.ownerId, expense.id);
      }

      // 添付ファイルは、証憑ファイルボックスにも保存する（同じファイルがすでにあれば、そのまま）。
      for (const f of row.files) {
        const dup = await tx.evidenceFile.findFirst({
          where: { ownerId: ws.ownerId, sha256: f.sha256, status: "ACTIVE" },
          select: { id: true },
        });
        if (dup) continue;
        const ev = await tx.evidenceFile.create({
          data: {
            ownerId: ws.ownerId,
            uploadedById: row.submitterId,
            kind: "RECEIPT",
            transactionDate: new Date(Date.UTC(y, m - 1, 1)),
            amount: row.total,
            counterparty: (row.senderName || row.submitter.name).slice(0, 150),
            counterpartyKey: counterpartyKey(
              row.senderName || row.submitter.name,
            ),
            memo: `提出（${row.title}）の添付`.slice(0, 500),
            filename: f.filename,
            mimeType: f.mimeType,
            size: f.size,
            sha256: f.sha256,
            data: f.data,
            sourceType: "SUBMISSION",
            sourceId: f.id,
          },
          select: { id: true },
        });
        await tx.evidenceHistory.create({
          data: {
            evidenceId: ev.id,
            ownerId: ws.ownerId,
            actorId: ws.userId,
            action: "UPLOAD",
            after: {
              source: "提出の承認",
              submissionId: row.id,
              month: row.month,
            },
          },
        });
      }

      await tx.submissionEvent.create({
        data: { submissionId: row.id, actorId: ws.userId, action: "APPROVE" },
      });
      await recordAudit(tx, ws, {
        action: "SUBMISSION_APPROVE",
        entity: "SUBMISSION",
        entityId: row.id,
        summary: `提出を承認し、支払管理に反映（${row.month}分・${(row.senderName || row.submitter.name).slice(0, 40)}・¥${row.total.toLocaleString("ja-JP")}）`,
      });
      await notifyUsers(
        tx,
        [row.submitterId],
        `submission:${row.id}:approved:${row.revision + 1}`,
        `${row.month}分の提出が承認されました`,
        `/submit/${row.id}`,
      );
      return groups.length;
    });
    refresh();
    return { ok: true, expenses: created };
  } catch (e) {
    return failure(e);
  }
}

export async function rejectSubmission(raw: unknown): Promise<Result> {
  try {
    const ws = await requireWorkspace("APPROVER");
    const v = z
      .object({
        id: z.string().uuid(),
        version: z.string().datetime(),
        reason: z
          .string()
          .trim()
          .min(1, "差し戻す理由を入力してください")
          .max(500),
      })
      .parse(raw);
    await prisma.$transaction(async (tx) => {
      const row = await tx.submission.findFirst({
        where: { id: v.id, ownerId: ws.ownerId },
      });
      if (!row) return fail("提出が見つかりません。");
      if (row.status !== "SUBMITTED")
        return fail("承認待ちの提出だけを、差し戻せます。");
      if (versionOf(row.updatedAt) !== v.version)
        return fail("提出の内容が更新されています。画面を開き直してください。");
      const guard = await tx.submission.updateMany({
        where: { id: row.id, status: "SUBMITTED", updatedAt: row.updatedAt },
        data: {
          status: "REJECTED",
          rejectReason: v.reason,
          decidedById: ws.userId,
          decidedAt: new Date(),
          revision: { increment: 1 },
        },
      });
      if (guard.count !== 1)
        return fail(
          "すでに承認または取り下げされています。画面を開き直してください。",
        );
      await tx.submissionEvent.create({
        data: {
          submissionId: row.id,
          actorId: ws.userId,
          action: "REJECT",
          note: v.reason,
        },
      });
      await recordAudit(tx, ws, {
        action: "SUBMISSION_REJECT",
        entity: "SUBMISSION",
        entityId: row.id,
        summary: `提出を差し戻し（${row.month}分）`,
      });
      await notifyUsers(
        tx,
        [row.submitterId],
        `submission:${row.id}:rejected:${row.revision + 1}`,
        `${row.month}分の提出が差し戻されました`,
        `/submit/${row.id}`,
      );
    });
    refresh();
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}
