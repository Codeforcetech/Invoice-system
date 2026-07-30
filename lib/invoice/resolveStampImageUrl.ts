/**
 * 設定に保存されたハンコ画像 URL を帳票表示用に正規化する。
 *
 * Google Drive の共有リンク（/file/d/...）や旧式の uc?export=view は、
 * ブラウザの <img> から cross-site で読むと 403 になる（2024年以降の仕様変更）。
 * 埋め込み可能な lh3.googleusercontent.com 直リンクへ変換する。
 */
const DRIVE_HOST = /(?:^|\.)(?:drive\.google\.com|docs\.google\.com)$/i;

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/** Google Drive 共有URL・uc・open・lh3 等からファイル ID を抽出 */
export function extractGoogleDriveFileId(raw: string): string | null {
  const url = raw.trim();
  if (!url) return null;

  const fromFilePath = url.match(/\/file\/d\/([^/?#]+)/)?.[1];
  if (fromFilePath) return fromFilePath;

  const fromLh3 = url.match(/googleusercontent\.com\/d\/([^/=?#]+)/)?.[1];
  if (fromLh3) return fromLh3;

  try {
    const u = new URL(url);
    const hostOk =
      DRIVE_HOST.test(u.hostname) ||
      u.hostname.includes("googleusercontent.com") ||
      u.hostname === "drive.usercontent.google.com";
    if (hostOk) {
      const id = u.searchParams.get("id");
      if (id) return id;
    }
  } catch {
    /* fall through */
  }

  const fromQuery = url.match(/[?&]id=([^&]+)/)?.[1];
  return fromQuery ? decodeURIComponent(fromQuery) : null;
}

/** 帳票の印影表示用（小さめでも印刷で潰れにくいサイズ） */
function toDriveEmbedUrl(fileId: string): string {
  return `https://lh3.googleusercontent.com/d/${fileId}=s400`;
}

export function resolveStampImageUrl(raw: string | null | undefined): string | null {
  const url = raw?.trim();
  if (!url) return null;
  if (!isHttpUrl(url)) return null;

  const fileId = extractGoogleDriveFileId(url);
  if (fileId) return toDriveEmbedUrl(fileId);

  return url;
}
