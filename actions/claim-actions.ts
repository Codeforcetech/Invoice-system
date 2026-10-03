"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/require-user";
import {
  accountingLock,
  postJournal,
  reverseJournal,
  type Tx,
} from "@/lib/accounting/service";
import { dateText, daySchema } from "@/lib/accounting/model";
import { japanToday } from "@/lib/expenses/model";
import { claimSchema } from "@/lib/claims/model";
import { readClaimReceipt } from "@/lib/claims/receipt";
import { claimPermission } from "@/lib/claims/access";
import {
  notifyUsers,
  dispatchNotifications,
} from "@/lib/notifications/service";
function failure(e: unknown) {
  return {
    ok: false as const,
    error:
      e instanceof z.ZodError
        ? (e.issues[0]?.message ?? "入力を確認してください。")
        : e instanceof Error && !("code" in e) && !e.message.includes("\n")
          ? e.message
          : "保存できませんでした。入力を残したまま再試行してください。",
  };
}
function refresh(ids: string[] = []) {
  revalidatePath("/", "layout");
  revalidatePath("/claims", "layout");
  revalidatePath("/notifications");
  revalidatePath("/accounting", "layout");
  if (ids.length)
    after(async () => {
      try {
        await dispatchNotifications(ids);
      } catch {
        /* Durable outbox is retried by the notification job. */
      }
    });
}
async function lock(tx: Tx, ownerId: string) {
  await accountingLock(tx, ownerId);
}
export async function setupClaimWorkspace(raw: unknown) {
  const u = await requireUser();
  try {
    const v = z.object({ name: z.string().trim().min(1).max(80) }).parse(raw);
    await prisma.$transaction(async (tx) => {
      await lock(tx, u.id);
      if (!(await tx.accountingSetting.findUnique({ where: { userId: u.id } })))
        throw new Error("先に会計・帳簿の初期設定を完了してください。");
      await tx.claimWorkspace.upsert({
        where: { ownerId: u.id },
        create: { ownerId: u.id, name: v.name },
        update: { name: v.name },
      });
    });
    refresh();
    return { ok: true as const };
  } catch (e) {
    return failure(e);
  }
}
export async function saveClaimMember(raw: unknown) {
  const u = await requireUser();
  try {
    const v = z
      .object({
        email: z.string().trim().email().max(254),
        role: z.enum(["SUBMITTER", "APPROVER"]),
        active: z.boolean(),
      })
      .parse(raw);
    await prisma.$transaction(async (tx) => {
      await lock(tx, u.id);
      await claimPermission(tx, u.id, u.id);
      const target = await tx.user.findFirst({
        where: { email: { equals: v.email, mode: "insensitive" } },
        select: { id: true },
      });
      if (!target || target.id === u.id)
        throw new Error(
          "自分以外の登録済みユーザーのメールアドレスを指定してください。",
        );
      await tx.claimMember.upsert({
        where: { ownerId_userId: { ownerId: u.id, userId: target.id } },
        create: {
          ownerId: u.id,
          userId: target.id,
          role: v.role,
          active: v.active,
        },
        update: { role: v.role, active: v.active },
      });
    });
    refresh();
    return { ok: true as const };
  } catch (e) {
    return failure(e);
  }
}
export async function saveClaim(form: FormData) {
  const u = await requireUser();
  try {
    const v = claimSchema.parse({
      ...Object.fromEntries(form),
      version: form.get("version") || undefined,
      removeReceipt: form.get("removeReceipt") === "true",
    });
    await claimPermission(prisma, v.ownerId, u.id);
    if (
      v.version &&
      !(await prisma.expenseClaim.findFirst({
        where: {
          id: v.id,
          ownerId: v.ownerId,
          applicantId: u.id,
          status: { in: ["DRAFT", "REJECTED"] },
        },
      }))
    )
      throw new Error("編集できる申請が見つかりません。");
    const f = form.get("receipt"),
      receipt = await readClaimReceipt(f instanceof File ? f : null);
    await prisma.$transaction(async (tx) => {
      await lock(tx, v.ownerId);
      await claimPermission(tx, v.ownerId, u.id);
      const old = await tx.expenseClaim.findUnique({ where: { id: v.id } });
      if (old) {
        if (old.ownerId !== v.ownerId || old.applicantId !== u.id)
          throw new Error("申請が見つかりません。");
        if (!v.version)
          throw new Error("この申請は保存済みです。一覧から開いてください。");
        if (
          old.updatedAt.toISOString() !== v.version ||
          !["DRAFT", "REJECTED"].includes(old.status)
        )
          throw new Error("申請は更新済みです。最新の内容を開いてください。");
      } else if (v.version) throw new Error("申請が見つかりません。");
      const setting = await tx.accountingSetting.findUnique({
        where: { userId: v.ownerId },
      });
      if (!setting || v.date < dateText(setting.startDate))
        throw new Error("会計開始日以降の経費を指定してください。");
      const data = {
        title: v.title,
        merchant: v.merchant,
        date: new Date(v.date),
        amount: v.amount,
        category: v.category,
        note: v.note,
      };
      const claim = old
        ? await tx.expenseClaim.update({ where: { id: v.id }, data })
        : await tx.expenseClaim.create({
            data: { ...data, id: v.id, ownerId: v.ownerId, applicantId: u.id },
          });
      if (receipt)
        await tx.claimReceipt.upsert({
          where: { claimId: v.id },
          create: { claimId: v.id, ...receipt },
          update: receipt,
        });
      else if (v.removeReceipt)
        await tx.claimReceipt.deleteMany({ where: { claimId: v.id } });
      await tx.claimEvent.create({
        data: {
          claimId: v.id,
          actorId: u.id,
          action: "SAVE",
          revision: claim.revision,
          comment: "申請内容を保存",
        },
      });
    });
    refresh();
    return { ok: true as const, id: v.id };
  } catch (e) {
    return failure(e);
  }
}
export async function processClaim(raw: unknown) {
  const u = await requireUser();
  try {
    const v = z
      .object({
        id: z.string().uuid(),
        version: z.string().datetime(),
        action: z.enum([
          "SUBMIT",
          "WITHDRAW",
          "APPROVE",
          "REJECT",
          "REVOKE",
          "PAY",
          "UNDO_PAY",
        ]),
        comment: z.string().trim().max(1000).default(""),
        accountId: z.string().optional(),
        date: daySchema.optional(),
      })
      .parse(raw);
    const owner = await prisma.expenseClaim.findUnique({
      where: { id: v.id },
      select: { ownerId: true },
    });
    if (!owner) throw new Error("申請が見つかりません。");
    const ids = await prisma.$transaction(
      async (tx) => {
        await lock(tx, owner.ownerId);
        const permission = await claimPermission(tx, owner.ownerId, u.id);
        const c = await tx.expenseClaim.findUniqueOrThrow({
          where: { id: v.id },
          include: { receipt: { select: { claimId: true } } },
        });
        if (c.updatedAt.toISOString() !== v.version)
          throw new Error("申請は更新済みです。最新の内容を確認してください。");
        const isApplicant = c.applicantId === u.id,
          canApprove = permission.role !== "SUBMITTER" && !isApplicant;
        let status = c.status,
          entryId = c.entryId,
          paymentEntryId = c.paymentEntryId,
          paidDate = c.paidDate,
          revision = c.revision,
          recipients: string[] = [],
          title = "";
        if (v.action === "SUBMIT") {
          if (!isApplicant || !["DRAFT", "REJECTED"].includes(c.status))
            throw new Error("下書き・差戻しの自分の申請のみ提出できます。");
          if (!c.receipt)
            throw new Error("申請前にレシートを添付してください。");
          const members = await tx.claimMember.findMany({
            where: { ownerId: c.ownerId, role: "APPROVER", active: true },
            select: { userId: true },
          });
          recipients = [
            ...new Set([c.ownerId, ...members.map((m) => m.userId)]),
          ].filter((id) => id !== u.id);
          if (!recipients.length)
            throw new Error("自分以外の承認者を登録してから申請してください。");
          status = "PENDING";
          revision++;
          title = "経費申請の承認依頼が届きました";
        } else if (v.action === "WITHDRAW") {
          if (!isApplicant || c.status !== "PENDING")
            throw new Error("承認待ちの自分の申請のみ取り下げできます。");
          status = "DRAFT";
        } else if (v.action === "APPROVE") {
          if (!canApprove || c.status !== "PENDING")
            throw new Error(
              "自分以外の承認待ち申請を、承認者が処理してください。",
            );
          const account = await tx.account.findFirst({
              where: {
                id: v.accountId ?? "",
                userId: c.ownerId,
                active: true,
                kind: "EXPENSE",
              },
            }),
            payable = await tx.account.findUnique({
              where: { userId_code: { userId: c.ownerId, code: "210" } },
            });
          if (!account || !payable)
            throw new Error("利用可能な費用科目を選択してください。");
          const j = await postJournal(
            tx,
            c.ownerId,
            {
              requestKey: `claim:${c.id}:${revision}`,
              date: dateText(c.date),
              memo: `経費精算: ${c.title} / ${c.merchant}`.slice(0, 500),
              lines: [
                { accountId: account.id, debit: c.amount, credit: 0 },
                { accountId: payable.id, debit: 0, credit: c.amount },
              ],
            },
            "CLAIM",
            c.id,
          );
          entryId = j.id;
          status = "APPROVED";
          recipients = [c.applicantId];
          title = "経費申請が承認されました";
        } else if (v.action === "REJECT" || v.action === "REVOKE") {
          if (
            !canApprove ||
            c.status !== (v.action === "REJECT" ? "PENDING" : "APPROVED") ||
            !v.comment
          )
            throw new Error(
              "承認者が対象の申請を選び、差戻し・取消理由を入力してください。",
            );
          if (v.action === "REVOKE" && entryId)
            await reverseJournal(
              tx,
              c.ownerId,
              entryId,
              dateText(c.date),
              v.comment,
            );
          entryId = null;
          status = "REJECTED";
          recipients = [c.applicantId];
          title =
            v.action === "REJECT"
              ? "経費申請が差し戻されました"
              : "経費申請の承認が取り消されました";
        } else if (v.action === "PAY") {
          if (
            permission.role !== "OWNER" ||
            c.status !== "APPROVED" ||
            !v.date ||
            v.date < dateText(c.date) ||
            v.date > japanToday()
          )
            throw new Error(
              "精算先の管理者が、承認済み申請の経費日以降・今日以前の精算日を入力してください。",
            );
          const bank = await tx.account.findFirst({
              where: {
                userId: c.ownerId,
                id: v.accountId ?? "",
                active: true,
                kind: "ASSET",
              },
            }),
            payable = await tx.account.findUnique({
              where: { userId_code: { userId: c.ownerId, code: "210" } },
            });
          if (!bank || !payable)
            throw new Error("利用可能な支払口座科目を選択してください。");
          const j = await postJournal(
            tx,
            c.ownerId,
            {
              requestKey: `claim-payment:${c.id}:${c.updatedAt.toISOString()}`,
              date: v.date,
              memo: `経費精算の支払: ${c.title}`.slice(0, 500),
              lines: [
                { accountId: payable.id, debit: c.amount, credit: 0 },
                { accountId: bank.id, debit: 0, credit: c.amount },
              ],
            },
            "CLAIM_PAYMENT",
            c.id,
          );
          paymentEntryId = j.id;
          paidDate = new Date(v.date);
          status = "PAID";
          recipients = [c.applicantId];
          title = "経費の精算が記録されました";
        } else {
          if (
            permission.role !== "OWNER" ||
            c.status !== "PAID" ||
            !v.comment ||
            !paymentEntryId ||
            !paidDate
          )
            throw new Error(
              "精算先の管理者が精算済み申請を選び、取消理由を入力してください。",
            );
          await reverseJournal(
            tx,
            c.ownerId,
            paymentEntryId,
            dateText(paidDate),
            v.comment,
          );
          paymentEntryId = null;
          paidDate = null;
          status = "APPROVED";
          recipients = [c.applicantId];
          title = "経費の精算記録が取り消されました";
        }
        await tx.expenseClaim.update({
          where: { id: c.id },
          data: { status, entryId, paymentEntryId, paidDate, revision },
        });
        const event = await tx.claimEvent.create({
          data: {
            claimId: c.id,
            actorId: u.id,
            action: v.action,
            revision,
            comment: v.comment,
          },
        });
        return recipients.length
          ? notifyUsers(tx, recipients, event.id, title, `/claims/${c.id}`)
          : [];
      },
      { timeout: 20000 },
    );
    refresh(ids);
    return { ok: true as const };
  } catch (e) {
    return failure(e);
  }
}
