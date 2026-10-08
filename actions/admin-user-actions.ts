"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  ACCESS_ROLES,
  accessRoleLabel,
  assertRole,
  isWorkspaceRole,
  resolveWorkspace,
  roleLabel,
  type AccessRole,
  type WorkspaceRole,
} from "@/lib/workspace/access";
import { accountingLock, type Tx } from "@/lib/accounting/service";
import { notifyUsers } from "@/lib/notifications/service";
import { recordAudit } from "@/lib/workspace/audit";
import {
  adminCreateUserSchema,
  type AdminCreateUserInput,
} from "@/lib/validators/user";
import { hashPassword } from "@/lib/auth/password";
import { DEFAULT_SYSTEM_SETTING } from "@/lib/settings/system-setting";

const refresh = () => {
  revalidatePath("/admin/users");
  revalidatePath("/settings/members");
};
type Result = { ok: true } | { ok: false; error: string };
const fail = (e: unknown): Result => ({
  ok: false,
  error: e instanceof Error ? e.message : "処理に失敗しました。",
});

/** 管理者の確認。ユーザーの作成・権限の変更は、事業所の管理者（全体管理者）だけ。 */
async function adminContext() {
  const admin = await requireAdmin();
  const ws = await resolveWorkspace(prisma, admin.id);
  assertRole(ws, "ADMIN");
  return { admin, ws };
}

/** 経費精算の精算先があるときだけ、権限に合わせて、精算のメンバーにも入れる（管理者・承認者は承認、申請者は申請）。 */
async function syncClaimMember(
  tx: Tx,
  ownerId: string,
  userId: string,
  role: AccessRole,
) {
  const space = await tx.claimWorkspace.findUnique({
    where: { ownerId },
    select: { ownerId: true },
  });
  if (!space) return;
  const claimRole = role === "SUBMITTER" ? "SUBMITTER" : "APPROVER";
  await tx.claimMember.upsert({
    where: { ownerId_userId: { ownerId, userId } },
    create: { ownerId, userId, role: claimRole, active: true },
    update: { role: claimRole, active: true },
  });
}

export type WorkspaceUserRow = {
  userId: string;
  name: string;
  email: string;
  /** OWNER は、事業所の所有者（いつも管理者で、変更できない） */
  role: WorkspaceRole | "OWNER";
  active: boolean;
  createdAt: Date;
  isSelf: boolean;
};

