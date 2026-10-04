"use server";
import { z, ZodError } from "zod";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { recordAudit } from "@/lib/workspace/audit";
import { notifyUsers } from "@/lib/notifications/service";
import { EvidenceFileError, readEvidenceFile } from "@/lib/evidence/file";
import {
  clientAddress,
  findActiveLink,
  hashToken,
  throttle,
} from "@/lib/submissions/link";
import {
  MAX_SUBMISSION_FILES,
  bankText,
  needsReceipt,
  profileSchema,
  submissionSchema,
  submissionTotals,
} from "@/lib/submissions/model";

/**
 * ログインなしの提出（外部の提出リンク）。呼び出せるのは誰でも（=インターネット上の誰でも）なので、
 * すべての入力を信用せず、リンクの確認・回数の制限・内容の検証を、この中で行う。
 */
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
class PublicError extends Error {}
const refuse = (m: string): never => {
  throw new PublicError(m);
};

/** リンクが使えない理由は、どれも同じ文面にする（推測の手がかりを与えない）。 */
const LINK_INVALID =
  "このリンクは使えません。期限が切れているか、取り消されています。送ってくれた方に、確認してください。";
const TOO_MANY =
  "操作が多すぎます。しばらく待ってから、もう一度お試しください。";

function failure(e: unknown): { ok: false; error: string } {
  if (e instanceof ZodError)
    return {
      ok: false,
      error: e.issues[0]?.message ?? "入力内容を確認してください。",
    };
  if (e instanceof PublicError || e instanceof EvidenceFileError)
    return { ok: false, error: e.message };
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
    return { ok: false, error: "同じ内容がすでに登録されています。" };
  return {
    ok: false,
    error: "送信できませんでした。入力内容を確認して、もう一度お試しください。",
  };
}

const externalSchema = submissionSchema.omit({ version: true }).extend({
  profile: profileSchema,
  contactEmail: z
    .string()
    .trim()
    .max(200)
    .refine(
      (v) => v === "" || z.string().email().safeParse(v).success,
      "メールアドレスの形式を確認してください",
    )
    .default(""),
});

/** 入力（内容・添付）を読み取って検証する。提出と、再提出で共通。 */
async function prepare(form: FormData) {
  let payload: unknown;
  try {
    payload = JSON.parse(String(form.get("payload") ?? ""));
  } catch {
    return refuse("入力内容を読み取れませんでした。");
  }
  const v = externalSchema.parse(payload);
  const files = form
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > MAX_SUBMISSION_FILES)
    return refuse(`添付は${MAX_SUBMISSION_FILES}件までです。`);
  const read: Awaited<ReturnType<typeof readEvidenceFile>>[] = [];
  for (const f of files) read.push(await readEvidenceFile(f));
  if (!v.profile.legalName.trim())
    return refuse("お名前（会社名）を入力してください。");
  const totals = submissionTotals(v.items);
  if (totals.total <= 0) return refuse("金額を入力してください。");
  return { v, read, totals };
}

/** 入口の確認（送り元・リンクごとの制限、自動送信の罠、リンクの有効性）。通ったときだけ、リンクを返す。 */
async function gate(token: string, form?: FormData) {
  const ip = clientAddress(await headers());
  if (!(await throttle(prisma, "public-submit-ip", ip, 20, 10 * 60_000)))
    return refuse(TOO_MANY);
  if (
    !(await throttle(
      prisma,
      "public-submit-link",
      hashToken(token),
      20,
      3600_000,
    ))
  )
    return refuse(TOO_MANY);
  // 見えない欄に入力がある＝自動の送信。理由は伝えない。
  if (form && String(form.get("website") ?? "") !== "")
    return refuse(LINK_INVALID);
  const link = await findActiveLink(prisma, token);
  if (!link) {
    await throttle(prisma, "public-bad-link", ip, 30, 3600_000);
    return refuse(LINK_INVALID);
  }
  return link;
}

