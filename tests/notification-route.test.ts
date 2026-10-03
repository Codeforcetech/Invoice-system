import { afterEach, it, expect, vi } from "vitest";
const mocked = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@/lib/notifications/service", () => ({
  dispatchNotifications: mocked.send,
}));
import { POST } from "@/app/api/internal/notifications/send/route";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it("denies missing or invalid job credentials, including multibyte tokens", async () => {
  vi.stubEnv("NOTIFICATION_JOB_SECRET", "");
  expect(
    (await POST(new Request("http://localhost", { method: "POST" }))).status,
  ).toBe(401);
  vi.stubEnv("NOTIFICATION_JOB_SECRET", "a".repeat(32));
  for (const token of [
    "",
    `Bearer ${"b".repeat(32)}`,
    `Bearer ${"é".repeat(32)}`,
  ])
    expect(
      (
        await POST(
          new Request("http://localhost", {
            method: "POST",
            headers: { authorization: token },
          }),
        )
      ).status,
    ).toBe(401);
  expect(mocked.send).not.toHaveBeenCalled();
});
it("runs the bounded delivery job only with its server secret", async () => {
  vi.stubEnv("NOTIFICATION_JOB_SECRET", "a".repeat(32));
  mocked.send.mockResolvedValue({ configured: true, sent: 2 });
  const r = await POST(
    new Request("http://localhost", {
      method: "POST",
      headers: { authorization: `Bearer ${"a".repeat(32)}` },
    }),
  );
  expect(r.status).toBe(200);
  expect(r.headers.get("cache-control")).toBe("no-store");
  expect(await r.json()).toEqual({ configured: true, sent: 2 });
});
