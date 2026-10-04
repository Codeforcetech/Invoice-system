import "server-only";
import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;
type Link = { id: string; ownerId: string };

/** 外部の人が見られる、そのリンクの提出の一覧。他のリンク・メンバーの提出は、一切出ない。 */
export async function listLinkSubmissions(db: Db, link: Link) {
  return db.submission.findMany({
    where: { linkId: link.id, ownerId: link.ownerId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      month: true,
      title: true,
      status: true,
      total: true,
      rejectReason: true,
      submittedAt: true,
    },
  });
}

/** そのリンクの提出1件を、中身つきで取得する（管理者の画面と同じ形。リンクが違えば null）。 */
export async function loadLinkSubmission(db: Db, link: Link, id: string) {
  const row = await db.submission.findFirst({
    where: { id, linkId: link.id, ownerId: link.ownerId },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      files: {
        select: {
          id: true,
          filename: true,
          mimeType: true,
          size: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      },
      events: { orderBy: { createdAt: "asc" } },
      submitter: { select: { name: true } },
      link: { select: { label: true } },
      expenses: { select: { id: true, category: true, amount: true } },
    },
  });
  if (!row) return null;
  return {
    ...row,
    mine: true,
    // 外部の人には、管理者の名前は見せない。
    events: row.events.map((e) => ({
      ...e,
      actorName: e.actorId.startsWith("link:") ? "あなた" : "管理者",
    })),
  };
}

/** 提出先の表示名（会社名）。設定がなければ、空。 */
export async function companyNameOf(db: Db, ownerId: string) {
  const s = await db.systemSetting.findUnique({
    where: { userId: ownerId },
    select: { companyName: true },
  });
  return s?.companyName ?? "";
}
