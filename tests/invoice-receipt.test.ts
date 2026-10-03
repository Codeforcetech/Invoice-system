import { describe, it, expect } from "vitest";
import { receiptSchema, receiptLabel } from "@/lib/invoice/receipt";
const base = { invoiceId: "inv-test", version: "2026-09-01T00:00:00.000Z" };
describe("receipt validation and labels", () => {
  it("rejects future, impossible and malformed dates", () => {
    for (const receivedDate of [
      "2099-01-01",
      "2026-02-30",
      "2026-13-01",
      "invalid",
    ])
      expect(receiptSchema.safeParse({ ...base, receivedDate }).success).toBe(
        false,
      );
    expect(
      receiptSchema.safeParse({ ...base, receivedDate: "2026-01-01" }).success,
    ).toBe(true);
    expect(receiptSchema.safeParse({ ...base, receivedDate: "" }).success).toBe(
      true,
    );
  });
  it("keeps issue status distinct and treats legacy receipts as unconfirmed", () => {
    expect(receiptLabel("DRAFT", null, "2026-09-01", "2026-09-17")).toBe(
      "発行前",
    );
    expect(receiptLabel("ISSUED", null, "2026-09-17", "2026-09-17")).toBe(
      "未入金・未確認",
    );
    expect(receiptLabel("ISSUED", null, "2026-09-16", "2026-09-17")).toBe(
      "期限超過・未確認",
    );
    expect(
      receiptLabel("ISSUED", "2026-09-15", "2026-09-16", "2026-09-17"),
    ).toBe("入金済み");
  });
});
