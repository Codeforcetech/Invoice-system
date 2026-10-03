import { z } from "zod";

export const MAX_PDF_BYTES = 5 * 1024 * 1024;
const noHeaderBreak = (v: string) => !/[\r\n\u0000-\u001f\u007f]/.test(v);
export const senderEmailSchema = z
  .string()
  .trim()
  .max(254)
  .email("送信元のメールアドレスを確認してください")
  .refine(noHeaderBreak, "メールアドレスに改行は使えません");
function addresses(value: string) {
  if (!noHeaderBreak(value))
    throw new Error("メールアドレスに改行は使えません");
  const list = value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  if (
    list.length > 20 ||
    list.some((v) => !senderEmailSchema.safeParse(v).success)
  )
    throw new Error(
      "宛先は正しいメールアドレスをカンマ区切りで20件以内にしてください",
    );
  return list.join(", ");
}
export const draftInputSchema = z.object({
  from: senderEmailSchema,
  to: z
    .string()
    .max(5000)
    .transform(addresses)
    .refine((v) => v.length > 0, "宛先を入力してください"),
  cc: z.string().max(5000).transform(addresses),
  bcc: z.string().max(5000).transform(addresses),
  subject: z
    .string()
    .trim()
    .min(1, "件名を入力してください")
    .max(200, "件名は200文字以内にしてください")
    .refine(noHeaderBreak, "件名に改行は使えません"),
  body: z
    .string()
    .trim()
    .min(1, "本文を入力してください")
    .max(20000, "本文は20,000文字以内にしてください"),
});
export type DraftInput = z.infer<typeof draftInputSchema>;
export function base64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
function encodedSubject(subject: string) {
  const chunks: string[] = [];
  let current = "";
  for (const char of subject) {
    if (new TextEncoder().encode(current + char).length > 30) {
      chunks.push(current);
      current = "";
    }
    current += char;
  }
  if (current) chunks.push(current);
  return chunks
    .map((chunk) => `=?UTF-8?B?${base64(new TextEncoder().encode(chunk))}?=`)
    .join("\r\n ");
}
export function invoicePdfFilename(invoiceNumber: string) {
  return `invoice-${invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "document"}.pdf`;
}
const fold = (v: string) => v.match(/.{1,76}/g)?.join("\r\n") ?? "";
/** Only a MIME draft is built here. There is deliberately no send endpoint. */
export function buildDraftMime(
  rawInput: DraftInput,
  pdf: Uint8Array,
  invoiceNumber: string,
) {
  const input = draftInputSchema.parse(rawInput);
  if (
    pdf.length > MAX_PDF_BYTES ||
    pdf.length < 5 ||
    new TextDecoder().decode(pdf.subarray(0, 5)) !== "%PDF-"
  )
    throw new Error("有効な5MB以下の請求書PDFが必要です");
  const boundary = `invoice_${crypto.randomUUID().replace(/-/g, "")}`;
  const file = invoicePdfFilename(invoiceNumber);
  const message = [
    `From: ${input.from}`,
    `To: ${input.to}`,
    ...(input.cc ? [`Cc: ${input.cc}`] : []),
    ...(input.bcc ? [`Bcc: ${input.bcc}`] : []),
    `Subject: ${encodedSubject(input.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    fold(base64(new TextEncoder().encode(input.body))),
    `--${boundary}`,
    `Content-Type: application/pdf; name="${file}"`,
    `Content-Disposition: attachment; filename="${file}"`,
    "Content-Transfer-Encoding: base64",
    "",
    fold(base64(pdf)),
    `--${boundary}--`,
    "",
  ].join("\r\n");
  return base64(new TextEncoder().encode(message))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
