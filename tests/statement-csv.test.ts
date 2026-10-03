import { describe, expect, it } from "vitest";
import {
  csvCells,
  parseStatements,
  normalizeDescription,
  type CsvMapping,
} from "@/lib/accounting/statement-csv";
import { statementFingerprint } from "@/lib/accounting/statements";
const mapping: CsvMapping = {
  date: 0,
  description: 1,
  mode: "split",
  incoming: 2,
  outgoing: 3,
  amount: -1,
  reference: -1,
};
describe("statement CSV", () => {
  it("reads BOM, CRLF, quoted commas, quotes and newlines", () => {
    expect(
      csvCells(
        '\uFEFF日付,摘要,入金,出金\r\n2026/9/1,"店舗,\n""A""",0,"1,200"\r\n',
      ),
    ).toEqual([
      ["日付", "摘要", "入金", "出金"],
      ["2026/9/1", '店舗,\n"A"', "0", "1,200"],
    ]);
    expect(
      parseStatements(
        '日付,摘要,入金,出金\n2026年9月1日,店舗,0,"￥1,200円"',
        mapping,
      )[0],
    ).toMatchObject({ date: "2026-09-01", amount: -1200 });
  });
  it("preserves repeated transactions using occurrence, and stable IDs across reordering", () => {
    const rows = parseStatements(
      "日付,摘要,入金,出金\n2026/9/1,同じ,100,0\n2026/9/1,同じ,100,0",
      mapping,
    );
    expect(rows.map((r) => r.occurrence)).toEqual([1, 2]);
    expect(statementFingerprint(rows[0])).not.toBe(
      statementFingerprint(rows[1]),
    );
    expect(statementFingerprint({ ...rows[0], reference: "bank-123" })).toBe(
      statementFingerprint({ ...rows[1], reference: "bank-123" }),
    );
  });
  it("handles signed banking and card refunds without reversing bank semantics", () => {
    const raw = "日付,摘要,金額\n2026-09-01,利用,1200\n2026-09-02,返金,-200";
    expect(
      parseStatements(raw, { ...mapping, mode: "card", amount: 2 }).map(
        (r) => r.amount,
      ),
    ).toEqual([-1200, 200]);
    expect(
      parseStatements(raw, { ...mapping, mode: "signed", amount: 2 }).map(
        (r) => r.amount,
      ),
    ).toEqual([1200, -200]);
  });
  it.each([
    "2026/2/30,店,10,0",
    "2026/9/1,店,10,10",
    "2026/9/1,店,-10,0",
    "2026/9/1,店,1.2,0",
    "2026/9/1,店,2147483648,0",
    "2026/9/1,店,0,0",
    "2026/9/1,,10,0",
    "2026/9/1,店,=1+2,0",
  ])("rejects invalid financial row: %s", (row) => {
    expect(() =>
      parseStatements("日付,摘要,入金,出金\n" + row, mapping),
    ).toThrow(/2行目/);
  });
  it("rejects malformed, oversized, replacement character and ambiguous mappings", () => {
    for (const v of [
      'a,b\n"unclosed,x',
      'a,b\nx,"a"x',
      "a,b\nx,y,z",
      "a,b\nx,\ufffd",
      "x".repeat(1_000_001),
      "a,b\n" + Array(501).fill("x,y").join("\n"),
    ])
      expect(() => csvCells(v)).toThrow();
    expect(() =>
      parseStatements("a,b,c,d\n2026-09-01,店,100,0", {
        ...mapping,
        description: 0,
      }),
    ).toThrow();
  });
  it("rejects duplicate or empty provider reference IDs", () => {
    expect(() =>
      parseStatements(
        "a,b,c,d,id\n2026-09-01,店,100,0,1\n2026-09-02,店,100,0,1",
        { ...mapping, reference: 4 },
      ),
    ).toThrow();
    expect(() =>
      parseStatements("a,b,c,d,id\n2026-09-01,店,100,0,", {
        ...mapping,
        reference: 4,
      }),
    ).toThrow();
  });
  it("normalizes only typography and whitespace, not merchant numbers", () => {
    expect(normalizeDescription(" ＡＢＣ　商店 ")).toBe("abc 商店");
    expect(normalizeDescription("店舗01")).not.toBe(
      normalizeDescription("店舗02"),
    );
  });
});
