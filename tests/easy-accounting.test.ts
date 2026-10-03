import { describe, expect, it } from "vitest";
import {
  NEW_OTHER_INCOME_ID,
  buildEasyLines,
  describeBooks,
  describeEasy,
  easyOptions,
  easySchema,
  openingLines,
  type AccountLite,
} from "@/lib/accounting/easy";

const acc = (
  code: string,
  name: string,
  kind: string,
  active = true,
): AccountLite => ({ id: "id-" + code, code, name, kind, active });
const standard: AccountLite[] = [
  acc("100", "現金", "ASSET"),
  acc("110", "普通預金", "ASSET"),
  acc("120", "売掛金", "ASSET"),
  acc("210", "未払金", "LIABILITY"),
  acc("400", "売上高", "REVENUE"),
  acc("500", "仕入高", "EXPENSE"),
  acc("510", "外注費", "EXPENSE"),
  acc("520", "地代家賃", "EXPENSE"),
  acc("530", "通信費", "EXPENSE"),
  acc("540", "広告宣伝費", "EXPENSE"),
  acc("550", "旅費交通費", "EXPENSE"),
  acc("560", "消耗品費", "EXPENSE"),
  acc("570", "支払手数料", "EXPENSE"),
  acc("580", "雑費", "EXPENSE"),
  acc("DEP", "減価償却費", "EXPENSE"),
];
const valid = {
  requestKey: crypto.randomUUID(),
  kind: "OUT",
  date: "2026-09-10",
  amount: "5500",
  categoryAccountId: "id-530",
  moneyAccountId: "id-110",
  memo: "NTT 電話代",
  taxChoice: "10",
};

describe("choices shown to the user", () => {
  const o = easyOptions(standard, []);

  it("describes money going out in everyday words, not account names", () => {
    const labels = o.out.map((x) => x.label);
    expect(labels).toContain("家賃・賃料");
    expect(labels).toContain("電話・ネット・郵送");
    expect(labels).toContain("事務用品・消耗品");
    expect(labels.join()).not.toMatch(
      /地代家賃|通信費|消耗品費|広告宣伝費|旅費交通費|支払手数料/,
    );
    expect(o.out.find((x) => x.label === "電話・ネット・郵送")).toMatchObject({
      id: "id-530",
      tax: "10",
    });
  });

  it("gives every choice an example so a beginner can tell them apart", () => {
    for (const x of [...o.out, ...o.income])
      expect(x.example.length, x.label).toBeGreaterThan(3);
  });

  it("never offers depreciation, which is posted by the fixed-asset feature", () => {
    expect(o.out.some((x) => x.id === "id-DEP")).toBe(false);
  });

  it("offers a catch-all for payments and for income", () => {
    expect(o.out.at(-1)?.label).toBe("その他の支払い");
    expect(o.income.map((x) => x.label)).toEqual([
      "売上（商品・サービスの代金）",
      "その他の入金",
    ]);
  });

  it("creates 'other income' on first use, and reuses it once it exists", () => {
    expect(o.income.at(-1)?.id).toBe(NEW_OTHER_INCOME_ID);
    const withIt = easyOptions(
      [...standard, acc("410", "雑収入", "REVENUE")],
      [],
    );
    expect(withIt.income.at(-1)?.id).toBe("id-410");
  });

  it("adds accounts the company created itself, under their own names", () => {
    const mine = easyOptions(
      [
        ...standard,
        acc("525", "駐車場代", "EXPENSE"),
        acc("405", "保守収入", "REVENUE"),
      ],
      [],
    );
    expect(mine.out.find((x) => x.id === "id-525")).toMatchObject({
      label: "駐車場代",
      standard: false,
      tax: "none",
    });
    expect(mine.income.find((x) => x.id === "id-405")).toMatchObject({
      label: "保守収入",
      standard: false,
    });
  });

  it("drops accounts that are switched off", () => {
    const off = easyOptions(
      standard.map((a) => (a.code === "520" ? { ...a, active: false } : a)),
      [],
    );
    expect(off.out.some((x) => x.label === "家賃・賃料")).toBe(false);
  });

  it("lists cash, bank accounts and cards as places the money moves", () => {
    const m = easyOptions(
      [
        ...standard,
        acc("111", "みずほ銀行", "ASSET"),
        acc("230", "カード未払", "LIABILITY"),
      ],
      [
        { name: "みずほ銀行", kind: "BANK", accountId: "id-111" },
        { name: "ビジネスカード", kind: "CARD", accountId: "id-230" },
        { name: "普通預金の重複", kind: "BANK", accountId: "id-110" },
      ],
    ).money;
    expect(m.map((x) => x.label)).toEqual([
      "現金",
      "普通預金",
      "みずほ銀行",
      "カード（ビジネスカード）",
    ]);
    expect(m.find((x) => x.label.startsWith("カード"))?.kind).toBe("CARD");
  });
});

