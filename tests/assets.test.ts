import { describe, it, expect } from "vitest";
import {
  assetRates,
  assetSchema,
  depreciationSchedule,
  fiscalMonths,
  fiscalYear,
  monthEnd,
  type AssetInput,
} from "@/lib/assets/model";
const base: AssetInput = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "設備",
  acquiredDate: "2020-01-01",
  serviceDate: "2020-01-01",
  cost: 1000000,
  method: "STRAIGHT",
  usefulLife: 5,
  fiscalStartMonth: 1,
  assetAccountId: "a",
  expenseAccountId: "b",
  note: "",
};
describe("fixed asset calculation", () => {
  it("calculates published straight-line and 200% declining examples, including revised basis", () => {
    const annual = (method: "STRAIGHT" | "DECLINING") => {
      const rows = depreciationSchedule({ ...base, method }, "2024-12");
      return [2020, 2021, 2022, 2023, 2024].map((y) =>
        rows
          .filter((r) => r.month.startsWith(String(y)))
          .reduce((s, r) => s + r.amount, 0),
      );
    };
    expect(annual("STRAIGHT")).toEqual([
      200000, 200000, 200000, 200000, 199999,
    ]);
    expect(annual("DECLINING")).toEqual([
      400000, 240000, 144000, 108000, 107999,
    ]);
    const rows = depreciationSchedule(
      { ...base, method: "DECLINING" },
      "2024-12",
    );
    expect(rows.find((r) => r.month === "2023-01")?.revised).toBe(true);
    expect(rows.at(-1)?.closing).toBe(1);
  });
  it("uses published rounded rates rather than floating division", () => {
    expect(assetRates(3)[0]).toBe(334);
    expect(assetRates(9)[0]).toBe(112);
    expect(assetRates(27)[0]).toBe(38);
    expect(assetRates(37)[0]).toBe(28);
    expect(() => assetRates(51)).toThrow();
  });
  it("includes a partial service month, apportions fiscal year, and preserves annual/monthly equality", () => {
    const a = { ...base, serviceDate: "2020-09-30", fiscalStartMonth: 4 };
    const rows = depreciationSchedule(a, "2021-03");
    expect(rows).toHaveLength(7);
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(116666);
    for (let i = 0; i < rows.length; i++)
      expect(depreciationSchedule(a, rows[i].month)).toEqual(
        rows.slice(0, i + 1),
      );
    expect(fiscalYear("2021-03", 4)).toBe(2020);
    expect(fiscalMonths(2020, 4).at(-1)).toBe("2021-03");
  });
  it("has no depreciation before service or for nondepreciable assets", () => {
    expect(depreciationSchedule(base, "2019-12")).toEqual([]);
    expect(
      depreciationSchedule({ ...base, method: "NONE" }, "2025-12"),
    ).toEqual([]);
    expect(monthEnd("2024-02")).toBe("2024-02-29");
  });
  it("never exceeds cost less one yen, for all supported lives and methods", () => {
    for (const method of ["STRAIGHT", "DECLINING"] as const)
      for (let life = 2; life <= 50; life++)
        for (const cost of [2, 101, 300001, 2147483647]) {
          const rows = depreciationSchedule(
            {
              ...base,
              cost,
              usefulLife: life,
              method,
              serviceDate: "2020-11-28",
              fiscalStartMonth: 4,
            },
            "2080-12",
          );
          expect(
            rows.every(
              (r) =>
                Number.isInteger(r.amount) && r.amount >= 0 && r.closing >= 1,
            ),
          ).toBe(true);
          expect(
            rows.reduce((s, r) => s + r.amount, 0) + rows.at(-1)!.closing,
          ).toBe(cost);
        }
  });
  it("rejects old methods, impossible dates, negative/fractional amounts and unsupported lives", () => {
    for (const change of [
      { cost: 1.5 },
      { cost: -1 },
      { usefulLife: 1 },
      { usefulLife: 51 },
      { method: "BAD" },
      { acquiredDate: "2020-02-30" },
      { serviceDate: "2019-12-31" },
      { acquiredDate: "2010-01-01", method: "DECLINING" },
    ])
      expect(assetSchema.safeParse({ ...base, ...change }).success).toBe(false);
  });
});
