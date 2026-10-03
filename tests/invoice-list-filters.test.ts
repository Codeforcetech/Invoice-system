import { afterEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ user: vi.fn(), findMany: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: mock.user }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { invoice: { findMany: mock.findMany }, workspaceMember: { findUnique: async () => null } } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { listInvoices } from "@/actions/invoice-actions";
afterEach(() => vi.clearAllMocks());
it("keeps owner restriction when drilling into a company and month, including an unowned company ID", async () => {
  mock.user.mockResolvedValue({ id: "owner-a" }); mock.findMany.mockResolvedValue([]);
  await listInvoices({ fromMonth: "2026-12", toMonth: "2026-12", companyId: "other-company", status: "ISSUED" });
  expect(mock.findMany.mock.calls[0][0].where).toEqual({ createdById: "owner-a", mergedIntoId: null, companyId: "other-company", status: "ISSUED", issueDate: { gte: new Date("2026-12-01"), lt: new Date("2027-01-01") } });
});
it("rejects invalid dates before issuing a database query", async () => {
  mock.user.mockResolvedValue({ id: "owner-a" });
  await expect(listInvoices({ fromMonth: "2026-09", toMonth: "2026-08" })).rejects.toThrow("期間");
  expect(mock.findMany).not.toHaveBeenCalled();
});
