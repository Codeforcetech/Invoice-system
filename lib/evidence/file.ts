import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { MAX_EVIDENCE_BYTES } from "./model";

export function sha256Hex(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

const formats = {
  jpeg: { mime: "image/jpeg", ext: /\.jpe?g$/i },
  png: { mime: "image/png", ext: /\.png$/i },
  webp: { mime: "image/webp", ext: /\.webp$/i },
} as const;

/** 利用者にそのまま見せてよいファイル検証のエラー */
export class EvidenceFileError extends Error {}

export function safeFilename(name: string) {
  const cleaned = name
    .replace(/[\x00-\x1f\x7f/\\]/g, "_")
    .trim()
    .slice(0, 150);
  return cleaned || "evidence";
}

/**
 * アップロードされたファイルを確認する。内容は一切変えず、受け取ったまま返す
 * （再圧縮・向きの補正・メタデータの除去をしない）。種類はファイルの中身で判定する。
 */
export async function readEvidenceFile(file: File | null) {
  if (!file || (!file.name && !file.size))
    throw new EvidenceFileError("証憑のファイルを選択してください。");
  if (!file.size) throw new EvidenceFileError("ファイルが空です。");
  if (file.size > MAX_EVIDENCE_BYTES)
    throw new EvidenceFileError(
      "ファイルは3MB以内にしてください。大きいPDFは、解像度を下げるか分割して登録してください。",
    );
  const bytes = new Uint8Array(await file.arrayBuffer());
  const head = new TextDecoder().decode(bytes.subarray(0, 5));
  const filename = safeFilename(file.name);
  if (head === "%PDF-") {
    if (!/\.pdf$/i.test(filename))
      throw new EvidenceFileError("ファイルの拡張子と形式が一致しません。");
    if (
      !new TextDecoder()
        .decode(bytes.subarray(Math.max(0, bytes.length - 1024)))
        .includes("%%EOF")
    )
      throw new EvidenceFileError(
        "PDFの形式を確認できません。別のファイルを選択してください。",
      );
    return {
      data: bytes,
      filename,
      mimeType: "application/pdf",
      size: bytes.length,
      sha256: sha256Hex(bytes),
    };
  }
  try {
    const meta = await sharp(Buffer.from(bytes), {
      limitInputPixels: 40_000_000,
      failOn: "warning",
    }).metadata();
    const kind = meta.format as keyof typeof formats | undefined;
    if (!kind || !(kind in formats) || (meta.pages ?? 1) > 1)
      throw new Error("unsupported");
    if (!formats[kind].ext.test(filename))
      throw new EvidenceFileError("ファイルの拡張子と形式が一致しません。");
    return {
      data: bytes,
      filename,
      mimeType: formats[kind].mime,
      size: bytes.length,
      sha256: sha256Hex(bytes),
    };
  } catch (e) {
    if (e instanceof EvidenceFileError) throw e;
    throw new Error(
      "PDF・JPEG・PNG・WebPのファイルを選択してください（画像は読み込めるものに限ります）。",
    );
  }
}
