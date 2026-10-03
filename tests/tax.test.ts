import { describe, expect, it } from "vitest";
import { normalizeRegistrationNumber } from "@/lib/tax/registration-number";
import {
  TAX_CATEGORIES,
  effectiveRateBps,
  isTaxCategory,
  taxCategoryInfo,
} from "@/lib/tax/categories";
import { createSettingsSchema } from "@/lib/validators/settings";

describe("registration number", () => {
  it("accepts T and 13 digits", () => {
    expect(normalizeRegistrationNumber("T1234567890123")).toEqual({
      ok: true,
      value: "T1234567890123",
    });
  });

  it("normalizes width, case, spaces and hyphens", () => {
    for (const raw of [
      "t1234567890123",
      "Ｔ１２３４５６７８９０１２３",
      " T 1234-5678-90123 ",
      "T1234567890123\n",
    ])
      expect(normalizeRegistrationNumber(raw)).toEqual({
        ok: true,
        value: "T1234567890123",
      });
  });

  it("treats empty and null as no registration", () => {
    for (const raw of [null, undefined, "", "   ", "　"])
      expect(normalizeRegistrationNumber(raw)).toEqual({
        ok: true,
        value: null,
      });
  });

  it("rejects wrong lengths, missing T and other text", () => {
    for (const raw of [
      "T123456789012",
      "T12345678901234",
      "1234567890123",
      "TT1234567890123",
      "T12345678901AB",
      "登録番号取得予定",
      "T１２３",
    ])
      expect(normalizeRegistrationNumber(raw).ok).toBe(false);
  });
});

describe("tax categories", () => {
  it("defines the five categories with their rates", () => {
    expect([...TAX_CATEGORIES]).toEqual([
      "TAXABLE_10",
      "TAXABLE_8",
      "EXEMPT",
      "NON_TAXABLE",
      "TAX_FREE",
    ]);
    expect(taxCategoryInfo.TAXABLE_10).toMatchObject({
      rateBps: 1000,
      taxable: true,
      reduced: false,
    });
    expect(taxCategoryInfo.TAXABLE_8).toMatchObject({
      rateBps: 800,
      taxable: true,
      reduced: true,
    });
    for (const c of ["EXEMPT", "NON_TAXABLE", "TAX_FREE"] as const)
      expect(taxCategoryInfo[c]).toMatchObject({ rateBps: 0, taxable: false });
  });

  it("only the reduced rate carries the ※ mark", () => {
    for (const c of TAX_CATEGORIES)
      expect(taxCategoryInfo[c].short.includes("※")).toBe(
        taxCategoryInfo[c].reduced,
      );
  });

  it("inherits the invoice's rate when the line has no category, so existing amounts stay the same", () => {
    expect(effectiveRateBps(null, 1000)).toBe(1000);
    expect(effectiveRateBps(undefined, 800)).toBe(800);
    expect(effectiveRateBps("not-a-category", 1000)).toBe(1000);
    expect(effectiveRateBps("TAXABLE_8", 1000)).toBe(800);
    expect(effectiveRateBps("EXEMPT", 1000)).toBe(0);
  });

  it("recognizes only known categories", () => {
    expect(isTaxCategory("TAXABLE_10")).toBe(true);
    expect(isTaxCategory("taxable_10")).toBe(false);
    expect(isTaxCategory(null)).toBe(false);
  });
});

describe("settings schema registration number", () => {
  const base = { companyName: "テスト株式会社", taxRate: 1000 };
  const parse = (v: unknown, legacy?: string | null) =>
    createSettingsSchema(legacy).safeParse({
      ...base,
      invoiceRegistrationNumber: v,
    });

  it("stores the normalized form", () => {
    const r = parse("ｔ１２３４５６７８９０１２３");
    expect(r.success && r.data.invoiceRegistrationNumber).toBe(
      "T1234567890123",
    );
  });

  it("stores empty as null", () => {
    const r = parse("");
    expect(r.success && r.data.invoiceRegistrationNumber).toBeNull();
  });

  it("rejects a bad value with a message that explains the format", () => {
    const r = parse("登録予定");
    expect(r.success).toBe(false);
    expect(!r.success && r.error.issues[0].message).toMatch(/T.*13桁/);
    expect(!r.success && r.error.issues[0].path).toEqual([
      "invoiceRegistrationNumber",
    ]);
  });

  it("keeps a previously saved non-standard value as long as it is unchanged", () => {
    const r = parse("登録予定", "登録予定");
    expect(r.success && r.data.invoiceRegistrationNumber).toBe("登録予定");
    expect(parse("登録予定です", "登録予定").success).toBe(false);
  });
});
