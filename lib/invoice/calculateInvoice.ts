import {
  applyRounding,
  BPS_SCALE,
  MONEY_ROUNDING_MODE,
  WITHHOLDING_TAX_RATE_BPS,
} from "./constants";
import type { CalculateInvoiceInput, CalculateInvoiceResult } from "./types";

function toYenInt(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return applyRounding(value, "FLOOR");
}

export function calculateInvoice(input: CalculateInvoiceInput): CalculateInvoiceResult {
  const subtotal = toYenInt(
    input.items.reduce((sum, item) => {
      const autoAmount = item.quantity * item.unitPrice;
      const amount = item.amountManuallyEdited ? item.amount : autoAmount;
      return sum + amount;
    }, 0),
  );

  const taxAmount = toYenInt(
    applyRounding((subtotal * input.taxRateBps) / BPS_SCALE, MONEY_ROUNDING_MODE),
  );

  const totalWithTax = subtotal + taxAmount;

  const withholdingTax = input.withholdingEnabled
    ? toYenInt(
        applyRounding(
          (subtotal * WITHHOLDING_TAX_RATE_BPS) / BPS_SCALE,
          MONEY_ROUNDING_MODE,
        ),
      )
    : 0;

  const grandTotal = totalWithTax - withholdingTax;

  return { subtotal, taxAmount, totalWithTax, withholdingTax, grandTotal };
}

