/**
 * 適格請求書発行事業者の登録番号は「T」＋13桁の数字。
 * 全角・小文字・ハイフン・空白は取り除いて正規形（例: T1234567890123）にそろえる。
 * 形式だけを確認する。登録の有無は確認しない（国税庁の公表サイトで確認する）。
 */
export const REGISTRATION_NUMBER_HINT =
  "「T」と13桁の数字で入力してください（例：T1234567890123）。免税事業者は空欄のままにします。";

export type RegistrationNumberResult =
  { ok: true; value: string | null } | { ok: false };

export function normalizeRegistrationNumber(
  raw: string | null | undefined,
): RegistrationNumberResult {
  if (raw == null) return { ok: true, value: null };
  const compact = raw
    .normalize("NFKC")
    .replace(/[\s　\-‐‑–—―ー−]/g, "")
    .toUpperCase();
  if (compact === "") return { ok: true, value: null };
  return /^T\d{13}$/.test(compact)
    ? { ok: true, value: compact }
    : { ok: false };
}
