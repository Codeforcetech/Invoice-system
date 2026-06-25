export const BPS_SCALE = 10000; // 100.00% = 10000 bps（%*100）
export const DEFAULT_TAX_RATE_BPS = 1000; // 10.00%
export const WITHHOLDING_TAX_RATE_BPS = 1021; // 10.21%

export type RoundingMode = "FLOOR" | "ROUND" | "CEIL";

/**
 * 丸め方針（MVP）:
 * - 税/源泉などの計算結果は「円未満切り捨て（FLOOR）」で統一
 * - 実務でよくある運用で差分説明がしやすい
 */
export const MONEY_ROUNDING_MODE: RoundingMode = "FLOOR";

export function applyRounding(value: number, mode: RoundingMode): number {
  if (mode === "ROUND") return Math.round(value);
  if (mode === "CEIL") return Math.ceil(value);
  return Math.floor(value);
}

