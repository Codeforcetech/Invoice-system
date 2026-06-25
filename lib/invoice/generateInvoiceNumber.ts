import { Prisma, type PrismaClient } from "@prisma/client";

function formatYearMonth(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}${m}`;
}

function pad3(n: number): string {
  return String(n).padStart(3, "0");
}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

/**
 * 既存請求書の番号末尾（連番）の最大値。該当なしは 0。
 * プレフィックスは「ユーザーID + 会社コード + 年月」でグローバル一意の衝突を避ける。
 */
async function maxInvoiceSeqSuffix(
  prisma: PrismaClient | Prisma.TransactionClient,
  companyId: string,
  issuedByUserId: string,
  invoiceCode: string,
  yearMonth: string,
): Promise<number> {
  const prefix = `${issuedByUserId}-${invoiceCode}-${yearMonth}-`;
  const rows = await prisma.invoice.findMany({
    where: { companyId, createdById: issuedByUserId, invoiceNumber: { startsWith: prefix } },
    select: { invoiceNumber: true },
  });
  let max = 0;
  for (const r of rows) {
    if (!r.invoiceNumber.startsWith(prefix)) continue;
    const tail = r.invoiceNumber.slice(prefix.length);
    if (!/^\d+$/.test(tail)) continue;
    const n = parseInt(tail, 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

/**
 * 採番は呼び出し元の transaction 内で実行すること（Invoice 作成と同一 TX が望ましい）。
 * InvoiceNumberSequence が無い／lastSeq が既存請求より小さい場合は、DB 上の最大サフィックスに合わせてから increment する。
 *
 * 番号形式: `{createdByUserId}-{invoiceCode}-{YYYYMM}-{NNN}`
 * （Invoice.invoiceNumber は DB 全体で一意のため、ユーザー接頭辞で他ユーザーとのコード重複を防ぐ）
 */
export async function generateInvoiceNumber(params: {
  prisma: PrismaClient | Prisma.TransactionClient;
  companyId: string;
  issueDate: Date;
  currentUserId: string;
}): Promise<string> {
  const { prisma, companyId, issueDate, currentUserId } = params;
  const yearMonth = formatYearMonth(issueDate);

  const company = await prisma.company.findFirst({
    where: { id: companyId, userId: currentUserId },
    select: { invoiceCode: true },
  });
  if (!company) throw new Error("FORBIDDEN_COMPANY");

  const floor = await maxInvoiceSeqSuffix(prisma, companyId, currentUserId, company.invoiceCode, yearMonth);

  let row = await prisma.invoiceNumberSequence.findUnique({
    where: { companyId_yearMonth: { companyId, yearMonth } },
  });

  if (!row) {
    try {
      await prisma.invoiceNumberSequence.create({
        data: { companyId, yearMonth, lastSeq: floor },
      });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
    }
    row = await prisma.invoiceNumberSequence.findUnique({
      where: { companyId_yearMonth: { companyId, yearMonth } },
    });
    if (!row) throw new Error("INVOICE_NUMBER_SEQUENCE_UNAVAILABLE");
  }

  if (row.lastSeq < floor) {
    await prisma.invoiceNumberSequence.update({
      where: { companyId_yearMonth: { companyId, yearMonth } },
      data: { lastSeq: floor },
    });
  }

  const bumped = await prisma.invoiceNumberSequence.update({
    where: { companyId_yearMonth: { companyId, yearMonth } },
    data: { lastSeq: { increment: 1 } },
    select: { lastSeq: true },
  });

  return `${currentUserId}-${company.invoiceCode}-${yearMonth}-${pad3(bumped.lastSeq)}`;
}
