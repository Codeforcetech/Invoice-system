"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db/prisma";
import { requireWorkspace } from "@/lib/auth/require-workspace";
import { recordAudit } from "@/lib/workspace/audit";
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
  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.mailTemplate.create({
    data: {
      userId: ws.ownerId,
      name: input.name,
      subjectTemplate: input.subjectTemplate,
      bodyTemplate: input.bodyTemplate,
    },
    select: { id: true },
    });
    await recordAudit(tx, ws, { action: "MAIL_TEMPLATE_CREATE", entity: "TEMPLATE", entityId: row.id, summary: `メールテンプレート「${input.name.slice(0, 60)}」を追加` });
    return row;
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
  await prisma.$transaction(async (tx) => {
    await tx.mailTemplate.update({
    where: { id: row.id },
    data: {
      name: input.name,
      subjectTemplate: input.subjectTemplate,
      bodyTemplate: input.bodyTemplate,
    },
    });
    await recordAudit(tx, ws, { action: "MAIL_TEMPLATE_UPDATE", entity: "TEMPLATE", entityId: row.id, summary: `メールテンプレート「${input.name.slice(0, 60)}」を更新` });
  });
  revalidatePath("/mail-templates");
  return { ok: true };
}

export async function deleteMailTemplate(params: { id: string }) {
  const ws = await requireWorkspace("EDITOR");
  const row = await prisma.mailTemplate.findFirst({
    where: { id: params.id, userId: ws.ownerId },
    select: { id: true, name: true },
  });
  if (!row) throw new Error("FORBIDDEN_MAIL_TEMPLATE");
  await prisma.$transaction(async (tx) => {
    await tx.mailTemplate.delete({ where: { id: row.id } });
    await recordAudit(tx, ws, { action: "MAIL_TEMPLATE_DELETE", entity: "TEMPLATE", entityId: row.id, summary: `メールテンプレート「${row.name.slice(0, 60)}」を削除` });
  });
  revalidatePath("/mail-templates");
  return { ok: true };
}
