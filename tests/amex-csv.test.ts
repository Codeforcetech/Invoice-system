import { describe, expect, it } from "vitest";
import {
  parseStatements,
  type CsvMapping,
} from "@/lib/accounting/statement-csv";

/** アメックスのCSVと同じ並び（利用日・処理日・ご利用内容・金額・空の列）。個人情報は含まない見本。 */
const header = "ご利用日,処理日,ご利用内容,金額,備考";
const rows = [
  '2026/01/18,2026/01/19,SLACK T09T9RSBE7R,"2,198",',
  "2026/01/18,2026/01/19,UBER EATS,1871,",
  "2026/01/17,2026/01/20,アマゾン ジャパン,458,",
  "2026/01/17,2026/01/20,アマゾン ジャパン,915,",
  '2026/01/16,2026/01/16,STUDIO INC.,"39,800",',
  '2026/01/13,2026/01/13,ご入金 ありがとうございます,"-407,101",',
];
const text = [header, ...rows].join("\r\n") + "\r\n";
const card: CsvMapping = {
  date: 0,
  description: 2,
  mode: "card",
  amount: 3,
  incoming: -1,
  outgoing: -1,
  reference: -1,
};

describe("Amex CSV (card mode)", () => {
  const parsed = parseStatements(text, card);
  it("reads slash dates, thousands separators and Japanese descriptions", () => {
    expect(parsed.map((r) => [r.date, r.description])).toEqual([
      ["2026-01-18", "SLACK T09T9RSBE7R"],
      ["2026-01-18", "UBER EATS"],
      ["2026-01-17", "アマゾン ジャパン"],
      ["2026-01-17", "アマゾン ジャパン"],
      ["2026-01-16", "STUDIO INC."],
      ["2026-01-13", "ご入金 ありがとうございます"],
    ]);
  });
  it("treats card usage (positive) as money spent, and a payment/refund (negative) as money back", () => {
    expect(parsed.map((r) => r.amount)).toEqual([
      -2198, -1871, -458, -915, -39800, 407101,
    ]);
  });
  it("keeps same-day rows with the same description apart", () => {
    expect(
      new Set(parsed.map((r) => `${r.date}|${r.description}|${r.amount}`)).size,
    ).toBe(6);
  });
});
