/**
 * 旧システムのデータを、新版の仕様へ移すデータ移行（Backfill）。
 *
 *  - 既存データは、削除しない・初期化しない。更新するのは、空（NULL）の項目と、足りない関連レコードだけ。
 *  - 何度実行しても同じ結果になる（冪等）。
 *  - 初期値は「確認だけ」（APPLY=1 のときだけ書き込む）。
 *  - 変更の前後の件数と、更新した対象のIDを、画面とログファイル（scripts/data-migration/logs/）に出す。
 *  - 実行先は、EXPECT_HOST と DATABASE_URL のホストが一致したときだけ（本番を間違えて指さないための確認）。
 *
 * 実行方法は scripts/data-migration/README.md を見る。
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { calculateInvoice } from "@/lib/invoice/calculateInvoice";
import { accountingLock } from "@/lib/accounting/service";
import { syncExpense, syncInvoice } from "@/lib/accounting/sync";
import { templateAccounts } from "@/lib/accounting/model";
import { recordAudit } from "@/lib/workspace/audit";
import { japanToday } from "@/lib/expenses/model";

const ENABLED = process.env.DATA_MIGRATION === "1";
const APPLY = process.env.APPLY === "1";
const STEPS = (process.env.STEPS ?? "report").split(",").map((s) => s.trim());
const log: Record<string, unknown> = {
  startedAt: new Date().toISOString(),
  apply: APPLY,
  steps: STEPS,
};
const say = (...a: unknown[]) =>
  process.stderr.write(
    a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ") +
      "\n",
  );

async function counts() {
  const [
    users,
    companies,
    invoices,
    items,
    itemsNull,
    issuedUnpaid,
    settings,
    accounts,
    entries,
    sources,
    stores,
    audit,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.company.count(),
    prisma.invoice.count(),
    prisma.invoiceItem.count(),
    prisma.invoiceItem.count({ where: { taxCategory: null } }),
    prisma.invoice.count({
      where: { status: "ISSUED", receivedDate: null, mergedIntoId: null },
    }),
    prisma.accountingSetting.count(),
    prisma.account.count(),
    prisma.journalEntry.count(),
    prisma.accountingSource.count(),
    prisma.store.count(),
    prisma.auditLog.count(),
  ]);
  return {
    User: users,
    Company: companies,
    Invoice: invoices,
    InvoiceItem: items,
    "InvoiceItem(区分なし)": itemsNull,
    "請求書(発行済み・入金日なし)": issuedUnpaid,
    AccountingSetting: settings,
    Account: accounts,
    JournalEntry: entries,
    AccountingSource: sources,
    Store: stores,
    AuditLog: audit,
  };
}

/** 税区分を明示しても、請求書の金額が変わらないことを確かめてから、区分を入れる。 */
async function stepTaxCategory() {
  const rows = await prisma.invoice.findMany({
    where: {
      taxRate: { in: [1000, 800] },
      items: { some: { taxCategory: null } },
    },
    select: {
      id: true,
      invoiceNumber: true,
      taxRate: true,
      withholdingEnabled: true,
      subtotal: true,
      taxAmount: true,
      totalWithTax: true,
      withholdingTax: true,
      grandTotal: true,
      items: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          quantity: true,
          unitPrice: true,
          amount: true,
          amountManuallyEdited: true,
          taxCategory: true,
        },
      },
    },
  });
  const done: { invoice: string; items: string[] }[] = [];
  const skipped: { invoice: string; reason: string }[] = [];
  for (const inv of rows) {
    const category = inv.taxRate === 800 ? "TAXABLE_8" : "TAXABLE_10";
    const same = (r: ReturnType<typeof calculateInvoice>) =>
      r.subtotal === inv.subtotal &&
      r.taxAmount === inv.taxAmount &&
      r.totalWithTax === inv.totalWithTax &&
      r.withholdingTax === inv.withholdingTax &&
      r.grandTotal === inv.grandTotal;
    const calc = (explicit: boolean) =>
      calculateInvoice({
        items: inv.items.map((i) => ({
          quantity: Number(i.quantity),
          unitPrice: i.unitPrice,
          amount: i.amount,
          amountManuallyEdited: i.amountManuallyEdited,
          taxCategory: i.taxCategory ?? (explicit ? category : null),
        })),
        taxRateBps: inv.taxRate,
        withholdingEnabled: inv.withholdingEnabled,
      });
    if (!same(calc(false))) {
      skipped.push({
        invoice: inv.invoiceNumber,
        reason: "いまの金額が、再計算と一致しない",
      });
      continue;
    }
    if (!same(calc(true))) {
      skipped.push({
        invoice: inv.invoiceNumber,
        reason: "区分を入れると金額が変わる",
      });
      continue;
    }
    const ids = inv.items
      .filter((i) => i.taxCategory === null)
      .map((i) => i.id);
    if (APPLY)
      await prisma.invoiceItem.updateMany({
        where: { id: { in: ids }, taxCategory: null },
        data: { taxCategory: category },
      });
    done.push({ invoice: inv.invoiceNumber, items: ids });
  }
  // 税率0%の請求書は、非課税・不課税・免税のどれか分からないため、触らない（業務判断）。
  const zero = await prisma.invoice.findMany({
    where: { taxRate: 0, items: { some: { taxCategory: null } } },
    select: { invoiceNumber: true, status: true },
  });
  log.taxCategory = {
    updatedInvoices: done.length,
    updatedItems: done.reduce((n, d) => n + d.items.length, 0),
    done,
    skipped,
    leftForDecision_taxRate0: zero,
  };
  say(
    `[税区分] ${APPLY ? "更新" : "更新予定"}: 請求書 ${done.length}件 / 明細 ${done.reduce((n, d) => n + d.items.length, 0)}件、見送り ${skipped.length}件、税率0%で未決定 ${zero.length}件`,
  );
}

