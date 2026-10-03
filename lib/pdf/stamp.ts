import sharp from "sharp";
import { resolveStampImageUrl } from "@/lib/invoice/resolveStampImageUrl";

const MAX_IMAGE_BYTES = 512 * 1024;
export const STAMP_ERROR =
  "印影をPDFに取り込めません。設定で512KB以下のPNG/JPEG画像を登録するか、印影を解除してください。";
export async function loadPdfStamp(
  raw?: string | null,
): Promise<Buffer | undefined> {
  if (!raw?.trim()) return undefined;
  let bytes: Buffer;
  const data = raw.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/);
  if (data) {
    if (data[2].length > Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 4)
      throw new Error(STAMP_ERROR);
    bytes = Buffer.from(data[2], "base64");
  } else {
    // Only a fixed Google image host/path is fetched. Never follow user-controlled redirects.
    const url = new URL(resolveStampImageUrl(raw) ?? "https://invalid.invalid");
    if (
      url.origin !== "https://lh3.googleusercontent.com" ||
      !/^\/d\/[A-Za-z0-9_-]+=s400$/.test(url.pathname) ||
      url.search ||
      url.username ||
      url.password
    )
      throw new Error(STAMP_ERROR);
    const response = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (
      !response.ok ||
      !/^image\/(png|jpeg)/.test(response.headers.get("content-type") ?? "")
    )
      throw new Error(STAMP_ERROR);
    const reader = response.body?.getReader();
    if (!reader) throw new Error(STAMP_ERROR);
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        length += part.value.length;
        if (length > MAX_IMAGE_BYTES) throw new Error(STAMP_ERROR);
        chunks.push(part.value);
      }
    } finally {
      await reader.cancel();
    }
    bytes = Buffer.concat(chunks);
  }
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error(STAMP_ERROR);
  try {
    const img = sharp(bytes, { limitInputPixels: 4_000_000 });
    const meta = await img.metadata();
    if (
      !meta.width ||
      !meta.height ||
      !["png", "jpeg"].includes(meta.format ?? "")
    )
      throw new Error(STAMP_ERROR);
    return await img
      .resize(400, 400, { fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
  } catch {
    throw new Error(STAMP_ERROR);
  }
}
