import { it, expect, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  report: vi.fn(),
  pdf: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { user: { findUnique: mocks.user } },
}));
vi.mock("@/lib/accounting/reports", async (original) => ({
  ...(await original()),
  accountingReport: mocks.report,
}));
vi.mock("@/lib/pdf/render-accounting", () => ({
  renderAccountingPdf: mocks.pdf,
}));
import { GET } from "@/app/api/accounting/export/route";
const url =
  "http://localhost/api/accounting/export?view=journal&from=2026-01-01&to=2026-09-30&format=csv";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ sub: "owner-a" });
  mocks.user.mockResolvedValue({ id: "owner-a" });
  mocks.report.mockResolvedValue({
    title: "仕訳帳",
    f: { view: "journal", from: "2026-01-01", to: "2026-09-30" },
    headers: ["摘要", "金額"],
    rows: [["=unsafe", 100]],
  });
});
it("rejects unauthenticated and deleted users before reading journals", async () => {
  mocks.session.mockResolvedValue(null);
  expect((await GET(new Request(url))).status).toBe(401);
  expect(mocks.report).not.toHaveBeenCalled();
  mocks.session.mockResolvedValue({ sub: "deleted" });
  mocks.user.mockResolvedValue(null);
  expect((await GET(new Request(url))).status).toBe(401);
});
it("scopes export to authenticated owner and sends private safe CSV", async () => {
  const r = await GET(new Request(url + "&userId=other"));
  expect(r.status).toBe(200);
  expect(mocks.report.mock.calls[0][0]).toBe("owner-a");
  expect(r.headers.get("cache-control")).toContain("no-store");
  expect(r.headers.get("content-disposition")).toContain("attachment");
  expect(await r.text()).toContain("'=unsafe");
});
it("rejects invalid periods before querying", async () => {
  expect(
    (await GET(new Request(url.replace("2026-01-01", "2026-02-30")))).status,
  ).toBe(400);
  expect(mocks.report).not.toHaveBeenCalled();
});
it("bounds PDF rendering and returns PDF on valid reports", async () => {
  mocks.report.mockResolvedValueOnce({ rows: Array(1001).fill([]) });
  expect((await GET(new Request(url.replace("csv", "pdf")))).status).toBe(422);
  expect(mocks.pdf).not.toHaveBeenCalled();
  mocks.pdf.mockResolvedValue(Buffer.from("%PDF-1.7"));
  const r = await GET(new Request(url.replace("csv", "pdf")));
  expect(r.headers.get("content-type")).toBe("application/pdf");
  expect(await r.text()).toBe("%PDF-1.7");
});
