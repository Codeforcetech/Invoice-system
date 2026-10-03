import { z } from "zod";
import { daySchema } from "./model";

export const mappingSchema = z.object({
  date: z.number().int().min(0).max(49),
  description: z.number().int().min(0).max(49),
  mode: z.enum(["split", "signed", "card"]),
  amount: z.number().int().min(-1).max(49),
  incoming: z.number().int().min(-1).max(49),
  outgoing: z.number().int().min(-1).max(49),
  reference: z.number().int().min(-1).max(49),
});
export type CsvMapping = z.infer<typeof mappingSchema>;
export type ParsedStatement = {
  date: string;
  description: string;
  amount: number;
  reference: string;
  occurrence: number;
  line: number;
};
export const normalizeDescription = (v: string) =>
  v.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ja-JP");

// RFC 4180 quoting, CRLF/LF and quoted newlines. Reject malformed files instead of silently dropping money rows.
export function csvCells(raw: string): string[][] {
  if (raw.length > 1_000_000 || raw.includes("\0") || raw.includes("\ufffd"))
    throw new Error(
      "CSVは1MB以内で、文字化けのないファイルを選択してください。",
    );
  const text = raw.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  const pushCell = () => {
    if (cell.length > 1000)
      throw new Error("1項目は1,000文字以内にしてください。");
    row.push(cell);
    cell = "";
    closed = false;
    if (row.length > 50) throw new Error("CSVの列数は50列以内にしてください。");
  };
  const pushRow = () => {
    pushCell();
    if (row.some((c) => c.trim())) rows.push(row);
    row = [];
    if (rows.length > 501)
      throw new Error("1回の取込は500明細以内にしてください。");
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += c;
    } else if (c === ",") pushCell();
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      pushRow();
    } else if (c === '"' && cell === "" && !closed) quoted = true;
    else {
      if (closed || c === '"')
        throw new Error("CSVの引用符の形式が正しくありません。");
      cell += c;
    }
  }
  if (quoted) throw new Error("CSVの引用符が閉じられていません。");
  if (cell || row.length || closed) pushRow();
  if (rows.length < 2) throw new Error("見出し行と1件以上の明細が必要です。");
  if (rows.some((r) => r.length !== rows[0].length))
    throw new Error(
      "CSVの列数が揃っていません。見出し以外の説明行・合計行を取り除いてください。",
    );
  return rows;
}
function money(raw: string): number {
  const v = raw
    .normalize("NFKC")
    .trim()
    .replace(/^[¥￥]/, "")
    .replace(/円$/, "");
  if (!v || v === "-") return 0;
  if (!/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.0+)?$/.test(v))
    throw new Error("金額は整数円で指定してください。");
  const n = Number(v.replaceAll(",", ""));
  if (!Number.isSafeInteger(n) || Math.abs(n) > 2147483647)
    throw new Error("金額が登録可能な範囲を超えています。");
  return n;
}
export function parseStatements(
  raw: string,
  mapping: CsvMapping,
): ParsedStatement[] {
  const m = mappingSchema.parse(mapping),
    cells = csvCells(raw);
  const used = [
    m.date,
    m.description,
    ...(m.mode === "split" ? [m.incoming, m.outgoing] : [m.amount]),
    ...(m.reference < 0 ? [] : [m.reference]),
  ];
  if (
    used.some((i) => i < 0 || i >= cells[0].length) ||
    new Set(used).size !== used.length
  )
    throw new Error("日付・摘要・金額の列を重複なく指定してください。");
  const occurrences = new Map<string, number>(),
    references = new Set<string>();
  return cells.slice(1).map((row, i) => {
    try {
      const rawDate = row[m.date]
        .normalize("NFKC")
        .trim()
        .replace(/年|月|\//g, "-")
        .replace(/日$/, "");
      const parts = /^(20\d{2})-(\d{1,2})-(\d{1,2})$/.exec(rawDate);
      if (!parts) throw new Error("日付は西暦の年月日で指定してください。");
      const date = `${parts[1]}-${parts[2].padStart(2, "0")}-${parts[3].padStart(2, "0")}`;
      if (!daySchema.safeParse(date).success)
        throw new Error("存在しない日付です。");
      const description = row[m.description].trim();
      if (!description || description.length > 300)
        throw new Error("摘要は1〜300文字で指定してください。");
      let amount: number;
      if (m.mode === "split") {
        const incoming = money(row[m.incoming]),
          outgoing = money(row[m.outgoing]);
        if (incoming < 0 || outgoing < 0 || (incoming > 0 && outgoing > 0))
          throw new Error(
            "入金・出金はどちらか一方に正の金額を指定してください。",
          );
        amount = incoming - outgoing;
      } else amount = money(row[m.amount]) * (m.mode === "card" ? -1 : 1);
      if (!amount) throw new Error("金額0円の明細は取り込めません。");
      const reference = m.reference < 0 ? "" : row[m.reference].trim();
      if (
        m.reference >= 0 &&
        (!reference || reference.length > 150 || references.has(reference))
      )
        throw new Error("明細IDは空欄・重複なし、150文字以内にしてください。");
      if (reference) references.add(reference);
      const key = JSON.stringify([
        date,
        normalizeDescription(description),
        amount,
      ]);
      const occurrence = (occurrences.get(key) ?? 0) + 1;
      occurrences.set(key, occurrence);
      return { date, description, amount, reference, occurrence, line: i + 2 };
    } catch (e) {
      throw new Error(
        `${i + 2}行目: ${e instanceof Error ? e.message : "形式が正しくありません。"}`,
      );
    }
  });
}