/** 会計の初期設定。開始日と業種は、利用者が決めるもの。INIT_ACCOUNTING に「ユーザーID:開始日:業種」を明示したときだけ行う。 */
async function stepInitAccounting() {
  const specs = (process.env.INIT_ACCOUNTING ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!specs.length) {
    say(
      "[会計の初期設定] INIT_ACCOUNTING が指定されていないため、何もしません。",
    );
    return;
  }
  const result: { owner: string; result: string }[] = [];
  for (const spec of specs) {
    const [owner, start, industry] = spec.split(":");
    if (
      !owner ||
      !/^20\d{2}-\d{2}-\d{2}$/.test(start ?? "") ||
      !["SERVICE", "RETAIL", "CONSTRUCTION"].includes(industry ?? "")
    )
      throw new Error(
        `INIT_ACCOUNTING の形式が違います: ${spec}（ユーザーID:YYYY-MM-DD:SERVICE|RETAIL|CONSTRUCTION）`,
      );
    const user = await prisma.user.findUnique({
      where: { id: owner },
      select: { id: true },
    });
    if (!user) {
      result.push({ owner, result: "ユーザーが見つからない" });
      continue;
    }
    if (
      await prisma.accountingSetting.findUnique({ where: { userId: owner } })
    ) {
      result.push({ owner, result: "設定済み（変更しない）" });
      continue;
    }
    if (APPLY)
      await prisma.$transaction(async (tx) => {
        await accountingLock(tx, owner);
        await tx.accountingSetting.create({
          data: { userId: owner, startDate: new Date(start), industry },
        });
        await tx.account.createMany({
          data: templateAccounts(industry).map((a) => ({
            ...a,
            userId: owner,
            system: true,
          })),
        });
        await recordAudit(
          tx,
          { ownerId: owner, userId: owner },
          {
            action: "ACCOUNTING_INIT",
            entity: "SETTING",
            summary: `会計の初期設定（データ移行・開始日 ${start}）`,
          },
        );
      });
    result.push({ owner, result: APPLY ? "設定した" : "設定予定" });
  }
  log.initAccounting = result;
  say("[会計の初期設定]", result);
}

