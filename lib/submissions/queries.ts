import type { Prisma, PrismaClient } from "@prisma/client";
import { hasRole, type WorkspaceRole } from "@/lib/workspace/access";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * 提出を、中身つきで取得する。提出者本人か、承認者以上（下書き以外）だけが見られる。
 * 条件に合わないときは null（他人のものがあるかどうかは教えない）。
 */
export async function loadSubmission(
  db: Db,
  ws: { ownerId: string; userId: string; role: WorkspaceRole },
  id: string,
) {
  const row = await db.submission.findFirst({
    where: { id, ownerId: ws.ownerId },
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
  const mine = !!row.submitterId && row.submitterId === ws.userId;
  const reviewer = hasRole(ws.role, "APPROVER") && row.status !== "DRAFT";
  if (!mine && !reviewer) return null;
  const actorIds = [...new Set(row.events.map((e) => e.actorId))];
  const actors = actorIds.length
    ? await db.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameOf = new Map(actors.map((a) => [a.id, a.name]));
  return {
    ...row,
    mine,
    events: row.events.map((e) => ({
      ...e,
      actorName: nameOf.get(e.actorId) ?? "",
    })),
  };
}
export type LoadedSubmission = NonNullable<
  Awaited<ReturnType<typeof loadSubmission>>
>;

export const eventLabel: Record<string, string> = {
  CREATE: "下書きを作成",
  SAVE: "下書きを保存",
  SUBMIT: "提出",
  WITHDRAW: "取り下げ",
  APPROVE: "承認",
  REJECT: "差戻し",
  MAIL: "メール通知",
};
