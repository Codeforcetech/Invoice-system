"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { mailTemplateUpsertSchema, type MailTemplateUpsertInput } from "@/lib/validators/mail-template";

export async function listMailTemplates() {
  const user = await requireUser();
  return prisma.mailTemplate.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
}

export async function createMailTemplate(raw: unknown) {
  const user = await requireUser();
  const input = mailTemplateUpsertSchema.parse(raw) satisfies MailTemplateUpsertInput;
  const created = await prisma.mailTemplate.create({
    data: {
      userId: user.id,
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
  const user = await requireUser();
  const input = mailTemplateUpsertSchema.parse(params.data) satisfies MailTemplateUpsertInput;
  const row = await prisma.mailTemplate.findFirst({
    where: { id: params.id, userId: user.id },
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
  const user = await requireUser();
  const row = await prisma.mailTemplate.findFirst({
    where: { id: params.id, userId: user.id },
    select: { id: true },
  });
  if (!row) throw new Error("FORBIDDEN_MAIL_TEMPLATE");
  await prisma.mailTemplate.delete({ where: { id: row.id } });
  revalidatePath("/mail-templates");
  return { ok: true };
}
