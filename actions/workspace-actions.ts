"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireWorkspace } from "@/lib/auth/require-workspace";
import { accountingLock } from "@/lib/accounting/service";
import { notifyUsers } from "@/lib/notifications/service";
import { recordAudit } from "@/lib/workspace/audit";
import { roleLabel, WORKSPACE_ROLES } from "@/lib/workspace/access";

const refresh = () => revalidatePath("/settings/members");
const roleSchema = z.enum(WORKSPACE_ROLES);

type Result = { ok: true } | { ok: false; error: string };
const fail = (e: unknown): Result => ({
  ok: false,
  error: e instanceof Error ? e.message : "処理に失敗しました。",
});

/** Add an existing, empty account to this workspace by e-mail address. */
export async function addWorkspaceMember(raw: unknown): Promise<Result> {
  try {
    const me = await requireWorkspace("ADMIN");
    const v = z
      .object({ email: z.string().trim().toLowerCase().email().max(200), role: roleSchema })
      .parse(raw);
    await prisma.$transaction(async (tx) => {
      await accountingLock(tx, me.ownerId);
      const target = await tx.user.findUnique({
        where: { email: v.email },
        include: {
          workspaceMembership: true,
          _count: {
            select: {
              invoices: true,
              companies: true,
              journals: true,
              expenses: true,
              fixedAssets: true,
              workspaceMembers: true,
            },
          },
          accounting: { select: { userId: true } },
          claimWorkspace: { select: { ownerId: true } },
        },
      });
      if (!target) throw new Error("このメールアドレスのユーザーが見つかりません。先にユーザー登録が必要です。");
      if (target.id === me.ownerId) throw new Error("事業所の所有者は、すでに管理者です。");
      if (target.workspaceMembership)
        throw new Error(
          target.workspaceMembership.ownerId === me.ownerId
            ? "すでにメンバーです。権限を変更するか、停止中なら再開してください。"
            : "このユーザーは別の事業所のメンバーです。",
        );
      const owns = Object.values(target._count).some((n) => n > 0) || target.accounting || target.claimWorkspace;
      if (owns)
        throw new Error(
          "このユーザーは自分の請求書・会計データを持っているため追加できません。データのない新しいアカウントを追加してください。",
        );
      const member = await tx.workspaceMember.create({
        data: { ownerId: me.ownerId, userId: target.id, role: v.role },
      });
      await recordAudit(tx, me, {
        action: "MEMBER_ADD",
        entity: "MEMBER",
        entityId: member.id,
        summary: `${target.name}（${target.email}）を「${roleLabel[v.role]}」で追加`,
      });
      await notifyUsers(
        tx,
        [target.id],
        `member-add:${member.id}`,
        `事業所に「${roleLabel[v.role]}」として追加されました`,
        "/dashboard",
      );
    });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setMemberRole(raw: unknown): Promise<Result> {
  try {
    const me = await requireWorkspace("ADMIN");
    const v = z.object({ memberId: z.string().min(1).max(100), role: roleSchema }).parse(raw);
    await prisma.$transaction(async (tx) => {
      await accountingLock(tx, me.ownerId);
      const m = await tx.workspaceMember.findFirst({
        where: { id: v.memberId, ownerId: me.ownerId },
        include: { user: { select: { name: true } } },
      });
      if (!m) throw new Error("メンバーが見つかりません。");
      if (m.role === v.role) return;
      await tx.workspaceMember.update({ where: { id: m.id }, data: { role: v.role } });
      await recordAudit(tx, me, {
        action: "MEMBER_ROLE",
        entity: "MEMBER",
        entityId: m.id,
        summary: `${m.user.name} の権限を「${roleLabel[m.role as keyof typeof roleLabel] ?? m.role}」から「${roleLabel[v.role]}」へ変更`,
      });
      await notifyUsers(
        tx,
        [m.userId],
        `member-role:${m.id}:${Date.now()}`,
        `あなたの権限が「${roleLabel[v.role]}」に変更されました`,
        "/dashboard",
      );
    });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setMemberActive(raw: unknown): Promise<Result> {
  try {
    const me = await requireWorkspace("ADMIN");
    const v = z.object({ memberId: z.string().min(1).max(100), active: z.boolean() }).parse(raw);
    await prisma.$transaction(async (tx) => {
      await accountingLock(tx, me.ownerId);
      const m = await tx.workspaceMember.findFirst({
        where: { id: v.memberId, ownerId: me.ownerId },
        include: { user: { select: { name: true } } },
      });
      if (!m) throw new Error("メンバーが見つかりません。");
      if (m.active === v.active) return;
      await tx.workspaceMember.update({ where: { id: m.id }, data: { active: v.active } });
      await recordAudit(tx, me, {
        action: v.active ? "MEMBER_RESUME" : "MEMBER_SUSPEND",
        entity: "MEMBER",
        entityId: m.id,
        summary: `${m.user.name} を${v.active ? "再開" : "停止"}`,
      });
    });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