/** この事業所のユーザー（所有者とメンバー）。メール・氏名で絞り込める。 */
export async function listWorkspaceUsers(
  params: { q?: string } = {},
): Promise<WorkspaceUserRow[]> {
  const { admin, ws } = await adminContext();
  const q = params.q?.trim().toLowerCase();
  const [owner, members] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: ws.ownerId },
      select: { id: true, name: true, email: true, createdAt: true },
    }),
    prisma.workspaceMember.findMany({
      where: { ownerId: ws.ownerId },
      include: {
        user: {
          select: { id: true, name: true, email: true, createdAt: true },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const rows: WorkspaceUserRow[] = [
    {
      userId: owner.id,
      name: owner.name,
      email: owner.email,
      role: "OWNER",
      active: true,
      createdAt: owner.createdAt,
      isSelf: owner.id === admin.id,
    },
    ...members
      .filter((m) => isWorkspaceRole(m.role))
      .map((m) => ({
        userId: m.user.id,
        name: m.user.name,
        email: m.user.email,
        role: m.role as WorkspaceRole,
        active: m.active,
        createdAt: m.user.createdAt,
        isSelf: m.user.id === admin.id,
      })),
  ];
  return q
    ? rows.filter(
        (r) =>
          r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q),
      )
    : rows;
}

/** ユーザーを作り、選んだ権限で、この事業所のメンバーにする。 */
export async function adminCreateUser(raw: unknown) {
  const { admin, ws } = await adminContext();
  const input = adminCreateUserSchema.parse(raw) satisfies AdminCreateUserInput;
  const passwordHash = await hashPassword(input.password);
  try {
    const created = await prisma.$transaction(async (tx) => {
      await accountingLock(tx, ws.ownerId);
      const row = await tx.user.create({
        data: {
          name: input.name,
          email: input.email.trim(),
          passwordHash,
          // 全体管理者（ユーザー管理の画面を開ける人）は、管理者だけ。
          role: input.accessRole === "ADMIN" ? "ADMIN" : "USER",
          systemSetting: {
            create: {
              companyName: DEFAULT_SYSTEM_SETTING.companyName,
              taxRate: DEFAULT_SYSTEM_SETTING.taxRate,
            },
          },
        },
        select: { id: true },
      });
      await tx.workspaceMember.create({
        data: { ownerId: ws.ownerId, userId: row.id, role: input.accessRole },
      });
      await syncClaimMember(tx, ws.ownerId, row.id, input.accessRole);
      await recordAudit(
        tx,
        { ownerId: ws.ownerId, userId: admin.id },
        {
          action: "USER_CREATE",
          entity: "USER",
          entityId: row.id,
          summary: `ユーザー「${input.name.slice(0, 60)}」を「${accessRoleLabel[input.accessRole]}」で作成`,
        },
      );
      return row;
    });
    refresh();
    return created;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      throw new Error("このメールアドレスは、すでに登録されています。");
    throw e;
  }
}

/** 権限を変える（管理者・承認者・申請者）。自分自身と、事業所の所有者は、変えられない。 */
export async function changeUserRole(raw: unknown): Promise<Result> {
  try {
    const { admin, ws } = await adminContext();
    const v = z
      .object({
        userId: z.string().min(1).max(100),
        accessRole: z.enum(ACCESS_ROLES),
      })
      .parse(raw);
    if (v.userId === admin.id)
      throw new Error(
        "自分自身の権限は変更できません。ほかの管理者に頼んでください。",
      );
    if (v.userId === ws.ownerId)
      throw new Error("事業所の所有者は、いつも管理者です。");
    await prisma.$transaction(async (tx) => {
      await accountingLock(tx, ws.ownerId);
      const m = await tx.workspaceMember.findFirst({
        where: { ownerId: ws.ownerId, userId: v.userId },
        include: { user: { select: { name: true } } },
      });
      if (!m) throw new Error("この事業所のユーザーが見つかりません。");
      if (m.role === v.accessRole) return;
      await tx.workspaceMember.update({
        where: { id: m.id },
        data: { role: v.accessRole },
      });
      await tx.user.update({
        where: { id: v.userId },
        data: { role: v.accessRole === "ADMIN" ? "ADMIN" : "USER" },
      });
      await syncClaimMember(tx, ws.ownerId, v.userId, v.accessRole);
      await recordAudit(
        tx,
        { ownerId: ws.ownerId, userId: admin.id },
        {
          action: "MEMBER_ROLE",
          entity: "MEMBER",
          entityId: m.id,
          summary: `${m.user.name} の権限を「${roleLabel[m.role as WorkspaceRole] ?? m.role}」から「${accessRoleLabel[v.accessRole]}」へ変更`,
        },
      );
      await notifyUsers(
        tx,
        [v.userId],
        `member-role:${m.id}:${Date.now()}`,
        `あなたの権限が「${accessRoleLabel[v.accessRole]}」に変更されました`,
        "/dashboard",
      );
    });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** ユーザーを停止する／再開する。自分自身と、所有者は、停止できない。 */
export async function setUserActive(raw: unknown): Promise<Result> {
  try {
    const { admin, ws } = await adminContext();
    const v = z
      .object({ userId: z.string().min(1).max(100), active: z.boolean() })
      .parse(raw);
    if (v.userId === admin.id) throw new Error("自分自身は停止できません。");
    if (v.userId === ws.ownerId)
      throw new Error("事業所の所有者は、停止できません。");
    await prisma.$transaction(async (tx) => {
      await accountingLock(tx, ws.ownerId);
      const m = await tx.workspaceMember.findFirst({
        where: { ownerId: ws.ownerId, userId: v.userId },
        include: { user: { select: { name: true } } },
      });
      if (!m) throw new Error("この事業所のユーザーが見つかりません。");
      if (m.active === v.active) return;
      await tx.workspaceMember.update({
        where: { id: m.id },
        data: { active: v.active },
      });
      await recordAudit(
        tx,
        { ownerId: ws.ownerId, userId: admin.id },
        {
          action: v.active ? "MEMBER_RESUME" : "MEMBER_SUSPEND",
          entity: "MEMBER",
          entityId: m.id,
          summary: `${m.user.name} を${v.active ? "再開" : "停止"}`,
        },
      );
    });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
