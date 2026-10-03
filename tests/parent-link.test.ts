import { describe, expect, it } from "vitest";
import { parentLink } from "@/lib/navigation/parent";

describe("parentLink (戻り先)", () => {
  it.each([
    ["/accounting/transactions/new", "/accounting"],
    ["/accounting/transactions/advanced", "/accounting/transactions/new"],
    ["/accounting/opening", "/accounting"],
    ["/accounting/assets", "/accounting"],
    ["/accounting/assets/new", "/accounting/assets"],
    ["/accounting/assets/abc123", "/accounting/assets"],
    ["/accounting/evidence", "/accounting"],
    ["/accounting/evidence/abc123", "/accounting/evidence"],
    ["/accounting/statements", "/accounting"],
    ["/accounting/linking", "/accounting"],
    ["/claims/new", "/claims"],
    ["/claims/team", "/claims"],
    ["/claims/abc123", "/claims"],
    ["/claims/abc123/edit", "/claims/abc123"],
    ["/companies/new", "/companies"],
    ["/companies/abc123", "/companies"],
    ["/expenses/new", "/expenses"],
    ["/expenses/abc123/edit", "/expenses"],
    ["/invoices/new", "/invoices"],
    ["/invoices/abc123", "/invoices"],
    ["/invoices/abc123/edit", "/invoices/abc123"],
    ["/settings/members", "/settings"],
    ["/settings/audit", "/settings/members"],
    ["/accounting/opening/", "/accounting"],
  ])("%s → %s", (path, to) => {
    expect(parentLink(path)?.href).toBe(to);
  });

  it("has no back link on pages opened from the sidebar", () => {
    for (const p of [
      "/dashboard",
      "/invoices",
      "/expenses",
      "/claims",
      "/accounting",
      "/companies",
      "/settings",
      "/guide",
      "/notifications",
      "/item-templates",
      "/mail-templates",
      "/admin/users",
      "/reports",
    ])
      expect(parentLink(p), p).toBeNull();
  });

  it("every back link has a label", () => {
    expect(parentLink("/claims/x/edit")?.label).toBe("申請の内容");
    expect(parentLink("/accounting/opening")?.label).toBe("会計・帳簿");
  });
});