/** 外部の人の提出。最初から「承認待ち」で登録する（下書きは作らない）。 */
export async function submitViaLink(
  form: FormData,
): Promise<Result<{ id: string }>> {
  try {
    const token = String(form.get("token") ?? "");
    const link = await gate(token, form);
    const { v, read, totals } = await prepare(form);
    if (needsReceipt(v.items) && !read.length)
      return refuse("交通費・経費の明細があるので、領収書を添付してください。");

    const id = await prisma.$transaction(async (tx) => {
      // リンクの行を更新して、同時の送信を1件ずつにそろえる（上限の判定がすり抜けないように）。
      const lock = await tx.submissionLink.updateMany({
        where: {
          id: link.id,
          revokedAt: null,
          expiresAt: { gt: new Date() },
          submissionCount: { lt: link.maxSubmissions },
        },
        data: { submissionCount: { increment: 1 }, lastUsedAt: new Date() },
      });
      if (lock.count !== 1)
        return refuse(
          "このリンクからは、これ以上提出できません。送ってくれた方に、確認してください。",
        );
      const existing = await tx.submission.findUnique({
        where: { id: v.id },
        select: { linkId: true },
      });
      if (existing) {
        if (existing.linkId !== link.id) return refuse(LINK_INVALID);
        return v.id; // 同じ送信の再送は、二重に登録しない
      }
      const pending = await tx.submission.count({
        where: { linkId: link.id, status: "SUBMITTED" },
      });
      if (pending >= link.maxPending)
        return refuse(
          `承認待ちの提出が${link.maxPending}件あります。承認されるまで、新しく提出できません。`,
        );

      await tx.submission.create({
        data: {
          id: v.id,
          ownerId: link.ownerId,
          linkId: link.id,
          contactEmail: v.contactEmail || null,
          month: v.month,
          title: v.title,
          note: v.note,
          status: "SUBMITTED",
          submittedAt: new Date(),
          subtotal: totals.subtotal,
          taxAmount: totals.taxAmount,
          total: totals.total,
          senderName: v.profile.legalName,
          senderAddress: v.profile.address,
          senderRegistration: v.profile.registrationNumber,
          senderBank: bankText(v.profile),
        },
      });
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
          actorId: `link:${link.id}`,
          action: "SUBMIT",
        },
      });
      await tx.submissionLink.update({
        where: { id: link.id },
        data: { profile: v.profile, label: link.label },
      });
      await recordAudit(
        tx,
        { ownerId: link.ownerId, userId: link.ownerId },
        {
          action: "SUBMISSION_SUBMIT_EXTERNAL",
          entity: "SUBMISSION",
          entityId: v.id,
          summary: `外部リンク「${link.label.slice(0, 40)}」から提出（${v.month}分・¥${totals.total.toLocaleString("ja-JP")}）`,
        },
      );
      const members = await tx.workspaceMember.findMany({
        where: {
          ownerId: link.ownerId,
          active: true,
          role: { in: ["APPROVER", "ADMIN"] },
        },
        select: { userId: true },
      });
      await notifyUsers(
        tx,
        [link.ownerId, ...members.map((m) => m.userId)],
        `submission:${v.id}:submitted:1`,
        `${v.profile.legalName}さん（外部リンク）から、${v.month}分の提出があります`,
        `/accounting/submissions/${v.id}`,
      );
      return v.id;
    });
    revalidatePath("/accounting", "layout");
    return { ok: true, id };
  } catch (e) {
    return failure(e);
  }
}

