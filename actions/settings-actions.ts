"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { getOrCreateSystemSetting } from "@/lib/settings/system-setting";
import { settingsUpdateSchema, type SettingsUpdateInput } from "@/lib/validators/settings";

export async function getSettings() {
  const user = await requireUser();
  return getOrCreateSystemSetting(user.id);
}

export async function updateSettings(raw: unknown) {
  const user = await requireUser();
  const input = settingsUpdateSchema.parse(raw) satisfies SettingsUpdateInput;

  const updated = await prisma.systemSetting.upsert({
    where: { userId: user.id },
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
      userId: user.id,
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

  revalidatePath("/settings");
  revalidatePath("/invoices/new");
  return updated;
}
