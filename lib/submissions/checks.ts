import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * 承認する人に見せる、確認してほしい点。
 * - 同じファイルが、ほかの提出・証憑にもある（二重提出の可能性）
 * - 同じ差出人・同じ月・同じ合計の提出が、ほかにある
 * - 提出する人が申告した、AI読み取りの注意
 */
export async function submissionChecks(
  db: Db,
  ownerId: string,
  s: {
    id: string;
    month: string;
    total: number;
    senderName: string;
    aiAssisted: boolean;
    aiNote: string;
    files: { id: string }[];
  },
): Promise<string[]> {
  const out: string[] = [];
  if (s.files.length) {
    const hashes = (
      await db.submissionFile.findMany({
        where: { id: { in: s.files.map((f) => f.id) } },
        select: { sha256: true },
      })
    ).map((f) => f.sha256);
    const [otherSub, evidence] = await Promise.all([
      db.submissionFile.count({
        where: {
          sha256: { in: hashes },
          submissionId: { not: s.id },
          submission: { ownerId },
        },
      }),
      db.evidenceFile.count({
        where: {
          ownerId,
          sha256: { in: hashes },
          status: "ACTIVE",
          NOT: {
            sourceType: "SUBMISSION",
            sourceId: { in: s.files.map((f) => f.id) },
          },
        },
      }),
    ]);
    if (otherSub || evidence)
      out.push(
        "同じファイルが、ほかの提出または証憑ファイルボックスにもあります。二重の提出でないか、確認してください。",
      );
  }
  if (s.senderName) {
    const same = await db.submission.count({
      where: {
        ownerId,
        id: { not: s.id },
        senderName: s.senderName,
        month: s.month,
        total: s.total,
        status: { in: ["SUBMITTED", "APPROVED"] },
      },
    });
    if (same)
      out.push(
        "同じ差出人・同じ月・同じ金額の提出が、ほかにもあります。二重の提出でないか、確認してください。",
      );
  }
  if (s.aiAssisted)
    out.push(
      `提出した方は、請求書のAI読み取りを使いました。内容を、元のファイルと見比べて確認してください。${s.aiNote ? `（AIの注意：${s.aiNote}）` : ""}`,
    );
  return out;
}