/** 承認される前なら、外部の人が、自分の提出を取り下げる（取り下げると、直して出し直せる）。 */
export async function withdrawViaLink(raw: {
  token: string;
  id: string;
}): Promise<Result> {
  try {
    const { token, id } = z
      .object({ token: z.string().max(100), id: z.string().uuid() })
      .parse(raw);
    const link = await gate(token);
    await prisma.$transaction(async (tx) => {
      const row = await tx.submission.findFirst({
        where: { id, linkId: link.id, ownerId: link.ownerId },
        select: { id: true, month: true, status: true },
      });
      if (!row) return refuse(LINK_INVALID);
      const r = await tx.submission.updateMany({
        where: { id, status: "SUBMITTED" },
        data: { status: "DRAFT", revision: { increment: 1 } },
      });
      if (r.count !== 1)
        return refuse(
          "承認待ちの提出だけを、取り下げられます。すでに承認または差し戻しされています。",
        );
      await tx.submissionEvent.create({
        data: {
          submissionId: id,
          actorId: `link:${link.id}`,
          action: "WITHDRAW",
        },
      });
      await recordAudit(
        tx,
        { ownerId: link.ownerId, userId: link.ownerId },
        {
          action: "SUBMISSION_WITHDRAW_EXTERNAL",
          entity: "SUBMISSION",
          entityId: id,
          summary: `外部リンク「${link.label.slice(0, 40)}」から、提出を取り下げ（${row.month}分）`,
        },
      );
    });
    revalidatePath("/accounting", "layout");
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}

/**
 * 取り下げた提出、または差し戻された提出を、直して出し直す。
 * 内容と添付を置き換えて、もう一度「承認待ち」にする（承認待ちの同時件数の上限は、ここでも守る）。
 */
export async function resubmitViaLink(
  form: FormData,
): Promise<Result<{ id: string }>> {
  try {
    const token = String(form.get("token") ?? "");
    const link = await gate(token, form);
    const removeIds = z
      .array(z.string().max(60))
      .max(50)
      .parse(JSON.parse(String(form.get("removeFiles") || "[]")));
    const { v, read, totals } = await prepare(form);
    await prisma.$transaction(async (tx) => {
      const row = await tx.submission.findFirst({
        where: { id: v.id, linkId: link.id, ownerId: link.ownerId },
        include: { files: { select: { id: true } } },
      });
      if (!row) return refuse(LINK_INVALID);
      if (!["DRAFT", "REJECTED"].includes(row.status))
        return refuse(
          "取り下げた提出、または差し戻された提出だけを、直して出し直せます。",
        );
      // リンクの行を更新して、同時の操作を1件ずつにそろえる。
      const lock = await tx.submissionLink.updateMany({
        where: { id: link.id, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { lastUsedAt: new Date() },
      });
      if (lock.count !== 1) return refuse(LINK_INVALID);
      const pending = await tx.submission.count({
        where: { linkId: link.id, status: "SUBMITTED" },
      });
      if (pending >= link.maxPending)
        return refuse(
          `承認待ちの提出が${link.maxPending}件あります。承認されるまで、出し直せません。`,
        );
      const keep = row.files.filter((f) => !removeIds.includes(f.id)).length;
      if (keep + read.length > MAX_SUBMISSION_FILES)
        return refuse(`添付は${MAX_SUBMISSION_FILES}件までです。`);
      if (needsReceipt(v.items) && keep + read.length === 0)
        return refuse(
          "交通費・経費の明細があるので、領収書を添付してください。",
        );

      await tx.submission.update({
        where: { id: row.id },
        data: {
          month: v.month,
          title: v.title,
          note: v.note,
          contactEmail: v.contactEmail || null,
          status: "SUBMITTED",
          submittedAt: new Date(),
          rejectReason: null,
          revision: { increment: 1 },
          subtotal: totals.subtotal,
          taxAmount: totals.taxAmount,
          total: totals.total,
          senderName: v.profile.legalName,
          senderAddress: v.profile.address,
          senderRegistration: v.profile.registrationNumber,
          senderBank: bankText(v.profile),
        },
      });
      await tx.submissionItem.deleteMany({ where: { submissionId: row.id } });
      await tx.submissionItem.createMany({
        data: totals.items.map((i, n) => ({
          submissionId: row.id,
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
      if (removeIds.length)
        await tx.submissionFile.deleteMany({
          where: { submissionId: row.id, id: { in: removeIds } },
        });
      for (const f of read)
        await tx.submissionFile.create({
          data: {
            submissionId: row.id,
            filename: f.filename,
            mimeType: f.mimeType,
            size: f.size,
            sha256: f.sha256,
            data: f.data,
          },
        });
      const rev = (
        await tx.submission.findUniqueOrThrow({
          where: { id: row.id },
          select: { revision: true },
        })
      ).revision;
      await tx.submissionEvent.create({
        data: {
          submissionId: row.id,
          actorId: `link:${link.id}`,
          action: "SUBMIT",
        },
      });
      await tx.submissionLink.update({
        where: { id: link.id },
        data: { profile: v.profile },
      });
      await recordAudit(
        tx,
        { ownerId: link.ownerId, userId: link.ownerId },
        {
          action: "SUBMISSION_RESUBMIT_EXTERNAL",
          entity: "SUBMISSION",
          entityId: row.id,
          summary: `外部リンク「${link.label.slice(0, 40)}」から、提出を直して出し直し（${v.month}分・¥${totals.total.toLocaleString("ja-JP")}）`,
        },
      );
      const members = await tx.workspaceMember.findMany({
        where: {
          ownerId: link.ownerId,
          active: true,
          role: { in: ["APPROVER", "ADMIN"] },
        },
        select: { userId: true },
      });
      await notifyUsers(
        tx,
        [link.ownerId, ...members.map((m) => m.userId)],
        `submission:${row.id}:submitted:${rev}`,
        `${v.profile.legalName}さん（外部リンク）が、${v.month}分の提出を出し直しました`,
        `/accounting/submissions/${row.id}`,
      );
    });
    revalidatePath("/accounting", "layout");
    return { ok: true, id: v.id };
  } catch (e) {
    return failure(e);
  }
}
