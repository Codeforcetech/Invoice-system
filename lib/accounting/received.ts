import type { Prisma, PrismaClient } from "@prisma/client";
import { claimStatus } from "@/lib/claims/model";
import { visibleClaimWhere } from "@/lib/claims/access";
import { dateText, csv } from "./model";
import { downloadName } from "@/lib/evidence/download-name";
import type { ZipEntry } from "@/lib/zip";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * 「誰が・いつ・何月分の請求書と領収書を送ってきたか」を、登録済みのデータから1つにまとめる。
 * 新しいデータは作らない。支払管理（請求書）、経費精算（領収書）、証憑ファイルボックスが元になる。
 */
export type ReceivedKind = "INVOICE" | "RECEIPT";
export type ReceivedRow = {
  key: string;
  kind: ReceivedKind;
  /** 画面に出す種類（元の画面の名前つき） */
  label: string;
  /** 送ってきた人・支払先 */
  sender: string;
  /** 何月分か（YYYY-MM） */
  month: string;
  receivedAt: Date;
  amount: number;
  hasFile: boolean;
  fileHref: string | null;
  status: string;
  href: string;
  /** 登録・申請した人（わかる場合） */
  registeredBy: string | null;
};

export const normalizeSender = (v: string) =>
  v.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ja-JP");

