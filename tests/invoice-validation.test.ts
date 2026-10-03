import { expect, it } from "vitest";
import { calculateInvoice } from "@/lib/invoice/calculateInvoice";
import { invoiceUpsertSchema } from "@/lib/validators/invoice";
import { settingsUpdateSchema } from "@/lib/validators/settings";
const item = {
  productName: "制作",
  unit: "式",
  quantity: 1,
  unitPrice: 10000,
  amount: 10000,
  amountManuallyEdited: false,
  note: "",
};
const data = {
  companyId: "company",
  subject: "請求書",
  issueDate: new Date(),
  dueDate: new Date(),
  withholdingEnabled: false,
  status: "DRAFT",
  items: [item],
};
it("rounds every line before summing, matching the displayed row amounts", () => {
  const result = calculateInvoice({
    items: [
      { ...item, quantity: 0.15, unitPrice: 10 },
      { ...item, quantity: 0.15, unitPrice: 10 },
    ],
    taxRateBps: 1000,
    withholdingEnabled: false,
  });
  expect(result.subtotal).toBe(2);
  expect(result.grandTotal).toBe(2);
});
it("respects manual overrides and withholding", () => {
  const result = calculateInvoice({
    items: [
      { ...item, quantity: 2, amount: 15000, amountManuallyEdited: true },
    ],
    taxRateBps: 1000,
    withholdingEnabled: true,
  });
  expect(result).toEqual({
    subtotal: 15000,
    taxAmount: 1500,
    totalWithTax: 16500,
    withholdingTax: 1531,
    grandTotal: 14969,
  });
});
it.each([NaN, Infinity, -1, 0.001])(
  "rejects invalid quantity %s",
  (quantity) => {
    expect(
      invoiceUpsertSchema.safeParse({ ...data, items: [{ ...item, quantity }] })
        .success,
    ).toBe(false);
  },
);
it("rejects integer overflow before database writes", () => {
  expect(
    invoiceUpsertSchema.safeParse({
      ...data,
      items: [{ ...item, quantity: 1000000, unitPrice: 1000000 }],
    }).success,
  ).toBe(false);
});
it("bounds row count and requires non-whitespace text", () => {
  expect(
    invoiceUpsertSchema.safeParse({ ...data, items: Array(101).fill(item) })
      .success,
  ).toBe(false);
  expect(
    invoiceUpsertSchema.safeParse({ ...data, subject: "   " }).success,
  ).toBe(false);
});
it("validates sender and rejects SVG image data", () => {
  expect(
    settingsUpdateSchema.safeParse({
      companyName: "test",
      taxRate: 1000,
      email: "bad",
    }).success,
  ).toBe(false);
  expect(
    settingsUpdateSchema.safeParse({
      companyName: "test",
      taxRate: 1000,
      stampImageUrl: "data:image/svg+xml;base64,PHN2Zz4=",
    }).success,
  ).toBe(false);
});