describe("turning an everyday entry into book entries", () => {
  const ids = { category: "cat", money: "bank", to: "cash" };

  it("money out: the cost goes on the left, the account on the right", () => {
    expect(
      buildEasyLines({ kind: "OUT", amount: 5500, taxChoice: "10" }, ids),
    ).toEqual([
      { accountId: "cat", debit: 5500, credit: 0, taxCategory: "TAXABLE_10" },
      { accountId: "bank", debit: 0, credit: 5500 },
    ]);
  });

  it("money in: the account on the left, the income on the right", () => {
    expect(
      buildEasyLines({ kind: "IN", amount: 11000, taxChoice: "8" }, ids),
    ).toEqual([
      { accountId: "bank", debit: 11000, credit: 0 },
      { accountId: "cat", debit: 0, credit: 11000, taxCategory: "TAXABLE_8" },
    ]);
  });

  it("a transfer carries no tax category and always balances", () => {
    const lines = buildEasyLines(
      { kind: "MOVE", amount: 30000, taxChoice: "10" },
      ids,
    );
    expect(lines).toEqual([
      { accountId: "cash", debit: 30000, credit: 0 },
      { accountId: "bank", debit: 0, credit: 30000 },
    ]);
  });

  it("'not applicable / not sure' leaves the tax category unset instead of guessing", () => {
    const [cost] = buildEasyLines(
      { kind: "OUT", amount: 100, taxChoice: "none" },
      ids,
    );
    expect(cost.taxCategory).toBeNull();
  });

  it("every kind balances for any amount", () => {
    for (const kind of ["OUT", "IN", "MOVE"] as const)
      for (const amount of [1, 999, 1_234_567, 2147483647]) {
        const lines = buildEasyLines({ kind, amount, taxChoice: "10" }, ids);
        expect(lines.reduce((s, l) => s + l.debit - l.credit, 0)).toBe(0);
      }
  });

  it("describes the entry in plain sentences, and in book terms only for those who want them", () => {
    expect(
      describeEasy(
        { kind: "OUT", amount: 5500, memo: "NTT" },
        { category: "通信費", money: "普通預金" },
      ),
    ).toBe("普通預金から ¥5,500 の支払い（通信費）：NTT");
    expect(
      describeEasy(
        { kind: "MOVE", amount: 30000, memo: "" },
        { money: "普通預金", to: "現金" },
      ),
    ).toBe("普通預金から現金へ ¥30,000 を移動");
    expect(
      describeBooks([
        { name: "通信費", debit: 5500, credit: 0 },
        { name: "普通預金", debit: 0, credit: 5500 },
      ]),
    ).toEqual({ debit: "通信費 5,500", credit: "普通預金 5,500" });
  });
});

describe("what the user must fill in", () => {
  const parse = (over: Record<string, unknown>) =>
    easySchema.safeParse({ ...valid, ...over });
  const message = (over: Record<string, unknown>) => {
    const r = parse(over);
    return r.success ? "" : r.error.issues[0].message;
  };

  it("accepts a complete entry", () => {
    expect(parse({}).success).toBe(true);
  });

  it("asks for each missing piece in plain words", () => {
    expect(message({ amount: "0" })).toMatch(/1円以上/);
    expect(message({ amount: "-5" })).toMatch(/1円以上/);
    expect(message({ amount: "12.5" })).toMatch(/整数/);
    expect(message({ amount: "" })).toBeTruthy();
    expect(message({ categoryAccountId: "" })).toMatch(/何のお金/);
    expect(message({ moneyAccountId: "" })).toMatch(/どの口座/);
    expect(message({ memo: "  " })).toMatch(/取引先・内容/);
    expect(message({ kind: "SWAP" })).toMatch(/種類/);
    expect(message({ date: "2026-02-30" })).toBeTruthy();
  });

  it("a transfer needs two different places but no category or description", () => {
    const move = {
      kind: "MOVE",
      categoryAccountId: "",
      memo: "",
      moneyAccountId: "id-110",
      toAccountId: "id-100",
    };
    expect(parse(move).success).toBe(true);
    expect(message({ ...move, toAccountId: "id-110" })).toMatch(/別のもの/);
    expect(message({ ...move, toAccountId: "" })).toMatch(/移動先/);
    expect(message({ ...move, moneyAccountId: "" })).toMatch(/移動元/);
  });
});

describe("opening balances", () => {
  const id = (code: string) => "id-" + code;
  const sum = (lines: { debit: number; credit: number }[]) =>
    lines.reduce((s, l) => s + l.debit - l.credit, 0);

  it("balances by putting the difference in owner's equity", () => {
    const r = openingLines(
      {
        cash: 100000,
        bank: 2000000,
        receivable: 300000,
        payable: 50000,
        loan: 1000000,
      },
      id,
    );
    expect(r.equity).toBe(100000 + 2000000 + 300000 - 1050000);
    expect(sum(r.lines)).toBe(0);
    expect(r.lines.find((l) => l.accountId === "id-300")).toMatchObject({
      credit: 1350000,
      debit: 0,
    });
  });

  it("puts a shortfall on the other side when debts are larger than assets", () => {
    const r = openingLines(
      { cash: 0, bank: 500000, receivable: 0, payable: 0, loan: 800000 },
      id,
    );
    expect(r.equity).toBe(-300000);
    expect(r.lines.find((l) => l.accountId === "id-300")).toMatchObject({
      debit: 300000,
      credit: 0,
    });
    expect(sum(r.lines)).toBe(0);
  });

  it("leaves out the items that are zero", () => {
    const r = openingLines(
      { cash: 0, bank: 1000, receivable: 0, payable: 0, loan: 0 },
      id,
    );
    expect(r.lines.map((l) => l.accountId).sort()).toEqual([
      "id-110",
      "id-300",
    ]);
  });

  it("produces nothing to post when everything is zero", () => {
    expect(
      openingLines({ cash: 0, bank: 0, receivable: 0, payable: 0, loan: 0 }, id)
        .lines,
    ).toEqual([]);
  });
});
