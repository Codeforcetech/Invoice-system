import sharp from "sharp";
import { readExpensePdf } from "@/lib/expenses/model";
export async function readClaimReceipt(file: File | null) {
  if (!file || (!file.name && !file.size)) return null;
  if (!file.size || file.size > 3 * 1024 * 1024)
    throw new Error(
      "レシートは空でない3MB以内のPDF・JPEG・PNG・WebPを選択してください。",
    );
  if (/\.pdf$/i.test(file.name)) {
    const pdf = await readExpensePdf(file);
    return pdf ? { ...pdf, mimeType: "application/pdf" } : null;
  }
  if (!/\.(jpe?g|png|webp)$/i.test(file.name))
    throw new Error("レシートはPDF・JPEG・PNG・WebPを選択してください。");
  try {
    const bytes = Buffer.from(await file.arrayBuffer()),
      image = sharp(bytes, { limitInputPixels: 20_000_000, failOn: "warning" });
    const meta = await image.metadata();
    if (
      !["jpeg", "png", "webp"].includes(meta.format ?? "") ||
      (meta.pages ?? 1) > 1
    )
      throw new Error();
    const data = await image
      .rotate()
      .resize({
        width: 2000,
        height: 2000,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 90 })
      .toBuffer();
    return {
      data: new Uint8Array(data),
      filename:
        file.name
          .replace(/\.[^.]+$/, " ")
          .trim()
          .replace(/[\r\n\x00-\x1f]/g, "")
          .slice(0, 120) + ".webp",
      mimeType: "image/webp",
    };
  } catch {
    throw new Error(
      "画像を読み込めませんでした。鮮明なJPEG・PNG・WebPを選択してください。",
    );
  }
}
