"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/require-user";
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
  const user = await requireUser();

  const where: Prisma.CompanyWhereInput = {
    userId: user.id,
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
  const user = await requireUser();
  return prisma.company.findMany({
    where: { userId: user.id },
    orderBy: { name: "asc" },
    select: companyFormSelect,
  });
}

export type CompanyForInvoiceForm = Prisma.CompanyGetPayload<{ select: typeof companyFormSelect }>;

export async function getCompany(params: { companyId: string }) {
  const user = await requireUser();

  const company = await prisma.company.findFirst({
    where: { id: params.companyId, userId: user.id },
    select: companyFormSelect,
  });
  if (!company) throw new Error("FORBIDDEN_COMPANY");
  return company;
}

export async function createCompany(raw: unknown) {
  const user = await requireUser();
  const input = companyUpsertSchema.parse(raw) satisfies CompanyUpsertInput;

  const created = await prisma.company.create({
    data: {
      userId: user.id,
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

  revalidatePath("/companies");
  return created;
}

export async function updateCompany(params: { companyId: string; data: unknown }) {
  const user = await requireUser();
  const input = companyUpsertSchema.parse(params.data) satisfies CompanyUpsertInput;

  const exists = await prisma.company.findFirst({
    where: { id: params.companyId, userId: user.id },
    select: { id: true },
  });
  if (!exists) throw new Error("FORBIDDEN_COMPANY");

  const updated = await prisma.company.update({
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

  revalidatePath("/companies");
  revalidatePath(`/companies/${params.companyId}`);
  return updated;
}
