"use server";
import { z, ZodError } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireWorkspace } from "@/lib/auth/require-workspace";
import { PermissionError } from "@/lib/workspace/access";
import { recordAudit } from "@/lib/workspace/audit";
import {
  DEFAULT_LINK,
  LINK_DAYS,
  generateToken,
  hashToken,
} from "@/lib/submissions/link";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } =>
  e instanceof ZodError
    ? {
        ok: false,
        error: e.issues[0]?.message ?? "入力内容を確認してください。",
      }
    : e instanceof PermissionError
      ? { ok: false, error: e.message }
      : { ok: false, error: "処理できませんでした。もう一度お試しください。" };
const refresh = () => revalidatePath("/accounting", "layout");
const day = (d: number) => new Date(Date.now() + d * 86_400_000);

const createSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, "宛名（相手の名前）を入力してください")
    .max(60),
  days: z.coerce
    .number()
    .refine(
      (n) => (LINK_DAYS as readonly number[]).includes(n),
      "有効期限を選んでください",
    ),
  aiReads: z.coerce
    .number()
    .int()
    .min(0)
    .max(50)
    .default(DEFAULT_LINK.aiReadsLimit),
});

/**
 * 提出リンクを発行する（承認者以上）。リンクの元になるトークンは、この返事で1回だけ返す。
 * データベースには、ハッシュしか残らないので、あとから見ることはできない。
 */
export async function createSubmissionLink(
  raw: unknown,
): Promise<Result<{ id: string; token: string }>> {
  try {
    const ws = await requireWorkspace("APPROVER");
    const v = createSchema.parse(raw);
    const token = generateToken();
    const id = crypto.randomUUID();
    await prisma.$transaction(async (tx) => {
      await tx.submissionLink.create({
        data: {
          id,
          ownerId: ws.ownerId,
          createdById: ws.userId,
          label: v.label,
          tokenHash: hashToken(token),
          tokenHint: token.slice(-4),
          expiresAt: day(v.days),
          maxPending: DEFAULT_LINK.maxPending,
          maxSubmissions: DEFAULT_LINK.maxSubmissions,
          aiReadsLimit: v.aiReads,
        },
      });
      await recordAudit(tx, ws, {
        action: "SUBMISSION_LINK_CREATE",
        entity: "SUBMISSION",
        entityId: id,
        summary: `提出リンクを発行（宛名「${v.label.slice(0, 40)}」・${v.days}日間）`,
      });
    });
    refresh();
    return { ok: true, id, token };
  } catch (e) {
    return fail(e);
  }
}

export async function revokeSubmissionLink(raw: unknown): Promise<Result> {
  try {
    const ws = await requireWorkspace("APPROVER");
    const v = z.object({ id: z.string().uuid() }).parse(raw);
    await prisma.$transaction(async (tx) => {
      const r = await tx.submissionLink.updateMany({
        where: { id: v.id, ownerId: ws.ownerId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (r.count !== 1)
        throw new PermissionError(
          "リンクが見つからないか、すでに取り消されています。",
        );
      await recordAudit(tx, ws, {
        action: "SUBMISSION_LINK_REVOKE",
        entity: "SUBMISSION",
        entityId: v.id,
        summary: "提出リンクを取り消し",
      });
    });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** 有効期限を、今日から数えて延ばす（取り消し済みのリンクは、復活させない）。 */
export async function extendSubmissionLink(raw: unknown): Promise<Result> {
  try {
    const ws = await requireWorkspace("APPROVER");
    const v = z
      .object({
        id: z.string().uuid(),
        days: z.coerce
          .number()
          .refine(
            (n) => (LINK_DAYS as readonly number[]).includes(n),
            "期間を選んでください",
          ),
      })
      .parse(raw);
    await prisma.$transaction(async (tx) => {
      const r = await tx.submissionLink.updateMany({
        where: { id: v.id, ownerId: ws.ownerId, revokedAt: null },
        data: { expiresAt: day(v.days) },
      });
      if (r.count !== 1)
        throw new PermissionError(
          "リンクが見つからないか、取り消し済みです。新しく発行してください。",
        );
      await recordAudit(tx, ws, {
        action: "SUBMISSION_LINK_EXTEND",
        entity: "SUBMISSION",
        entityId: v.id,
        summary: `提出リンクの有効期限を延長（今日から${v.days}日間）`,
      });
    });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
