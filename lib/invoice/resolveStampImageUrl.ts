/**
 * 設定に保存されたハンコ画像 URL を帳票表示用に正規化する。
 * Google Drive の「共有リンク」はそのままでは画像として読み込めないため ID 抽出して変換する。
 */
export function resolveStampImageUrl(raw: string | null | undefined): string | null {
  const url = raw?.trim();
  if (!url) return null;

  const fileIdFromPath = url.match(/drive\.google\.com\/file\/d\/([^/?#]+)/)?.[1];
  if (fileIdFromPath) {
    return `https://drive.google.com/uc?export=view&id=${fileIdFromPath}`;
  }

  const fileIdFromQuery = url.match(/[?&]id=([^&]+)/)?.[1];
  if (fileIdFromQuery && url.includes("drive.google.com")) {
    return `https://drive.google.com/uc?export=view&id=${fileIdFromQuery}`;
  }

  return url;
}
