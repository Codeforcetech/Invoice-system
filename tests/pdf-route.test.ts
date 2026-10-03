import { beforeEach, expect, it, vi } from "vitest";
import { invoice, settings } from "./fixtures";
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  invoice: vi.fn(),
  settings: vi.fn(),
  render: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.user },
    invoice: { findFirst: mocks.invoice },
    systemSetting: { findUnique: mocks.settings },
  },
}));
vi.mock("@/lib/pdf/render-invoice", () => ({ renderInvoicePdf: mocks.render }));
import { GET } from "@/app/api/invoices/[invoiceId]/pdf/route";
const run = (id = "invoice-1", query = "") =>
  GET(new Request(`https://invoice.example/api/invoices/${id}/pdf${query}`), {
    params: Promise.resolve({ invoiceId: id }),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ sub: "owner" });
  mocks.user.mockResolvedValue({ id: "owner" });
  mocks.invoice.mockResolvedValue(invoice);
  mocks.settings.mockResolvedValue(settings);
  mocks.render.mockResolvedValue(Buffer.from("%PDF-1.7"));
});
it("requires authentication before querying invoices", async () => {
  mocks.session.mockResolvedValue(null);
  expect((await run()).status).toBe(401);
  expect(mocks.invoice).not.toHaveBeenCalled();
});
it("rejects removed accounts", async () => {
  mocks.user.mockResolvedValue(null);
  expect((await run()).status).toBe(401);
  expect(mocks.invoice).not.toHaveBeenCalled();
});
it("enforces owner scoping and returns 404 for other owners", async () => {
  mocks.invoice.mockResolvedValue(null);
  expect((await run("someone-elses-invoice")).status).toBe(404);
  expect(mocks.invoice.mock.calls[0][0].where).toEqual({
    id: "someone-elses-invoice",
    createdById: "owner",
  });
  expect(mocks.render).not.toHaveBeenCalled();
});
it("rejects malformed identifiers", async () => {
  expect((await run("../secret")).status).toBe(404);
  expect(mocks.invoice).not.toHaveBeenCalled();
});
it("prevents stale attachments", async () => {
  expect((await run("invoice-1", "?version=old")).status).toBe(409);
  expect(mocks.render).not.toHaveBeenCalled();
});
it("returns private noncacheable PDF attachment", async () => {
  const r = await run();
  expect(r.status).toBe(200);
  expect(r.headers.get("cache-control")).toContain("no-store");
  expect(r.headers.get("content-type")).toBe("application/pdf");
  expect(r.headers.get("content-disposition")).toBe(
    'attachment; filename="invoice-INV-202609-001.pdf"',
  );
  expect(mocks.settings.mock.calls[0][0].where).toEqual({ userId: "owner" });
});
it("bounds resource use for legacy large invoices", async () => {
  mocks.invoice.mockResolvedValue({
    ...invoice,
    items: Array(101).fill(invoice.items[0]),
  });
  expect((await run()).status).toBe(422);
  expect(mocks.render).not.toHaveBeenCalled();
});
it("does not leak internal exception details", async () => {
  mocks.render.mockRejectedValue(new Error("DATABASE_URL=secret"));
  const r = await run();
  expect(r.status).toBe(422);
  expect(await r.text()).not.toContain("secret");
});
