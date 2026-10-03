"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db/prisma";
import { requireWorkspace } from "@/lib/auth/require-workspace";
import { recordAudit } from "@/lib/workspace/audit";
import { companyUpsertSchema, type CompanyUpsertInput } from "@/lib/validators/company";

const companyListSelect = {
  id: true,
  name: true,
  invoiceCode: true,
  createdAt: true,
} satisfies Prisma.CompanySelect;

const companyFormSelect = {
  id: true,
  name: true,
  invoiceCode: true,
  defaultDueDays: true,
  paymentTerms: true,
  commonSubject: true,
  billingEmail: true,
  billingCcEmail: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CompanySelect;

export async function listCompanies(params: { q?: string } = {}) {
  const ws = await requireWorkspace("VIEWER");

  const where: Prisma.CompanyWhereInput = {
    userId: ws.ownerId,
    ...(params.q ? { name: { contains: params.q, mode: "insensitive" } } : {}),
  };

  return prisma.company.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: companyListSelect,
  });
}

/** 請求書フォーム用：自動入力に必要なフィールド込み */
export async function listCompaniesForInvoiceForm() {
  const ws = await requireWorkspace("VIEWER");
  return prisma.company.findMany({
    where: { userId: ws.ownerId },
    orderBy: { name: "asc" },
    select: companyFormSelect,
  });
}

export type CompanyForInvoiceForm = Prisma.CompanyGetPayload<{ select: typeof companyFormSelect }>;

export async function getCompany(params: { companyId: string }) {
  const ws = await requireWorkspace("VIEWER");

  const company = await prisma.company.findFirst({
    where: { id: params.companyId, userId: ws.ownerId },
    select: companyFormSelect,
  });
  if (!company) throw new Error("FORBIDDEN_COMPANY");
  return company;
}

export async function createCompany(raw: unknown) {
  const ws = await requireWorkspace("EDITOR");
  const input = companyUpsertSchema.parse(raw) satisfies CompanyUpsertInput;

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.company.create({
    data: {
      userId: ws.ownerId,
      name: input.name,
      invoiceCode: input.invoiceCode,
      defaultDueDays: input.defaultDueDays,
      paymentTerms: input.paymentTerms?.trim() || null,
      commonSubject: input.commonSubject?.trim() || null,
      billingEmail: input.billingEmail?.trim() || null,
      billingCcEmail: input.billingCcEmail?.trim() || null,
    },
    select: { id: true },
    });
    await recordAudit(tx, ws, { action: "COMPANY_CREATE", entity: "SETTING", entityId: row.id, summary: `取引先「${input.name.slice(0, 60)}」を登録` });
    return row;
  });

  revalidatePath("/companies");
  return created;
}

export async function updateCompany(params: { companyId: string; data: unknown }) {
  const ws = await requireWorkspace("EDITOR");
  const input = companyUpsertSchema.parse(params.data) satisfies CompanyUpsertInput;

  const exists = await prisma.company.findFirst({
    where: { id: params.companyId, userId: ws.ownerId },
    select: { id: true },
  });
  if (!exists) throw new Error("FORBIDDEN_COMPANY");

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.company.update({
    where: { id: params.companyId },
    data: {
      name: input.name,
      invoiceCode: input.invoiceCode,
      defaultDueDays: input.defaultDueDays,
      paymentTerms: input.paymentTerms?.trim() || null,
      commonSubject: input.commonSubject?.trim() || null,
      billingEmail: input.billingEmail?.trim() || null,
      billingCcEmail: input.billingCcEmail?.trim() || null,
    },
    select: { id: true },
    });
    await recordAudit(tx, ws, { action: "COMPANY_UPDATE", entity: "SETTING", entityId: row.id, summary: `取引先「${input.name.slice(0, 60)}」を更新` });
    return row;
  });

  revalidatePath("/companies");
  revalidatePath(`/companies/${params.companyId}`);
  return updated;
}
