"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db/prisma";
import { requireWorkspace } from "@/lib/auth/require-workspace";
import { itemTemplateUpsertSchema, type ItemTemplateUpsertInput } from "@/lib/validators/item-template";

function toDecimal(n: number) {
  return new Prisma.Decimal(n.toFixed(2));
}

export async function listItemTemplates() {
  const ws = await requireWorkspace("VIEWER");
  return prisma.invoiceItemTemplate.findMany({
    where: { userId: ws.ownerId },
    orderBy: { createdAt: "desc" },
  });
}

export async function createItemTemplate(raw: unknown) {
  const ws = await requireWorkspace("EDITOR");
  const input = itemTemplateUpsertSchema.parse(raw) satisfies ItemTemplateUpsertInput;
  const created = await prisma.invoiceItemTemplate.create({
    data: {
      userId: ws.ownerId,
      name: input.name,
      productName: input.productName,
      unit: input.unit?.trim() || null,
      quantity: toDecimal(input.quantity),
      unitPrice: input.unitPrice,
      note: input.note?.trim() || null,
    },
    select: { id: true },
  });
  revalidatePath("/item-templates");
  revalidatePath("/invoices/new");
  return created;
}

export async function updateItemTemplate(params: { id: string; data: unknown }) {
  const ws = await requireWorkspace("EDITOR");
  const input = itemTemplateUpsertSchema.parse(params.data) satisfies ItemTemplateUpsertInput;
  const row = await prisma.invoiceItemTemplate.findFirst({
    where: { id: params.id, userId: ws.ownerId },
    select: { id: true },
  });
  if (!row) throw new Error("FORBIDDEN_TEMPLATE");
  await prisma.invoiceItemTemplate.update({
    where: { id: row.id },
    data: {
      name: input.name,
      productName: input.productName,
      unit: input.unit?.trim() || null,
      quantity: toDecimal(input.quantity),
      unitPrice: input.unitPrice,
      note: input.note?.trim() || null,
    },
  });
  revalidatePath("/item-templates");
  return { ok: true };
}

export async function deleteItemTemplate(params: { id: string }) {
  const ws = await requireWorkspace("EDITOR");
  const row = await prisma.invoiceItemTemplate.findFirst({
    where: { id: params.id, userId: ws.ownerId },
    select: { id: true },
  });
  if (!row) throw new Error("FORBIDDEN_TEMPLATE");
  await prisma.invoiceItemTemplate.delete({ where: { id: row.id } });
  revalidatePath("/item-templates");
  return { ok: true };
}
