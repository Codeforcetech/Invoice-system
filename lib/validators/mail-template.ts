import { z } from "zod";

export const mailTemplateUpsertSchema = z.object({
  name: z.string().min(1, "テンプレート名は必須です"),
  subjectTemplate: z.string().min(1, "件名テンプレートは必須です"),
  bodyTemplate: z.string().min(1, "本文テンプレートは必須です"),
});

export type MailTemplateUpsertInput = z.infer<typeof mailTemplateUpsertSchema>;
