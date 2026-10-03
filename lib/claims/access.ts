import type { Prisma } from "@prisma/client";
import type { Tx } from "@/lib/accounting/service";
export async function claimPermission(tx: Tx, ownerId: string, userId: string) {
  const workspace = await tx.claimWorkspace.findUnique({ where: { ownerId } });
  if (!workspace) throw new Error("精算先が見つかりません。");
  if (ownerId === userId) return { workspace, role: "OWNER" };
  const member = await tx.claimMember.findUnique({
    where: { ownerId_userId: { ownerId, userId } },
  });
  if (!member?.active)
    throw new Error("この精算先を利用する権限がありません。");
  return { workspace, role: member.role };
}
export function visibleClaimWhere(
  userId: string,
): Prisma.ExpenseClaimWhereInput {
  return {
    OR: [
      { applicantId: userId },
      {
        AND: [
          { status: { not: "DRAFT" } },
          {
            OR: [
              { ownerId: userId },
              {
                workspace: {
                  members: { some: { userId, role: "APPROVER", active: true } },
                },
              },
            ],
          },
        ],
      },
    ],
  };
}
