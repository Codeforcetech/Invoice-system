import { prisma } from "@/lib/db/prisma";
import type { Tx } from "@/lib/accounting/service";
import { z } from "zod";
export async function notifyUsers(
  tx: Tx,
  userIds: string[],
  eventKey: string,
  title: string,
  href: string,
) {
  const ids: string[] = [];
  for (const userId of [...new Set(userIds)]) {
    const pref = await tx.notificationPreference.findUnique({
      where: { userId },
    });
    const n = await tx.appNotification.upsert({
      where: { userId_eventKey: { userId, eventKey } },
      create: {
        userId,
        eventKey,
        title,
        href,
        emailStatus: pref?.emailEnabled ? "PENDING" : "DISABLED",
      },
      update: {},
    });
    ids.push(n.id);
  }
  return ids;
}
export function notificationEmailReady() {
  return !!(
    process.env.RESEND_API_KEY &&
    process.env.NOTIFICATION_FROM_EMAIL &&
    process.env.NOTIFICATION_APP_URL
  );
}
const payloadSchema = z.object({
  from: z.string().email(),
  to: z.array(z.string().email()).length(1),
  subject: z.string(),
  text: z.string(),
});
export async function dispatchNotifications(ids?: string[]) {
  if (!notificationEmailReady()) return { configured: false, sent: 0 };
  const base = new URL(process.env.NOTIFICATION_APP_URL!);
  if (base.protocol !== "https:" || base.username || base.password)
    throw new Error("通知URLはHTTPSで設定してください。");
  const from = z.string().email().parse(process.env.NOTIFICATION_FROM_EMAIL);
  const now = new Date(),
    retryBefore = new Date(+now - 60_000),
    leaseBefore = new Date(+now - 300_000);
  const rows = await prisma.appNotification.findMany({
    where: {
      ...(ids ? { id: { in: ids } } : {}),
      OR: [
        { emailStatus: "PENDING" },
        {
          emailStatus: "FAILED",
          emailAttempts: { lt: 5 },
          emailLastAttemptAt: { lt: retryBefore },
        },
        { emailStatus: "SENDING", emailLastAttemptAt: { lt: leaseBefore } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 10,
    include: {
      user: { select: { email: true, notificationPreference: true } },
    },
  });
  let sent = 0;
  for (const row of rows) {
    if (!row.user.notificationPreference?.emailEnabled) {
      await prisma.appNotification.updateMany({
        where: {
          id: row.id,
          emailStatus: row.emailStatus,
          emailAttempts: row.emailAttempts,
        },
        data: { emailStatus: "DISABLED" },
      });
      continue;
    }
    // Provider deduplication expires at 24h. Never retry an uncertain request after that window.
    if (
      row.emailAttempts >= 5 ||
      (row.emailFirstAttemptAt &&
        +now - +row.emailFirstAttemptAt > 23 * 3600_000)
    ) {
      await prisma.appNotification.updateMany({
        where: {
          id: row.id,
          emailStatus: row.emailStatus,
          emailAttempts: row.emailAttempts,
        },
        data: { emailStatus: "NEEDS_REVIEW" },
      });
      continue;
    }
    if (!/^\/claims(?:\/[a-zA-Z0-9-]+)?$/.test(row.href)) continue;
    const payload = payloadSchema.parse(
      row.emailPayload ?? {
        from,
        to: [row.user.email],
        subject: `SEIQ：${row.title}`,
        text: `${row.title}\n\n内容はSEIQにログインして確認してください。\n${new URL(row.href, base.origin).href}\n\nメール通知の設定はSEIQのお知らせ画面から変更できます。`,
      },
    );
    const lease = await prisma.appNotification.updateMany({
      where: {
        id: row.id,
        emailStatus: row.emailStatus,
        emailAttempts: row.emailAttempts,
        emailLastAttemptAt: row.emailLastAttemptAt,
      },
      data: {
        emailStatus: "SENDING",
        emailAttempts: { increment: 1 },
        emailFirstAttemptAt: row.emailFirstAttemptAt ?? now,
        emailLastAttemptAt: now,
        emailPayload: payload,
      },
    });
    if (!lease.count) continue;
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `seiq-notification/${row.id}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error("NOTIFICATION_DELIVERY_FAILED");
      const result = await response.json();
      if (typeof result.id !== "string")
        throw new Error("NOTIFICATION_DELIVERY_UNCERTAIN");
      await prisma.appNotification.updateMany({
        where: { id: row.id, emailStatus: "SENDING", emailLastAttemptAt: now },
        data: { emailStatus: "SENT" },
      });
      sent++;
    } catch {
      await prisma.appNotification.updateMany({
        where: { id: row.id, emailStatus: "SENDING", emailLastAttemptAt: now },
        data: {
          emailStatus: row.emailAttempts + 1 >= 5 ? "NEEDS_REVIEW" : "FAILED",
        },
      });
    }
  }
  return { configured: true, sent };
}
