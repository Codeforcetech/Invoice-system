import { describe, it, expect } from "vitest";
import {
  journalSchema,
  invoiceDateText,
  dateText,
  csv,
  templateAccounts,
  debitNormal,
} from "@/lib/accounting/model";
const valid = {
  requestKey: "11111111-1111-4111-8111-111111111111",
  date: "2026-09-27",
  memo: "test",
  lines: [
    { accountId: "a", debit: 1100, credit: 0 },
    { accountId: "b", debit: 0, credit: 1100 },
  ],
};
describe("accounting rules", () => {
  it("accepts balanced compound journals in whole yen", () => {
    expect(journalSchema.safeParse(valid).success).toBe(true);
    expect(
      journalSchema.safeParse({
        ...valid,
        lines: [
          { accountId: "a", debit: 1000, credit: 0 },
          { accountId: "c", debit: 100, credit: 0 },
          { accountId: "b", debit: 0, credit: 1100 },
        ],
      }).success,
    ).toBe(true);
  });
  it("rejects unbalanced, negative, fractional, zero and double-sided lines", () => {
    for (const line of [
      { accountId: "a", debit: 1099, credit: 0 },
      { accountId: "a", debit: -1100, credit: 0 },
      { accountId: "a", debit: 1100.1, credit: 0 },
      { accountId: "a", debit: 0, credit: 0 },
      { accountId: "a", debit: 1100, credit: 1100 },
    ])
      expect(
        journalSchema.safeParse({ ...valid, lines: [line, valid.lines[1]] })
          .success,
      ).toBe(false);
  });
  it("rejects impossible dates and excessive lines", () => {
    expect(
      journalSchema.safeParse({ ...valid, date: "2026-02-30" }).success,
    ).toBe(false);
    expect(
      journalSchema.safeParse({
        ...valid,
        lines: Array(102).fill(valid.lines[0]),
      }).success,
    ).toBe(false);
  });
  it("supplies distinct industry templates without duplicate account codes", () => {
    for (const t of ["SERVICE", "RETAIL", "CONSTRUCTION"]) {
      const a = templateAccounts(t);
      expect(new Set(a.map((x) => x.code)).size).toBe(a.length);
      expect(a.some((x) => x.code === "120")).toBe(true);
    }
    expect(templateAccounts("RETAIL").some((a) => a.name === "商品")).toBe(
      true,
    );
  });
  it("protects CSV formulas while preserving integer amounts and quotes", () => {
    expect(csv([["=cmd", 'a"b', -100]])).toBe('\uFEFF"\'=cmd","a""b","-100"');
  });
  it("defines normal balances", () => {
    expect(debitNormal("ASSET")).toBe(true);
    expect(debitNormal("LIABILITY")).toBe(false);
  });
});

it("preserves Japan invoice calendar dates across UTC boundaries", () => {
  expect(invoiceDateText("2026-08-31T15:00:00.000Z")).toBe("2026-09-01");
  expect(dateText("2026-09-01T00:00:00.000Z")).toBe("2026-09-01");
});
