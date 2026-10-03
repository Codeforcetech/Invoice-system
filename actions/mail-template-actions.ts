"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db/prisma";
import { requireWorkspace } from "@/lib/auth/require-workspace";
import { mailTemplateUpsertSchema, type MailTemplateUpsertInput } from "@/lib/validators/mail-template";

export async function listMailTemplates() {
  const ws = await requireWorkspace("VIEWER");
  return prisma.mailTemplate.findMany({
    where: { userId: ws.ownerId },
    orderBy: { createdAt: "desc" },
  });
}

export async function createMailTemplate(raw: unknown) {
  const ws = await requireWorkspace("EDITOR");
  const input = mailTemplateUpsertSchema.parse(raw) satisfies MailTemplateUpsertInput;
  const created = await prisma.mailTemplate.create({
    data: {
      userId: ws.ownerId,
      name: input.name,
      subjectTemplate: input.subjectTemplate,
      bodyTemplate: input.bodyTemplate,
    },
    select: { id: true },
  });
  revalidatePath("/mail-templates");
  return created;
}

export async function updateMailTemplate(params: { id: string; data: unknown }) {
  const ws = await requireWorkspace("EDITOR");
  const input = mailTemplateUpsertSchema.parse(params.data) satisfies MailTemplateUpsertInput;
  const row = await prisma.mailTemplate.findFirst({
    where: { id: params.id, userId: ws.ownerId },
    select: { id: true },
  });
  if (!row) throw new Error("FORBIDDEN_MAIL_TEMPLATE");
  await prisma.mailTemplate.update({
    where: { id: row.id },
    data: {
      name: input.name,
      subjectTemplate: input.subjectTemplate,
      bodyTemplate: input.bodyTemplate,
    },
  });
  revalidatePath("/mail-templates");
  return { ok: true };
}

export async function deleteMailTemplate(params: { id: string }) {
  const ws = await requireWorkspace("EDITOR");
  const row = await prisma.mailTemplate.findFirst({
    where: { id: params.id, userId: ws.ownerId },
    select: { id: true },
  });
  if (!row) throw new Error("FORBIDDEN_MAIL_TEMPLATE");
  await prisma.mailTemplate.delete({ where: { id: row.id } });
  revalidatePath("/mail-templates");
  return { ok: true };
}
