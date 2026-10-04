import { createHash, randomUUID } from "node:crypto";
import type { Tx } from "./service";
import { postJournal, reverseJournal } from "./service";
import { dateText, invoiceDateText } from "./model";
import { hasTaxCategories } from "@/lib/invoice/calculateInvoice";
import { invoiceTaxGroups } from "@/lib/invoice/taxBreakdown";
import { isTaxCategory, type TaxCategory } from "@/lib/tax/categories";
type Posting = {
  date: string;
  memo: string;
  lines: {
    code: string;
    debit: number;
    credit: number;
    /** 消費税区分（未設定は null/未指定） */
    tax?: TaxCategory | null;
  }[];
  /**
   * 税区分が利用者の指定による（明細・支払の区分）か。指定によるときだけ内容の指紋に含める。
   * 区分を導出しただけの仕訳は指紋を変えないので、既存の連携仕訳が再記帳されない。
   */
  taxExplicit?: boolean;
};
/** The fingerprint of a posting without explicit tax data is the same as before tax categories existed. */
function fingerprintView(posting: Posting | null) {
  if (!posting) return null;
  return {
    date: posting.date,
    memo: posting.memo,
    lines: posting.lines.map((l) =>
      posting.taxExplicit
        ? { code: l.code, debit: l.debit, credit: l.credit, tax: l.tax ?? null }
        : { code: l.code, debit: l.debit, credit: l.credit },
    ),
  };
}
async function syncPosting(
  tx: Tx,
  userId: string,
  key: string,
  source: string,
  sourceId: string,
  posting: Posting | null,
) {
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(fingerprintView(posting)))
    .digest("hex");
  const old = await tx.accountingSource.findUnique({
    where: { userId_key: { userId, key } },
  });
  if (old?.fingerprint === fingerprint) return;
  if (old?.entryId) {
    const entry = await tx.journalEntry.findFirst({
      where: { id: old.entryId, userId },
    });
    if (!entry) throw new Error("連携仕訳が見つかりません。");
    await reverseJournal(
      tx,
      userId,
      entry.id,
      dateText(entry.date),
      `連携内容の訂正: ${entry.memo}`,
    );
  }
  let entryId: string | null = null;
  if (posting) {
    const accounts = await tx.account.findMany({
      where: { userId, code: { in: posting.lines.map((l) => l.code) } },
    });
    const lines = posting.lines
      .filter((l) => l.debit || l.credit)
      .map((l) => {
        const a = accounts.find((a) => a.code === l.code);
        if (!a) throw new Error("自動仕訳の標準科目が不足しています。");
        return {
          accountId: a.id,
          debit: l.debit,
          credit: l.credit,
          taxCategory: l.tax ?? null,
        };
      });
    if (lines.length) {
      const e = await postJournal(
        tx,
        userId,
        {
          requestKey: randomUUID(),
          date: posting.date,
          memo: posting.memo.slice(0, 500),
          lines,
        },
        source,
        sourceId,
      );
      entryId = e.id;
    }
  }
  await tx.accountingSource.upsert({
    where: { userId_key: { userId, key } },
    create: { userId, key, fingerprint, entryId },
    update: { fingerprint, entryId },
  });
}
export async function syncInvoice(tx: Tx, userId: string, id: string) {
  const setting = await tx.accountingSetting.findUnique({ where: { userId } });
  if (!setting) return;
  const inv = await tx.invoice.findFirst({
    where: { id, createdById: userId },
    include: {
      company: true,
      items: { select: { amount: true, taxCategory: true } },
    },
  });
  if (!inv) throw new Error("請求書が見つかりません。");
  const eligible =
    inv.status === "ISSUED" &&
    !inv.mergedIntoId &&
    invoiceDateText(inv.issueDate) >= dateText(setting.startDate) &&
    inv.totalWithTax > 0;
  const label = `${inv.invoiceNumber} ${inv.company.name} ${inv.subject}`;
  if (eligible && inv.totalWithTax !== inv.grandTotal + inv.withholdingTax)
    throw new Error("請求金額と源泉徴収額が一致しません。");
  await syncPosting(
    tx,
    userId,
    `invoice:${id}:issue`,
    "INVOICE",
    id,
    eligible
      ? {
          date: invoiceDateText(inv.issueDate),
          memo: `請求: ${label}`,
          lines: [
            { code: "120", debit: inv.totalWithTax, credit: 0 },
            // Sales are split by tax group (tax included); the total is unchanged.
            ...invoiceTaxGroups(inv).map((g) => ({
              code: "400",
              debit: 0,
              credit: g.total,
              tax: isTaxCategory(g.key) ? g.key : null,
            })),
          ],
          taxExplicit: hasTaxCategories(inv.items),
        }
      : null,
  );
  if (
    eligible &&
    inv.receivedDate &&
    dateText(inv.receivedDate) < dateText(setting.startDate)
  )
    throw new Error("入金日を会計開始日以降にしてください。");
  await syncPosting(
    tx,
    userId,
    `invoice:${id}:receipt`,
    "RECEIPT",
    id,
    eligible && inv.receivedDate
      ? {
          date: dateText(inv.receivedDate),
          memo: `入金: ${label}`,
          lines: [
            { code: "110", debit: inv.grandTotal, credit: 0 },
            { code: "130", debit: inv.withholdingTax, credit: 0 },
            { code: "120", debit: 0, credit: inv.totalWithTax },
          ],
        }
      : null,
  );
}
const expenseCodes: Record<string, string> = {
  業務委託報酬: "510",
  外注費: "510",
  仕入: "500",
  家賃: "520",
  "通信・サブスク": "530",
  広告宣伝: "540",
  交通費: "550",
  "備品・消耗品": "560",
  その他: "580",
};
export async function syncExpense(tx: Tx, userId: string, id: string) {
  const setting = await tx.accountingSetting.findUnique({ where: { userId } });
  if (!setting) return;
  const e = await tx.expense.findFirst({ where: { id, userId } });
  if (!e) throw new Error("支払いが見つかりません。");
  const date = e.costMonth + "-01",
    eligible = date >= dateText(setting.startDate);
  const payable = e.category === "仕入" ? "200" : "210";
  await syncPosting(
    tx,
    userId,
    `expense:${id}:cost`,
    "EXPENSE",
    id,
    eligible
      ? {
          date,
          memo: `費用: ${e.supplier} ${e.description}`,
          lines: [
            {
              code: expenseCodes[e.category] ?? "580",
              debit: e.amount,
              credit: 0,
              tax: isTaxCategory(e.taxCategory) ? e.taxCategory : null,
            },
            { code: payable, debit: 0, credit: e.amount },
          ],
          taxExplicit: isTaxCategory(e.taxCategory),
        }
      : null,
  );
  if (
    eligible &&
    e.paidDate &&
    dateText(e.paidDate) < dateText(setting.startDate)
  )
    throw new Error("支払日を会計開始日以降にしてください。");
  await syncPosting(
    tx,
    userId,
    `expense:${id}:payment`,
    "PAYMENT",
    id,
    eligible && e.paidDate
      ? {
          date: dateText(e.paidDate),
          memo: `支払: ${e.supplier} ${e.description}`,
          lines: [
            { code: payable, debit: e.amount, credit: 0 },
            { code: "110", debit: 0, credit: e.amount },
          ],
        }
      : null,
  );
}