export const monthRange = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return {
    gte: new Date(Date.UTC(y, m - 1, 1)),
    lt: new Date(Date.UTC(y, m, 1)),
  };
};
export const shiftMonthText = (month: string, delta: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
export const validMonthText = (v: string) =>
  /^20\d{2}-(0[1-9]|1[0-2])$/.test(v);

const LIMIT = 300;

export async function receivedRows(
  db: Db,
  ws: { ownerId: string; userId: string },
  month: string,
): Promise<ReceivedRow[]> {
  const range = monthRange(month);
  const [expenses, claims, evidence] = await Promise.all([
    db.expense.findMany({
      where: { userId: ws.ownerId, costMonth: month },
      select: {
        id: true,
        supplier: true,
        description: true,
        category: true,
        amount: true,
        costMonth: true,
        paidDate: true,
        createdAt: true,
        attachment: { select: { expenseId: true } },
      },
      orderBy: { createdAt: "desc" },
      take: LIMIT,
    }),
    db.expenseClaim.findMany({
      where: {
        AND: [
          visibleClaimWhere(ws.userId),
          { ownerId: ws.ownerId, status: { not: "DRAFT" }, date: range },
        ],
      },
      select: {
        id: true,
        title: true,
        merchant: true,
        amount: true,
        date: true,
        status: true,
        createdAt: true,
        applicant: { select: { name: true } },
        receipt: { select: { claimId: true } },
      },
      orderBy: { createdAt: "desc" },
      take: LIMIT,
    }),
    db.evidenceFile.findMany({
      where: {
        ownerId: ws.ownerId,
        status: "ACTIVE",
        kind: { in: ["RECEIPT", "INVOICE"] },
        // 支払管理から取り込んだ添付は、支払管理の側で数える（二重に数えない）。
        OR: [{ sourceType: null }, { sourceType: { not: "EXPENSE" } }],
        transactionDate: range,
      },
      select: {
        id: true,
        kind: true,
        counterparty: true,
        amount: true,
        transactionDate: true,
        createdAt: true,
        uploadedById: true,
      },
      orderBy: { createdAt: "desc" },
      take: LIMIT,
    }),
  ]);
  const uploaderIds = [...new Set(evidence.map((e) => e.uploadedById))];
  const nameOf = new Map(
    (uploaderIds.length
      ? await db.user.findMany({
          where: { id: { in: uploaderIds } },
          select: { id: true, name: true },
        })
      : []
    ).map((u) => [u.id, u.name]),
  );

  const rows: ReceivedRow[] = [
    ...expenses.map((e): ReceivedRow => ({
      key: `expense:${e.id}`,
      kind: "INVOICE",
      label: "請求書（支払管理）",
      sender: e.supplier,
      month: e.costMonth,
      receivedAt: e.createdAt,
      amount: e.amount,
      hasFile: !!e.attachment,
      fileHref: e.attachment ? `/api/expenses/${e.id}/pdf` : null,
      status: e.paidDate ? "支払済み" : "未払い",
      href: `/expenses/${e.id}/edit`,
      registeredBy: null,
    })),
    ...claims.map((c): ReceivedRow => ({
      key: `claim:${c.id}`,
      kind: "RECEIPT",
      label: "領収書（経費精算）",
      sender: c.applicant.name,
      month: dateText(c.date).slice(0, 7),
      receivedAt: c.createdAt,
      amount: c.amount,
      hasFile: !!c.receipt,
      fileHref: c.receipt ? `/api/claims/${c.id}/receipt` : null,
      status: claimStatus[c.status] ?? c.status,
      href: `/claims/${c.id}`,
      registeredBy: c.applicant.name,
    })),
    ...evidence.map((e): ReceivedRow => ({
      key: `evidence:${e.id}`,
      kind: e.kind === "INVOICE" ? "INVOICE" : "RECEIPT",
      label: `${e.kind === "INVOICE" ? "請求書" : "領収書"}（証憑）`,
      sender: e.counterparty,
      month: dateText(e.transactionDate).slice(0, 7),
      receivedAt: e.createdAt,
      amount: e.amount,
      hasFile: true,
      fileHref: `/api/evidence/${e.id}`,
      status: "保管済み",
      href: `/accounting/evidence/${e.id}`,
      registeredBy: nameOf.get(e.uploadedById) || null,
    })),
  ];
  return rows.sort((a, b) => +b.receivedAt - +a.receivedAt);
}

export type SenderSummary = {
  sender: string;
  invoices: number;
  receipts: number;
  amount: number;
  lastReceivedAt: Date;
  /** 請求書があるのに添付ファイルがない件数 */
  withoutFile: number;
};

/** 送ってきた人ごとの件数と金額（名前の全角半角・空白の違いは同じ人として数える）。 */
export function summarizeBySender(rows: ReceivedRow[]): SenderSummary[] {
  const map = new Map<string, SenderSummary>();
  for (const r of rows) {
    const k = normalizeSender(r.sender);
    const s = map.get(k) ?? {
      sender: r.sender,
      invoices: 0,
      receipts: 0,
      amount: 0,
      lastReceivedAt: r.receivedAt,
      withoutFile: 0,
    };
    if (r.kind === "INVOICE") s.invoices++;
    else s.receipts++;
    s.amount += r.amount;
    if (!r.hasFile) s.withoutFile++;
    if (r.receivedAt > s.lastReceivedAt) s.lastReceivedAt = r.receivedAt;
    map.set(k, s);
  }
  return [...map.values()].sort(
    (a, b) => +b.lastReceivedAt - +a.lastReceivedAt,
  );
}

/** 先月は届いたのに、今月はまだ届いていない人。 */
export function notYetThisMonth(
  current: ReceivedRow[],
  previous: ReceivedRow[],
): string[] {
  const now = new Set(current.map((r) => normalizeSender(r.sender)));
  const seen = new Map<string, string>();
  for (const r of previous) {
    const k = normalizeSender(r.sender);
    if (!now.has(k) && !seen.has(k)) seen.set(k, r.sender);
  }
  return [...seen.values()];
}

/** ZIPの中のファイルの拡張子 */
const extensionOf = (mime: string) =>
  ({
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  })[mime] ?? "bin";

export type PackageResult = {
  entries: ZipEntry[];
  totalBytes: number;
  files: number;
  withoutFile: number;
};

/**
 * 月末で締めて、その月の請求書・領収書のファイルを1つにまとめる（税理士へ渡す用）。
 * 「領収書」「請求書」のフォルダに分け、ファイル名は「送ってきた人_日付_金額」。
 * 添付のない書類も、一覧.csv に「添付なし」として残す。
 */
export async function buildReceiptPackage(
  db: Db,
  ws: { ownerId: string; userId: string },
  month: string,
  options: { includeInvoices: boolean },
): Promise<PackageResult> {
  const all = await receivedRows(db, ws, month);
  const rows = all.filter(
    (r) => options.includeInvoices || r.kind === "RECEIPT",
  );
  const idOf = (key: string, prefix: string) =>
    key.startsWith(prefix + ":") ? key.slice(prefix.length + 1) : null;
  const ids = (prefix: string) =>
    rows
      .filter((r) => r.hasFile)
      .map((r) => idOf(r.key, prefix))
      .filter((v): v is string => !!v);
  const [exp, clm, evd] = await Promise.all([
    db.expenseAttachment.findMany({
      where: { expenseId: { in: ids("expense") } },
      select: { expenseId: true, data: true },
    }),
    db.claimReceipt.findMany({
      where: { claimId: { in: ids("claim") } },
      select: { claimId: true, data: true, mimeType: true },
    }),
    db.evidenceFile.findMany({
      where: { id: { in: ids("evidence") }, ownerId: ws.ownerId },
      select: { id: true, data: true, mimeType: true },
    }),
  ]);
  const files = new Map<string, { data: Uint8Array; mime: string }>();
  for (const e of exp)
    files.set(`expense:${e.expenseId}`, {
      data: new Uint8Array(e.data),
      mime: "application/pdf",
    });
  for (const c of clm)
    files.set(`claim:${c.claimId}`, {
      data: new Uint8Array(c.data),
      mime: c.mimeType,
    });
  for (const e of evd)
    files.set(`evidence:${e.id}`, {
      data: new Uint8Array(e.data),
      mime: e.mimeType,
    });

  const used = new Set<string>();
  const entries: ZipEntry[] = [];
  const index: (string | number)[][] = [
    [
      "種類",
      "送ってきた人・支払先",
      "何月分",
      "届いた日時",
      "金額（税込）",
      "状態",
      "ファイル名",
    ],
  ];
  let totalBytes = 0,
    withoutFile = 0;
  const jst = (d: Date) =>
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Tokyo",
      dateStyle: "short",
      timeStyle: "short",
    }).format(d);
  for (const r of rows) {
    const f = files.get(r.key);
    let path = "添付なし";
    if (f) {
      const folder = r.kind === "RECEIPT" ? "領収書" : "請求書";
      const base = downloadName(
        [r.sender, r.month, `${r.amount}円`],
        extensionOf(f.mime),
      );
      const dot = base.lastIndexOf(".");
      let name = `${folder}/${base}`,
        n = 1;
      while (used.has(name))
        name = `${folder}/${base.slice(0, dot)}_${++n}${base.slice(dot)}`;
      used.add(name);
      entries.push({ name, data: f.data, date: r.receivedAt });
      totalBytes += f.data.length;
      path = name;
    } else withoutFile++;
    index.push([
      r.label,
      r.sender,
      r.month,
      jst(r.receivedAt),
      r.amount,
      r.status,
      path,
    ]);
  }
  entries.push({
    name: "一覧.csv",
    data: new TextEncoder().encode(csv(index)),
  });
  return { entries, totalBytes, files: entries.length - 1, withoutFile };
}
