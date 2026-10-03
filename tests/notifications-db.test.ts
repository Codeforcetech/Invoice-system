import {
  beforeAll,
  afterAll,
  afterEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  notifyUsers,
  dispatchNotifications,
} from "@/lib/notifications/service";
const userId = "notification-test-owner";
const cleanup = () => prisma.user.deleteMany({ where: { id: userId } });
describe.skipIf(process.env.RUN_ACCOUNTING_DB_TESTS !== "1")(
  "notification outbox",
  () => {
    beforeAll(async () => {
      await cleanup();
      await prisma.user.create({
        data: {
          id: userId,
          name: "TEST",
          email: "notify@example.test",
          passwordHash: "no-login",
          notificationPreference: { create: { emailEnabled: true } },
        },
      });
    });
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    });
    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });
    const config = () => {
      vi.stubEnv("RESEND_API_KEY", "test-only");
      vi.stubEnv("NOTIFICATION_FROM_EMAIL", "noreply@example.test");
      vi.stubEnv("NOTIFICATION_APP_URL", "https://seiq.example.test");
    };
    const notice = () =>
      prisma.$transaction((tx) =>
        notifyUsers(
          tx,
          [userId],
          crypto.randomUUID(),
          "経費申請が承認されました",
          "/claims/11111111-1111-4111-8111-111111111111",
        ),
      );
    it("keeps notifications pending when the provider is not configured", async () => {
      vi.stubEnv("RESEND_API_KEY", "");
      const ids = await notice(),
        fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      expect((await dispatchNotifications(ids)).configured).toBe(false);
      expect(fetch).not.toHaveBeenCalled();
      expect(
        (
          await prisma.appNotification.findUniqueOrThrow({
            where: { id: ids[0] },
          })
        ).emailStatus,
      ).toBe("PENDING");
    });
    it("claims delivery once under concurrency and sends a frozen payload with an idempotency key", async () => {
      config();
      const ids = await notice(),
        fetch = vi
          .fn()
          .mockResolvedValue(
            new Response(JSON.stringify({ id: "sent-id" }), { status: 200 }),
          );
      vi.stubGlobal("fetch", fetch);
      await Promise.all([
        dispatchNotifications(ids),
        dispatchNotifications(ids),
      ]);
      expect(fetch).toHaveBeenCalledTimes(1);
      const request = fetch.mock.calls[0][1];
      expect(request.headers["Idempotency-Key"]).toBe(
        `seiq-notification/${ids[0]}`,
      );
      expect(JSON.parse(request.body).text).not.toContain("金額");
      expect(
        (
          await prisma.appNotification.findUniqueOrThrow({
            where: { id: ids[0] },
          })
        ).emailStatus,
      ).toBe("SENT");
    });
    it("retries provider failures with the same key and payload", async () => {
      config();
      const ids = await notice(),
        fetch = vi
          .fn()
          .mockRejectedValueOnce(new Error("network"))
          .mockResolvedValue(
            new Response(JSON.stringify({ id: "retry-id" }), { status: 200 }),
          );
      vi.stubGlobal("fetch", fetch);
      await dispatchNotifications(ids);
      expect(
        (
          await prisma.appNotification.findUniqueOrThrow({
            where: { id: ids[0] },
          })
        ).emailStatus,
      ).toBe("FAILED");
      await prisma.appNotification.update({
        where: { id: ids[0] },
        data: { emailLastAttemptAt: new Date(Date.now() - 120000) },
      });
      vi.stubEnv("NOTIFICATION_FROM_EMAIL", "changed@example.test");
      await dispatchNotifications(ids);
      expect(fetch.mock.calls[0][1].body).toBe(fetch.mock.calls[1][1].body);
      expect(fetch.mock.calls[0][1].headers["Idempotency-Key"]).toBe(
        fetch.mock.calls[1][1].headers["Idempotency-Key"],
      );
    });
    it("stops uncertain retries after the deduplication safety window", async () => {
      config();
      const ids = await notice(),
        fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      await prisma.appNotification.update({
        where: { id: ids[0] },
        data: {
          emailStatus: "FAILED",
          emailAttempts: 1,
          emailFirstAttemptAt: new Date(Date.now() - 24 * 3600000),
          emailLastAttemptAt: new Date(Date.now() - 120000),
        },
      });
      await dispatchNotifications(ids);
      expect(fetch).not.toHaveBeenCalled();
      expect(
        (
          await prisma.appNotification.findUniqueOrThrow({
            where: { id: ids[0] },
          })
        ).emailStatus,
      ).toBe("NEEDS_REVIEW");
    });
  },
);
