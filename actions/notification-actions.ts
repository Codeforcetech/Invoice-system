"use server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { revalidatePath } from "next/cache";
export async function markNotificationRead(id: string) {
  const u = await requireUser();
  z.string().min(1).max(100).parse(id);
  await prisma.appNotification.updateMany({
    where: { id, userId: u.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/", "layout");
}
export async function setNotificationEmail(enabled: boolean) {
  const u = await requireUser();
  z.boolean().parse(enabled);
  await prisma.$transaction(async (tx) => {
    await tx.notificationPreference.upsert({
      where: { userId: u.id },
      create: { userId: u.id, emailEnabled: enabled },
      update: { emailEnabled: enabled },
    });
    if (!enabled)
      await tx.appNotification.updateMany({
        where: { userId: u.id, emailStatus: { in: ["PENDING", "FAILED"] } },
        data: { emailStatus: "DISABLED" },
      });
  });
  revalidatePath("/notifications");
}
