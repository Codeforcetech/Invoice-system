import { z } from "zod";
import { daySchema } from "@/lib/accounting/model";

export const methods = {
  STRAIGHT: "定額法",
  DECLINING: "200％定率法",
  NONE: "償却しない（土地など）",
} as const;
export const monthSchema = z
  .string()
  .regex(/^20\d{2}-(0[1-9]|1[0-2])$/, "対象月を選択してください");
export const assetSchema = z
  .object({
    id: z.string().uuid(),
    version: z.string().optional(),
    name: z.string().trim().min(1, "資産名を入力してください").max(120),
    acquiredDate: daySchema,
    serviceDate: daySchema,
    cost: z.coerce.number().int().min(1).max(2147483647),
    usefulLife: z.coerce.number().int().min(2).max(50),
    method: z.enum(["STRAIGHT", "DECLINING", "NONE"]),
    fiscalStartMonth: z.coerce.number().int().min(1).max(12),
    assetAccountId: z.string().min(1),
    expenseAccountId: z.string().min(1),
    note: z.string().trim().max(2000).default(""),
  })
  .superRefine((v, ctx) => {
    if (v.serviceDate < v.acquiredDate)
      ctx.addIssue({
        code: "custom",
        message: "使用開始日は取得日以降にしてください",
        path: ["serviceDate"],
      });
    const min = v.method === "DECLINING" ? "2012-04-01" : "2007-04-01";
    if (v.method !== "NONE" && v.acquiredDate < min)
      ctx.addIssue({
        code: "custom",
        message: `${methods[v.method]}は${min}以降の取得資産に対応しています`,
        path: ["acquiredDate"],
      });
    if (v.method !== "NONE" && v.cost < 2)
      ctx.addIssue({
        code: "custom",
        message: "償却する資産は2円以上で登録してください",
        path: ["cost"],
      });
  });
export type AssetInput = z.infer<typeof assetSchema>;
export type CalculationAsset = Pick<
  AssetInput,
  "cost" | "method" | "usefulLife" | "serviceDate" | "fiscalStartMonth"
>;

// NTA 2025 rate table, page 5. Integer units avoid floating point money.
// https://www.nta.go.jp/taxes/shiraberu/shinkoku/tebiki/2025/pdf/034.pdf
// Columns: straight / 1000, declining / 1000, revised / 1000, guarantee / 100000.
const rates = [
  [500, 1000, 1000, 0],
  [334, 667, 1000, 11089],
  [250, 500, 1000, 12499],
  [200, 400, 500, 10800],
  [167, 333, 334, 9911],
  [143, 286, 334, 8680],
  [125, 250, 334, 7909],
  [112, 222, 250, 7126],
  [100, 200, 250, 6552],
  [91, 182, 200, 5992],
  [84, 167, 200, 5566],
  [77, 154, 167, 5180],
  [72, 143, 167, 4854],
  [67, 133, 143, 4565],
  [63, 125, 143, 4294],
  [59, 118, 125, 4038],
  [56, 111, 112, 3884],
  [53, 105, 112, 3693],
  [50, 100, 112, 3486],
  [48, 95, 100, 3335],
  [46, 91, 100, 3182],
  [44, 87, 91, 3052],
  [42, 83, 84, 2969],
  [40, 80, 84, 2841],
  [39, 77, 84, 2716],
  [38, 74, 77, 2624],
  [36, 71, 72, 2568],
  [35, 69, 72, 2463],
  [34, 67, 72, 2366],
  [33, 65, 67, 2286],
  [32, 63, 67, 2216],
  [31, 61, 63, 2161],
  [30, 59, 63, 2097],
  [29, 57, 59, 2051],
  [28, 56, 59, 1974],
  [28, 54, 56, 1950],
  [27, 53, 56, 1882],
  [26, 51, 53, 1860],
  [25, 50, 53, 1791],
  [25, 49, 50, 1741],
  [24, 48, 50, 1694],
  [24, 47, 48, 1664],
  [23, 45, 46, 1664],
  [23, 44, 46, 1634],
  [22, 43, 44, 1601],
  [22, 43, 44, 1532],
  [21, 42, 44, 1499],
  [21, 41, 42, 1475],
  [20, 40, 42, 1440],
] as const;
export function assetRates(life: number) {
  if (!Number.isInteger(life) || life < 2 || life > 50)
    throw new Error("耐用年数は2〜50年で指定してください");
  return rates[life - 2];
}
export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}
export function monthEnd(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
export function fiscalYear(month: string, start: number) {
  return Number(month.slice(0, 4)) - (Number(month.slice(5)) < start ? 1 : 0);
}
export function fiscalMonths(year: number, start: number) {
  const first = `${year}-${String(start).padStart(2, "0")}`;
  return Array.from({ length: 12 }, (_, i) => shiftMonth(first, i));
}
export type ScheduleRow = {
  month: string;
  amount: number;
  closing: number;
  revised: boolean;
};
// Full fiscal years (12 months), tangible assets, 100% business use.
// Floor cumulative monthly depreciation: monthly and annual posting totals agree.
export function depreciationSchedule(
  a: CalculationAsset,
  throughMonth: string,
): ScheduleRow[] {
  monthSchema.parse(throughMonth);
  daySchema.parse(a.serviceDate);
  const [straight, declining, revised, guarantee] = assetRates(a.usefulLife);
  if (
    !Number.isInteger(a.cost) ||
    a.cost < 1 ||
    a.cost > 2147483647 ||
    !Number.isInteger(a.fiscalStartMonth) ||
    a.fiscalStartMonth < 1 ||
    a.fiscalStartMonth > 12
  )
    throw new Error("計算条件が不正です");
  if (a.method === "NONE") return [];
  if (a.method !== "STRAIGHT" && a.method !== "DECLINING")
    throw new Error("償却方法が不正です");
  const first = a.serviceDate.slice(0, 7);
  let balance = a.cost,
    revisedBase: number | null = null;
  const result: ScheduleRow[] = [];
  for (
    let year = fiscalYear(first, a.fiscalStartMonth);
    year <= fiscalYear(throughMonth, a.fiscalStartMonth);
    year++
  ) {
    const opening = balance;
    let numerator = a.cost * straight;
    if (a.method === "DECLINING") {
      if (
        revisedBase === null &&
        opening * declining * 100 < a.cost * guarantee
      )
        revisedBase = opening;
      numerator =
        revisedBase === null ? opening * declining : revisedBase * revised;
    }
    let usedMonths = 0,
      allocated = 0;
    for (const month of fiscalMonths(year, a.fiscalStartMonth)) {
      if (month < first || month > throughMonth) continue;
      usedMonths++;
      const cumulative = Math.min(
        opening - 1,
        Math.floor((numerator * usedMonths) / 12000),
      );
      const amount = cumulative - allocated;
      allocated = cumulative;
      balance -= amount;
      result.push({
        month,
        amount,
        closing: balance,
        revised: revisedBase !== null,
      });
    }
  }
  return result;
}
