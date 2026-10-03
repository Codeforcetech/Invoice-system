/** Raster-only embedded stamps can be rendered without contacting an external host. */
export function isEmbeddedStamp(value: string) {
  return (
    value.length <= 700000 &&
    /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
  );
}
export function extractGoogleDriveFileId(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.port)
      return null;
    let id: string | null = null;
    if (
      [
        "drive.google.com",
        "docs.google.com",
        "drive.usercontent.google.com",
      ].includes(url.hostname)
    )
      id =
        url.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]+)(?:\/|$)/)?.[1] ??
        url.searchParams.get("id");
    if (url.hostname === "lh3.googleusercontent.com")
      id = url.pathname.match(/^\/d\/([A-Za-z0-9_-]+)(?:=|$)/)?.[1] ?? null;
    return id && /^[A-Za-z0-9_-]+$/.test(id) ? id : null;
  } catch {
    return null;
  }
}
export function resolveStampImageUrl(
  raw: string | null | undefined,
): string | null {
  const value = raw?.trim();
  if (!value) return null;
  if (isEmbeddedStamp(value)) return value;
  try {
    const url = new URL(value);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return null;
    const id = extractGoogleDriveFileId(value);
    return id ? `https://lh3.googleusercontent.com/d/${id}=s400` : url.href;
  } catch {
    return null;
  }
}
