"use server";

import { Prisma, UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db/prisma";
import { requireAdmin } from "@/lib/auth/require-admin";
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
  await requireAdmin();
  const input = adminCreateUserSchema.parse(raw) satisfies AdminCreateUserInput;

  const passwordHash = await hashPassword(input.password);

  const created = await prisma.user.create({
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

  revalidatePath("/admin/users");
  return created;
}

