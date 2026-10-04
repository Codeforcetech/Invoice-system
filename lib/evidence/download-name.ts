/**
 * ダウンロードするファイルの名前。「誰から・いつ・何の」が名前で分かるようにする。
 * 例: 山田太郎_2026-09-12_サンプル食堂.webp
 * OSやヘッダーで問題になる文字は取り除き、長さも抑える。
 */
export function downloadName(
  parts: (string | null | undefined)[],
  extension: string,
) {
  const clean = (v: string) =>
    v
      .normalize("NFKC")
      .replace(/[\\/:*?"<>|\x00-\x1f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 40);
  const name = parts
    .map((p) => clean(p ?? ""))
    .filter(Boolean)
    .join("_")
    .slice(0, 120);
  return `${name || "領収書"}.${extension.replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin"}`;
}

/** Content-Disposition に入れる、日本語対応のファイル名指定。 */
export function dispositionName(name: string) {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `filename="${ascii}"; filename*=UTF-8\'\'${encodeURIComponent(name).replace(/'/g, "%27")}`;
}
