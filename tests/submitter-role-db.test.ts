import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ id: "subr-test-owner" }));
vi.mock("@/lib/auth/require-user", () => ({
  requireUser: async () => ({ id: auth.id }),
}));
vi.mock("@/lib/auth/session", () => ({
  getSession: async () => ({ sub: auth.id }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error("REDIRECT:" + to);
  },
}));
import { prisma } from "@/lib/db/prisma";
import { purgeAudit } from "./audit-cleanup";
import { hasRole, WORKSPACE_ROLES } from "@/lib/workspace/access";
import {
  requireWorkspace,
  requireWorkspacePage,
} from "@/lib/auth/require-workspace";
import { GET as evidenceGet } from "@/app/api/evidence/[evidenceId]/route";
import { GET as expensePdf } from "@/app/api/expenses/[expenseId]/pdf/route";
import { GET as invoicePdf } from "@/app/api/invoices/[invoiceId]/pdf/route";
import { GET as accountingExport } from "@/app/api/accounting/export/route";
import { GET as monthlyCsv } from "@/app/api/accounting/monthly-csv/route";
import { GET as receiptsZip } from "@/app/api/accounting/receipts-zip/route";
import { roleDenied } from "@/lib/auth/route-guard";

const owner = "subr-test-owner",
  contractor = "subr-test-contractor",
  viewer = "subr-test-viewer",
  users = [owner, contractor, viewer];
const as = (id: string) => {
  auth.id = id;
};
async function cleanup() {
  await purgeAudit(users);
  await prisma.workspaceMember.deleteMany({ where: { ownerId: owner } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
}

describe("role order", () => {
  it("puts the contractor (SUBMITTER) below every role that can see company data", () => {
    expect(WORKSPACE_ROLES[0]).toBe("SUBMITTER");
    expect(hasRole("SUBMITTER", "VIEWER")).toBe(false);
    expect(hasRole("SUBMITTER", "SUBMITTER")).toBe(true);
    for (const r of ["VIEWER", "EDITOR", "APPROVER", "ADMIN"] as const)
      expect(hasRole(r, "SUBMITTER")).toBe(true);
    expect(roleDenied("SUBMITTER")?.status).toBe(403);
    expect(roleDenied("VIEWER")).toBeNull();
  });
});

describe.skipIf(process.env.RUN_ACCOUNTING_DB_TESTS !== "1")(
  "contractor (SUBMITTER) access",
  () => {
    beforeAll(async () => {
      await cleanup();
      for (const id of users)
        await prisma.user.create({
          data: {
            id,
            name: id,
            email: id + "@example.test",
            passwordHash: "no-login",
          },
        });
      await prisma.workspaceMember.create({
        data: { ownerId: owner, userId: contractor, role: "SUBMITTER" },
      });
      await prisma.workspaceMember.create({
        data: { ownerId: owner, userId: viewer, role: "VIEWER" },
      });
    });
    afterAll(cleanup);

    it("can be stored as a member role, and cannot pass any role check for company data", async () => {
      as(contractor);
      await expect(requireWorkspace("VIEWER")).rejects.toThrow();
      await expect(requireWorkspace("EDITOR")).rejects.toThrow();
      await expect(requireWorkspace("SUBMITTER")).resolves.toMatchObject({
        ownerId: owner,
        role: "SUBMITTER",
      });
    });

    it("is sent to the submission page, not the dashboard, when a page is off-limits", async () => {
      as(contractor);
      await expect(requireWorkspacePage("VIEWER")).rejects.toThrow(
        "REDIRECT:/submit",
      );
      as(viewer);
      await expect(requireWorkspacePage("EDITOR")).rejects.toThrow(
        "REDIRECT:/dashboard",
      );
    });

    it("is refused by every route that returns company data", async () => {
      as(contractor);
      const url = (p: string) => new Request("http://localhost" + p);
      const ctx = <T extends string>(k: T) => ({
        params: Promise.resolve({ [k]: "x1234" } as Record<T, string>),
      });
      const results = await Promise.all([
        evidenceGet(url("/api/evidence/x1234"), ctx("evidenceId")),
        expensePdf(url("/api/expenses/x1234/pdf"), ctx("expenseId")),
        invoicePdf(url("/api/invoices/x1234/pdf"), ctx("invoiceId")),
        accountingExport(
          url(
            "/api/accounting/export?view=journal&from=2026-01-01&to=2026-12-31&format=csv",
          ),
        ),
        monthlyCsv(url("/api/accounting/monthly-csv?month=2026-09")),
        receiptsZip(url("/api/accounting/receipts-zip?month=2026-09")),
      ]);
      expect(results.map((r) => r.status)).toEqual([
        403, 403, 403, 403, 403, 403,
      ]);
    });

    it("keeps working for an ordinary viewer (not refused by the new guard)", async () => {
      as(viewer);
      const r = await expensePdf(
        new Request("http://localhost/api/expenses/x1234/pdf"),
        { params: Promise.resolve({ expenseId: "x1234" }) },
      );
      expect(r.status).toBe(404);
    });
  },
);
