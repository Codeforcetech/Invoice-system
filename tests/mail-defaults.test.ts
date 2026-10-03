import { expect, it, vi, beforeEach } from "vitest";
import { invoice, settings } from "./fixtures";
const m = vi.hoisted(() => ({
  requireUser: vi.fn(),
  find: vi.fn(),
  settings: vi.fn(),
}));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: m.requireUser }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { invoice: { findFirst: m.find } },
}));
vi.mock("@/lib/settings/system-setting", () => ({
  getOrCreateSystemSetting: m.settings,
}));
import { getInvoiceMailDefaults } from "@/actions/invoice-mail-actions";
beforeEach(() => {
  vi.clearAllMocks();
  m.requireUser.mockResolvedValue({ id: "owner" });
  m.find.mockResolvedValue(invoice);
  m.settings.mockResolvedValue(settings);
});
it("uses the registered sender and tenant-owned recipient, without public share URLs", async () => {
  const result = await getInvoiceMailDefaults({ invoiceId: "invoice-1" });
  expect(result.defaultFrom).toBe(settings.email);
  expect(result.defaultTo).toBe(invoice.company.billingEmail);
  expect(m.find.mock.calls[0][0].where).toEqual({
    id: "invoice-1",
    createdById: "owner",
  });
  expect(result.vars.print_url).not.toContain("http");
});
it("rejects an inaccessible invoice", async () => {
  m.find.mockResolvedValue(null);
  await expect(
    getInvoiceMailDefaults({ invoiceId: "other" }),
  ).rejects.toThrow();
  expect(m.settings).not.toHaveBeenCalled();
});
