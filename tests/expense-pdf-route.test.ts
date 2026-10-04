import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ session: vi.fn(), pdf: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getSession: mock.session }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    expenseAttachment: { findFirst: mock.pdf },
    workspaceMember: { findUnique: async () => null },
  },
}));
import { GET } from "@/app/api/expenses/[expenseId]/pdf/route";
const run = (expenseId = "11111111-1111-4111-8111-111111111111") =>
  GET(new Request("http://localhost/api/expenses/x/pdf"), {
    params: Promise.resolve({ expenseId }),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mock.session.mockResolvedValue({ sub: "owner-a" });
  mock.pdf.mockResolvedValue(null);
});
it("blocks unauthenticated attachment requests", async () => {
  mock.session.mockResolvedValue(null);
  expect((await run()).status).toBe(401);
  expect(mock.pdf).not.toHaveBeenCalled();
});
it("scopes attachment access to owner and conceals other users' records", async () => {
  expect((await run()).status).toBe(404);
  expect(mock.pdf.mock.calls[0][0].where).toEqual({
    expenseId: "11111111-1111-4111-8111-111111111111",
    expense: { userId: "owner-a" },
  });
});
it("rejects invalid IDs before querying", async () => {
  expect((await run("../secret")).status).toBe(404);
  expect(mock.pdf).not.toHaveBeenCalled();
});
it("downloads PDFs privately, without executing in the app origin", async () => {
  mock.pdf.mockResolvedValue({
    filename: "請求書.pdf",
    data: new Uint8Array([37, 80, 68, 70]),
    expense: {
      supplier: "山田太郎",
      costMonth: "2026-09",
      description: "業務委託料",
    },
  });
  const res = await run();
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toContain("no-store");
  expect(res.headers.get("content-disposition")).toContain("attachment;");
  // 誰から・いつ・何のPDFかが、ダウンロード名で分かる。
  expect(
    decodeURIComponent(
      res.headers.get("content-disposition")!.split("UTF-8''")[1],
    ),
  ).toBe("山田太郎_2026-09_業務委託料.pdf");
  expect(res.headers.get("content-security-policy")).toContain("sandbox");
});
