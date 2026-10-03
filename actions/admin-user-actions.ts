"use server";

import { Prisma, UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db/prisma";
import { requireAdmin } from "@/lib/auth/require-admin";
import { resolveWorkspace } from "@/lib/workspace/access";
import { recordAudit } from "@/lib/workspace/audit";
import { adminCreateUserSchema, type AdminCreateUserInput } from "@/lib/validators/user";
import { hashPassword } from "@/lib/auth/password";
import { DEFAULT_SYSTEM_SETTING } from "@/lib/settings/system-setting";

export async function listUsers(params: { q?: string } = {}) {
  await requireAdmin();

  const where: Prisma.UserWhereInput = params.q
    ? {
        OR: [
          { email: { contains: params.q, mode: "insensitive" } },
          { name: { contains: params.q, mode: "insensitive" } },
        ],
      }
    : {};

  return prisma.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });
}

export async function adminCreateUser(raw: unknown) {
  const admin = await requireAdmin();
  const input = adminCreateUserSchema.parse(raw) satisfies AdminCreateUserInput;

  const passwordHash = await hashPassword(input.password);

  const ws = await resolveWorkspace(prisma, admin.id);
  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash,
      role: input.role as UserRole,
      systemSetting: {
        create: {
          companyName: DEFAULT_SYSTEM_SETTING.companyName,
          taxRate: DEFAULT_SYSTEM_SETTING.taxRate,
        },
      },
    },
    select: { id: true },
    });
    await recordAudit(tx, ws, { action: "USER_CREATE", entity: "USER", entityId: row.id, summary: `ユーザー「${input.name.slice(0, 60)}」を作成（${input.role === "ADMIN" ? "全体管理者" : "一般"}）` });
    return row;
  });

  revalidatePath("/admin/users");
  return created;
}