/** 会計の設定がある事業所の、発行済みの請求書と支払いを、帳簿に連携する（連携済みは変わらない）。 */
async function stepLedger() {
  const owners = await prisma.accountingSetting.findMany({
    select: { userId: true },
  });
  const out: {
    owner: string;
    invoices: number;
    expenses: number;
    failed: { id: string; error: string }[];
  }[] = [];
  for (const { userId } of owners) {
    const invoices = await prisma.invoice.findMany({
      where: { createdById: userId, status: "ISSUED", mergedIntoId: null },
      select: { id: true, invoiceNumber: true },
    });
    const expenses = await prisma.expense.findMany({
      where: { userId },
      select: { id: true },
    });
    const failed: { id: string; error: string }[] = [];
    if (APPLY) {
      for (const i of invoices)
        try {
          await prisma.$transaction(async (tx) => {
            await accountingLock(tx, userId);
            await syncInvoice(tx, userId, i.id);
          });
        } catch (e) {
          failed.push({
            id: i.invoiceNumber,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      for (const e of expenses)
        try {
          await prisma.$transaction(async (tx) => {
            await accountingLock(tx, userId);
            await syncExpense(tx, userId, e.id);
          });
        } catch (err) {
          failed.push({
            id: e.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
    }
    out.push({
      owner: userId,
      invoices: invoices.length,
      expenses: expenses.length,
      failed,
    });
  }
  log.ledger = out;
  say(
    `[帳簿への連携] ${APPLY ? "実行" : "対象"}: 事業所 ${out.length}、請求書 ${out.reduce((n, o) => n + o.invoices, 0)}件、支払い ${out.reduce((n, o) => n + o.expenses, 0)}件、失敗 ${out.reduce((n, o) => n + o.failed.length, 0)}件`,
  );
}

/** 入金日の取り込み。RECEIVED_CSV（請求書番号,入金日）を読む。入金日は、利用者が決めるもの。 */
async function stepReceived() {
  const file = process.env.RECEIVED_CSV;
  if (!file) {
    say("[入金日] RECEIVED_CSV が指定されていないため、何もしません。");
    return;
  }
  const lines = readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  const today = japanToday();
  const done: string[] = [];
  const rejected: { line: string; reason: string }[] = [];
  for (const line of lines) {
    const [number, date] = line.split(",").map((s) => s?.trim());
    if (number === "invoiceNumber") continue;
    if (!number || !/^20\d{2}-\d{2}-\d{2}$/.test(date ?? "")) {
      rejected.push({ line, reason: "形式が違う（請求書番号,YYYY-MM-DD）" });
      continue;
    }
    const inv = await prisma.invoice.findUnique({
      where: { invoiceNumber: number },
      select: {
        id: true,
        createdById: true,
        status: true,
        receivedDate: true,
        receiptMatchId: true,
        mergedIntoId: true,
        issueDate: true,
      },
    });
    if (!inv) {
      rejected.push({ line, reason: "請求書が見つからない" });
      continue;
    }
    if (inv.status !== "ISSUED" || inv.mergedIntoId) {
      rejected.push({ line, reason: "発行済みではない／合算済み" });
      continue;
    }
    if (inv.receivedDate || inv.receiptMatchId) {
      rejected.push({ line, reason: "すでに入金済み（変更しない）" });
      continue;
    }
    if (date! > today) {
      rejected.push({ line, reason: "未来の日付" });
      continue;
    }
    if (date! < inv.issueDate.toISOString().slice(0, 10)) {
      rejected.push({ line, reason: "発行日より前の日付" });
      continue;
    }
    if (APPLY)
      try {
        await prisma.$transaction(async (tx) => {
          await accountingLock(tx, inv.createdById);
          const r = await tx.invoice.updateMany({
            where: { id: inv.id, receivedDate: null, receiptMatchId: null },
            data: { receivedDate: new Date(date!) },
          });
          if (!r.count) return;
          await syncInvoice(tx, inv.createdById, inv.id);
          await recordAudit(
            tx,
            { ownerId: inv.createdById, userId: inv.createdById },
            {
              action: "INVOICE_RECEIVED",
              entity: "INVOICE",
              entityId: inv.id,
              summary: `入金を記録（データ移行・${date}）`,
            },
          );
        });
      } catch (e) {
        rejected.push({
          line,
          reason: e instanceof Error ? e.message : String(e),
        });
        continue;
      }
    done.push(`${number},${date}`);
  }
  log.received = { done, rejected };
  say(
    `[入金日] ${APPLY ? "記録" : "記録予定"}: ${done.length}件、見送り ${rejected.length}件`,
  );
}

describe.skipIf(!ENABLED)("data migration (backfill)", () => {
  it("runs the selected steps", async () => {
    const url = new URL(process.env.DATABASE_URL ?? "postgresql://missing");
    if (!process.env.EXPECT_HOST || process.env.EXPECT_HOST !== url.host)
      throw new Error(
        `実行を止めました。EXPECT_HOST（${process.env.EXPECT_HOST ?? "未指定"}）が、DATABASE_URL のホストと一致しません。`,
      );
    say(
      `対象DB: ${url.host}/${url.pathname.slice(1)}　モード: ${APPLY ? "書き込む（APPLY=1）" : "確認だけ（書き込まない）"}　手順: ${STEPS.join(", ")}`,
    );
    const before = await counts();
    say("変更前の件数:", before);
    log.before = before;
    if (STEPS.includes("tax-category")) await stepTaxCategory();
    if (STEPS.includes("init-accounting")) await stepInitAccounting();
    if (STEPS.includes("received")) await stepReceived();
    if (STEPS.includes("ledger")) await stepLedger();
    const after = await counts();
    say("変更後の件数:", after);
    const changed = Object.fromEntries(
      Object.keys(after)
        .filter(
          (k) =>
            (after as Record<string, number>)[k] !==
            (before as Record<string, number>)[k],
        )
        .map((k) => [
          k,
          `${(before as Record<string, number>)[k]} → ${(after as Record<string, number>)[k]}`,
        ]),
    );
    say("増減:", changed);
    log.after = after;
    log.changed = changed;
    mkdirSync("scripts/data-migration/logs", { recursive: true });
    const path = `scripts/data-migration/logs/${new Date().toISOString().replace(/[:.]/g, "-")}${APPLY ? "" : "-dryrun"}.json`;
    writeFileSync(path, JSON.stringify(log, null, 2));
    say("ログ:", path);
    // どの手順も、既存データを減らさない。
    for (const k of ["User", "Company", "Invoice", "InvoiceItem"] as const)
      expect(after[k], k).toBe(before[k]);
    await prisma.$disconnect();
  });
});
