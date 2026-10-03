vi.mock("@/actions/expense-actions", () => ({
  listExpenses: vi.fn().mockResolvedValue([]),
}));
import { afterEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  user: vi.fn(),
  companies: vi.fn(),
  count: vi.fn(),
  groups: vi.fn(),
  recent: vi.fn(),
  settings: vi.fn(),
}));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: mock.user }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    workspaceMember: { findUnique: async () => null },
    company: { findMany: mock.companies },
    invoice: { count: mock.count, groupBy: mock.groups, findMany: mock.recent },
    systemSetting: { findUnique: mock.settings },
  },
}));
import DashboardPage from "@/app/(app)/dashboard/page";
afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});
function setup() {
  mock.user.mockResolvedValue({ id: "owner-a", name: "担当者" });
  mock.companies.mockResolvedValue([]);
  mock.count.mockResolvedValue(0);
  mock.groups.mockResolvedValue([]);
  mock.recent.mockResolvedValue([]);
  mock.settings.mockResolvedValue(null);
}
it("scopes all dashboard data to the authenticated owner, only aggregates issued invoices, and uses the Japanese current month", async () => {
  setup();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-12-31T16:00:00Z"));
  const result = await DashboardPage({
    searchParams: Promise.resolve({ companyId: "foreign-company" }),
  });
  expect(mock.companies.mock.calls[0][0].where).toEqual({ userId: "owner-a" });
  expect(mock.count.mock.calls.map((c) => c[0].where)).toEqual([
    { createdById: "owner-a", mergedIntoId: null },
    { createdById: "owner-a", mergedIntoId: null, status: "DRAFT" },
    { createdById: "owner-a", mergedIntoId: null, status: "CONFIRMED" },
  ]);
  expect(mock.groups.mock.calls[0][0].where).toEqual({
    createdById: "owner-a",
    mergedIntoId: null,
    status: "ISSUED",
    company: { userId: "owner-a" },
    companyId: "foreign-company",
    issueDate: {
      gte: new Date("2026-02-01T00:00:00Z"),
      lt: new Date("2027-02-01T00:00:00Z"),
    },
  });
  expect(mock.recent.mock.calls[0][0]).toMatchObject({
    where: { createdById: "owner-a", mergedIntoId: null },
    take: 6,
  });
  expect(mock.settings.mock.calls[0][0].where).toEqual({ userId: "owner-a" });
  expect(result.props.data.filters).toMatchObject({
    from: "2027-01",
    to: "2027-01",
  });
});
it("renders empty accounts without inventing revenue or creating settings", async () => {
  setup();
  const result = await DashboardPage({});
  expect(result.props.data).toMatchObject({
    sales: { total: 0, count: 0, change: null },
    companyCount: 0,
    draftCount: 0,
    recent: [],
    setup: { company: false, bank: false, email: false },
  });
});
it("does not query data when authentication fails", async () => {
  mock.user.mockRejectedValueOnce(new Error("login required"));
  await expect(DashboardPage({})).rejects.toThrow("login required");
  expect(mock.groups).not.toHaveBeenCalled();
  expect(mock.recent).not.toHaveBeenCalled();
});
