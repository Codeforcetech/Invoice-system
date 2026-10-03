import { prisma } from "@/lib/db/prisma";

/**
 * AuditLog is append-only in the database, so test cleanup is the only place that
 * removes rows: it switches the session to replica mode for one transaction.
 * Call before deleting the users a test created.
 */
export async function purgeAudit(userIds: string[]) {
  if (!userIds.length) return;
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
    await tx.auditLog.deleteMany({
      where: { OR: [{ ownerId: { in: userIds } }, { actorId: { in: userIds } }] },
    });
  });
}
