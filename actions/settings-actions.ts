"use server";

import { revalidatePath } from "next/cache";

import { isEmbeddedStamp } from "@/lib/invoice/resolveStampImageUrl";
import { loadPdfStamp } from "@/lib/pdf/stamp";
import { prisma } from "@/lib/db/prisma";
import { requireWorkspace } from "@/lib/auth/require-workspace";
import { recordAudit } from "@/lib/workspace/audit";
import { getOrCreateSystemSetting } from "@/lib/settings/system-setting";
import { settingsUpdateSchema, type SettingsUpdateInput } from "@/lib/validators/settings";

export async function getSettings() {
  const ws = await requireWorkspace("VIEWER");
  return getOrCreateSystemSetting(ws.ownerId);
}

export async function updateSettings(raw: unknown) {
  const ws = await requireWorkspace("ADMIN");
  const input = settingsUpdateSchema.parse(raw) satisfies SettingsUpdateInput;

  if (input.stampImageUrl && isEmbeddedStamp(input.stampImageUrl)) await loadPdfStamp(input.stampImageUrl);

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.systemSetting.upsert({
    where: { userId: ws.ownerId },
    update: {
      companyName: input.companyName,
      invoiceRegistrationNumber: input.invoiceRegistrationNumber ?? null,
      postalCode: input.postalCode ?? null,
      address: input.address ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      contactPerson: input.contactPerson ?? null,
      stampImageUrl: input.stampImageUrl ?? null,
      bankName: input.bankName ?? null,
      branchName: input.branchName ?? null,
      accountType: input.accountType ?? null,
      accountNumber: input.accountNumber ?? null,
      accountHolder: input.accountHolder ?? null,
      accountHolderKana: input.accountHolderKana ?? null,
      transferNote: input.transferNote ?? null,
      taxRate: input.taxRate,
    },
    create: {
      userId: ws.ownerId,
      companyName: input.companyName,
      invoiceRegistrationNumber: input.invoiceRegistrationNumber ?? null,
      postalCode: input.postalCode ?? null,
      address: input.address ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      contactPerson: input.contactPerson ?? null,
      stampImageUrl: input.stampImageUrl ?? null,
      bankName: input.bankName ?? null,
      branchName: input.branchName ?? null,
      accountType: input.accountType ?? null,
      accountNumber: input.accountNumber ?? null,
      accountHolder: input.accountHolder ?? null,
      accountHolderKana: input.accountHolderKana ?? null,
      transferNote: input.transferNote ?? null,
      taxRate: input.taxRate,
    },
    });
    await recordAudit(tx, ws, { action: "SETTING_UPDATE", entity: "SETTING", summary: "自社情報・請求設定を更新" });
    return row;
  });

  revalidatePath("/settings");
  revalidatePath("/invoices/new");
  return updated;
}
