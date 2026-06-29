import type { SystemSetting } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

export const DEFAULT_SYSTEM_SETTING = {
  companyName: "未設定",
  taxRate: 1000,
} as const;

export async function getOrCreateSystemSetting(userId: string): Promise<SystemSetting> {
  const existing = await prisma.systemSetting.findUnique({ where: { userId } });
  if (existing) return existing;

  return prisma.systemSetting.create({
    data: {
      userId,
      companyName: DEFAULT_SYSTEM_SETTING.companyName,
      taxRate: DEFAULT_SYSTEM_SETTING.taxRate,
    },
  });
}

export async function getSystemSettingByUserId(userId: string): Promise<SystemSetting | null> {
  return prisma.systemSetting.findUnique({ where: { userId } });
}
