import { describe, it, expect } from "vitest";
import {
  annotationSchema,
  emptyAnnotation,
  filterSchema,
  forecast,
  journalTarget,
  summarizeLedger,
  type Journal,
} from "@/lib/management/model";
const filters = filterSchema.parse({ from: "2026-09", to: "2026-10" });
const entry = (
  id: string,
  date: string,
  source = "MANUAL",
  sourceId: string | null = null,
  reversalOf: string | null = null,
): Journal => ({
  id,
  date,
  source,
  sourceId,
  reversalOf,
  memo: "test",
  lines: [
    {
      debit: 0,
      credit: 10000,
      account: { id: "sales", name: "売上高", kind: "REVENUE", code: "400" },
    },
    {
      debit: 3000,
      credit: 0,
      account: { id: "cost", name: "費用", kind: "EXPENSE", code: "500" },
    },
  ],
});
describe("management calculations", () => {
  it("rejects invalid months and excessive periods", () => {
    for (const v of [
      { from: "2026-00", to: "2026-10" },
      { from: "2025-01", to: "2027-01" },
      { from: "2026-10", to: "2026-09" },
    ])
      expect(filterSchema.safeParse(v).success).toBe(false);
  });
  it("nets reversals in their posting month and retains original dimensions", () => {
    const e = entry("1", "2026-09-01", "INVOICE", "invoice1"),
      r = {
        ...entry("2", "2026-10-01", "REVERSAL", "invoice1", "1"),
        lines: e.lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit })),
      };
    const a = new Map([
      [
        "INVOICE:invoice1",
        {
          ...emptyAnnotation("INVOICE", "invoice1"),
          department: "営業",
          office: "東京",
        },
      ],
    ]);
    const report = summarizeLedger(
      [e, r],
      { ...filters, department: "営業", office: "東京" },
      a,
      new Map([["1", e]]),
    );
    expect(report.months.map((m) => m.profit)).toEqual([7000, -7000]);
    expect(report.revenue).toBe(0);
    expect(report.cost).toBe(0);
    expect(
      summarizeLedger(
        [e, r],
        { ...filters, department: "開発" },
        a,
        new Map([["1", e]]),
      ).months.every((m) => m.revenue === 0),
    ).toBe(true);
  });
  it("keeps expense recognition and bank payment separate", () => {
    const expense = entry("expense", "2026-09-01", "CLAIM", "claim1");
    expense.lines = [expense.lines[1]];
    const payment = entry("paid", "2026-09-05", "CLAIM_PAYMENT", "claim1");
    payment.lines = [
      {
        debit: 3000,
        credit: 0,
        account: {
          id: "liability",
          code: "210",
          name: "未払金",
          kind: "LIABILITY",
        },
      },
      {
        debit: 0,
        credit: 3000,
        account: { id: "cash", code: "110", name: "預金", kind: "ASSET" },
      },
    ];
    expect(
      summarizeLedger([expense, payment], filters, new Map(), new Map()).cost,
    ).toBe(3000);
  });
  it("handles unclassified and statement/manual mapping without confusing source ids", () => {
    expect(
      journalTarget(
        entry("journal", "2026-09-01", "STATEMENT", "statement-row"),
        new Map(),
      ),
    ).toEqual({ type: "JOURNAL", id: "journal" });
    expect(
      summarizeLedger(
        [entry("j", "2026-09-01")],
        { ...filters, department: "__none__" },
        new Map(),
        new Map(),
      ).revenue,
    ).toBe(10000);
    expect(() =>
      journalTarget(
        entry("r", "2026-09-01", "REVERSAL", null, "missing"),
        new Map(),
      ),
    ).toThrow();
  });
  it("forecasts future cash only, separating overdue and unknown dates", () => {
    const row = (due: string, amount: number) => ({
      key: due,
      name: "test",
      description: "",
      due,
      amount,
      href: "/",
      kind: "",
      annotation: emptyAnnotation("EXPENSE", "1"),
    });
    const f = forecast(
      "2026-10-03",
      100,
      [
        row("2026-10-01", 80),
        row("2026-10-03", 200),
        row("2026-11-01", 50),
        row("2027-04-01", 900),
      ],
      [row("", 40), row("2026-09-01", 60), row("2026-10-30", 120)],
    );
    expect(f.months.map((m) => m.balance)).toEqual([
      180, 230, 230, 230, 230, 230,
    ]);
    expect(f.overdueIncoming).toBe(80);
    expect(f.overdueOutgoing).toBe(60);
    expect(f.undated).toBe(40);
    expect(
      forecast("2026-10-03", null, [], []).months.every(
        (m) => m.balance === null,
      ),
    ).toBe(true);
  });
  it("validates complete bank details and rejects malformed dates", () => {
    const a = {
      ...emptyAnnotation("EXPENSE", "1"),
      bankCode: "0001",
      branchCode: "001",
      bankAccountType: "1",
      bankAccountNumber: "0123456",
      bankAccountHolder: "ｶ)ｻﾝﾌﾟﾙ",
    };
    expect(annotationSchema.safeParse(a).success).toBe(true);
    for (const x of [
      { ...a, bankCode: "" },
      { ...a, bankAccountHolder: "=IMPORTXML(A1)" },
      { ...a, targetType: "INVOICE" },
      { ...a, plannedDate: "2026-02-30" },
    ])
      expect(annotationSchema.safeParse(x).success).toBe(false);
  });
});
