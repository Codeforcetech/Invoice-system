import "server-only";
import type { Prisma, PrismaClient } from "@prisma/client";
import { throttle } from "./link";
import { readInvoiceWithAi, type InvoiceReading } from "@/lib/ocr/invoice";
import { ocrConfigured } from "@/lib/ocr/anthropic";
import { readEvidenceFile } from "@/lib/evidence/file";

type Db = PrismaClient | Prisma.TransactionClient;

export const CONSENT_ERROR =
  "請求書の内容を、外部のAIサービス（Anthropic）に送って読み取ることに、同意してください。";
export const NOT_CONFIGURED =
  "自動読み取りは、まだ設定されていません。手入力してください。";

export type AiReadOutcome =
  | { ok: true; data: InvoiceReading; duplicate: boolean }
  | {
      ok: false;
      error: string;
      retryable: boolean;
      unconfigured: boolean;
      refund: boolean;
    };

/** 事業所全体で、1日に使えるAI読み取りの回数（費用の使いすぎを防ぐ）。 */
const dailyLimit = () => {
  const n = Number(process.env.INVOICE_OCR_DAILY_LIMIT);
  return Number.isInteger(n) && n > 0 ? n : 100;
};

/**
 * 請求書のファイルを検証して、AIで読み取る。回数の確保と返却は、呼び出し側が行う。
 * - file の検査は証憑と同じ（種類・サイズ）。内容は変えない。
 * - refund: 利用者の責任ではない失敗（混雑・設定など）のとき true（使った回数を戻してよい）。
 */
export async function readInvoiceFile(
  db: Db,
  input: {
    file: File;
    ownerId: string;
    duplicateWhere: Prisma.SubmissionFileWhereInput;
  },
): Promise<AiReadOutcome & { sha256?: string }> {
  const f = await readEvidenceFile(input.file);
  if (!ocrConfigured())
    return {
      ok: false,
      error: NOT_CONFIGURED,
      retryable: false,
      unconfigured: true,
      refund: true,
    };
  if (
    !(await throttle(
      db,
      "ai-daily",
      input.ownerId,
      dailyLimit(),
      24 * 3600_000,
    ))
  )
    return {
      ok: false,
      error: "本日のAI読み取りの上限に達しました。手入力してください。",
      retryable: false,
      unconfigured: false,
      refund: true,
    };
  const r = await readInvoiceWithAi({ data: f.data, mimeType: f.mimeType });
  if (!r.ok)
    return {
      ok: false,
      error: r.error,
      retryable: r.retryable,
      unconfigured: r.reason === "unconfigured",
      refund: r.reason !== "unreadable",
      sha256: f.sha256,
    };
  const dup = await db.submissionFile.findFirst({
    where: { sha256: f.sha256, ...input.duplicateWhere },
    select: { id: true },
  });
  return { ok: true, data: r.data, duplicate: !!dup, sha256: f.sha256 };
}
