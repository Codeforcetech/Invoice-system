import { prisma } from "@/lib/db/prisma";
import { dateText, invoiceDateText } from "@/lib/accounting/model";
import { japanToday } from "@/lib/expenses/model";
import { monthStart, shiftMonth } from "@/lib/dashboard/sales";
import {
  annotationKey,
  emptyAnnotation,
  filterSchema,
  forecast,
  groupAmounts,
  journalTarget,
  matches,
  summarizeLedger,
  type Annotation,
  type DueRow,
  type Journal,
  type Target,
} from "./model";
export async function managementReport(
  userId: string,
  raw: unknown,
  today = japanToday(),
) {
  const f = filterSchema.parse(raw);
  return prisma.$transaction(
    async (tx) => {
      const [
        annotations,
        setting,
        accounts,
        feeds,
        invoices,
        expenses,
        claims,
        assets,
        entries,
      ] = await Promise.all([
        tx.reportAnnotation.findMany({ where: { userId }, take: 10001 }),
        tx.accountingSetting.findUnique({ where: { userId } }),
        tx.account.findMany({
          where: { userId },
          select: { id: true, code: true, name: true, kind: true },
        }),
        tx.statementFeed.findMany({
          where: { userId, kind: "BANK" },
          select: { accountId: true },
        }),
        tx.invoice.findMany({
          where: {
            createdById: userId,
            company: { userId },
            mergedIntoId: null,
            status: "ISSUED",
          },
          include: {
            company: { select: { name: true, invoiceCode: true } },
            items: { select: { productName: true, amount: true } },
          },
          orderBy: { issueDate: "desc" },
          take: 10001,
        }),
        tx.expense.findMany({
          where: { userId },
          orderBy: { dueDate: "asc" },
          take: 10001,
        }),
        tx.expenseClaim.findMany({
          where: { ownerId: userId, status: { in: ["APPROVED", "PAID"] } },
          include: { applicant: { select: { name: true } } },
          orderBy: { date: "desc" },
          take: 10001,
        }),
        tx.fixedAsset.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          take: 10001,
        }),
        tx.journalEntry.findMany({
          where: {
            userId,
            date: {
              gte: monthStart(f.from),
              lt: monthStart(shiftMonth(f.to, 1)),
            },
          },
          include: {
            lines: {
              include: {
                account: {
                  select: { id: true, code: true, name: true, kind: true },
                },
              },
            },
          },
          orderBy: [{ date: "desc" }, { id: "asc" }],
          take: 5001,
        }),
      ]);
      if (
        [annotations, invoices, expenses, claims, assets].some(
          (a) => a.length > 10000,
        ) ||
        entries.length > 5000
      )
        throw new Error(
          "集計上限（元データ各10,000件・期間内仕訳5,000件）を超えました。仕訳が多い場合は期間を短くしてください。",
        );
      const annotationMap = new Map<string, Annotation>(
        annotations.map((a) => [
          annotationKey(a.targetType, a.targetId),
          { ...a, plannedDate: a.plannedDate ? dateText(a.plannedDate) : "" },
        ]),
      );
      const getAnnotation = (type: string, id: string) =>
        annotationMap.get(annotationKey(type, id)) ?? emptyAnnotation(type, id);
      const journals: Journal[] = entries.map((e) => ({
        ...e,
        date: dateText(e.date),
      }));
      const reversalIds = entries.flatMap((e) =>
        e.reversalOf ? [e.reversalOf] : [],
      );
      const originalEntries = await tx.journalEntry.findMany({
        where: { userId, id: { in: reversalIds } },
        include: {
          lines: {
            include: {
              account: {
                select: { id: true, code: true, name: true, kind: true },
              },
            },
          },
        },
      });
      const originals = new Map<string, Journal>(
        originalEntries.map((e) => [e.id, { ...e, date: dateText(e.date) }]),
      );
      const ledger = summarizeLedger(journals, f, annotationMap, originals);
      const inPeriod = (date: string) =>
        date.slice(0, 7) >= f.from && date.slice(0, 7) <= f.to;
      const incoming: DueRow[] = invoices
        .filter(
          (i) =>
            !i.receivedDate &&
            invoiceDateText(i.issueDate) <= today &&
            matches(getAnnotation("INVOICE", i.id), f),
        )
        .map((i) => ({
          key: annotationKey("INVOICE", i.id),
          name: `${i.company.name} / ${i.company.invoiceCode}`,
          description: `${i.invoiceNumber} ${i.subject}`,
          due: invoiceDateText(i.dueDate),
          amount: i.grandTotal,
          href: `/invoices/${i.id}`,
          kind: "請求書",
          annotation: getAnnotation("INVOICE", i.id),
        }));
      const outgoing: DueRow[] = [
        ...expenses
          .filter((e) => !e.paidDate)
          .map((e) => ({
            key: annotationKey("EXPENSE", e.id),
            name: e.supplier,
            description: e.description,
            due: dateText(e.dueDate),
            amount: e.amount,
            href: `/expenses/${e.id}/edit`,
            kind: "支払管理",
            annotation: getAnnotation("EXPENSE", e.id),
          })),
        ...claims
          .filter((c) => c.status === "APPROVED")
          .map((c) => ({
            key: annotationKey("CLAIM", c.id),
            name: c.applicant.name,
            description: c.title,
            due: getAnnotation("CLAIM", c.id).plannedDate,
            amount: c.amount,
            href: `/claims/${c.id}`,
            kind: "経費精算",
            annotation: getAnnotation("CLAIM", c.id),
          })),
      ]
        .filter((r) => matches(r.annotation, f))
        .sort(
          (a, b) =>
            (a.due || "9999").localeCompare(b.due || "9999") ||
            a.key.localeCompare(b.key),
        );
      const receipts = incoming
        .filter((r) => inPeriod(r.due))
        .sort((a, b) => a.due.localeCompare(b.due));
      const payments = outgoing.filter((r) => !r.due || inPeriod(r.due));
      const sales = invoices.filter(
        (i) =>
          inPeriod(invoiceDateText(i.issueDate)) &&
          matches(getAnnotation("INVOICE", i.id), f),
      );
      const customers = groupAmounts(
        sales.map((i) => ({
          name: `${i.company.name} / ${i.company.invoiceCode}`,
          amount: i.subtotal,
        })),
      );
      const products = groupAmounts(
        sales.flatMap((i) =>
          i.items.map((item) => ({
            name: item.productName,
            amount: item.amount,
          })),
        ),
      );
      const cashIds = accounts
        .filter(
          (a) =>
            a.kind === "ASSET" &&
            (["100", "110"].includes(a.code) ||
              feeds.some((feed) => feed.accountId === a.id)),
        )
        .map((a) => a.id);
      const cash = await tx.journalLine.aggregate({
        where: {
          userId,
          accountId: { in: cashIds },
          entry: { date: { lte: new Date(today) } },
        },
        _sum: { debit: true, credit: true },
      });
      const opening = (cash._sum.debit ?? 0) - (cash._sum.credit ?? 0);
      const cashflow = forecast(
        today,
        setting && !f.department && !f.office ? opening : null,
        incoming,
        outgoing,
      );
      const targets: Target[] = [];
      const add = (
        type: string,
        id: string,
        name: string,
        date: string,
        amount: number,
        href: string,
      ) => {
        const annotation = getAnnotation(type, id);
        if (inPeriod(date) && matches(annotation, f))
          targets.push({
            key: annotationKey(type, id),
            type,
            id,
            name,
            date,
            amount,
            href,
            annotation,
          });
      };
      invoices.forEach((i) =>
        add(
          "INVOICE",
          i.id,
          `${i.invoiceNumber} ${i.subject}`,
          invoiceDateText(i.issueDate),
          i.totalWithTax,
          `/invoices/${i.id}`,
        ),
      );
      expenses.forEach((e) =>
        add(
          "EXPENSE",
          e.id,
          `${e.supplier} ${e.description}`,
          `${e.costMonth}-01`,
          e.amount,
          `/expenses/${e.id}/edit`,
        ),
      );
      claims.forEach((c) =>
        add(
          "CLAIM",
          c.id,
          `${c.applicant.name} ${c.title}`,
          dateText(c.date),
          c.amount,
          `/claims/${c.id}`,
        ),
      );
      assets.forEach((a) =>
        add(
          "ASSET",
          a.id,
          a.name,
          dateText(a.acquiredDate),
          a.cost,
          `/accounting/assets/${a.id}`,
        ),
      );
      // Include older source records when their current-period posting needs classification.
      for (const e of journals) {
        const target = journalTarget(e, originals),
          key = annotationKey(target.type, target.id);
        if (targets.some((t) => t.key === key)) continue;
        const annotation = getAnnotation(target.type, target.id);
        if (!matches(annotation, f)) continue;
        targets.push({
          key,
          type: target.type,
          id: target.id,
          name: e.memo,
          date: e.date,
          amount: e.lines.reduce((s, l) => s + l.debit, 0),
          href: `/accounting?from=${e.date}&to=${e.date}`,
          annotation,
        });
      }
      // Unpaid sources stay editable even if originally incurred outside the period.
      for (const r of [...receipts, ...payments])
        if (!targets.some((t) => t.key === r.key))
          targets.push({
            key: r.key,
            type: r.annotation.targetType,
            id: r.annotation.targetId,
            name: `${r.name} ${r.description}`,
            date: r.due,
            amount: r.amount,
            href: r.href,
            annotation: r.annotation,
          });
      targets.sort(
        (a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key),
      );
      return {
        f,
        today,
        setting: Boolean(setting),
        startDate: setting ? dateText(setting.startDate) : null,
        ledger,
        receipts,
        payments,
        customers,
        products,
        cashflow,
        opening,
        cashAccounts: accounts
          .filter((a) => cashIds.includes(a.id))
          .map((a) => a.name),
        targets,
        departments: [
          ...new Set(annotations.map((a) => a.department).filter(Boolean)),
        ].sort(),
        offices: [
          ...new Set(annotations.map((a) => a.office).filter(Boolean)),
        ].sort(),
        unclassified: targets.filter(
          (t) => !t.annotation.department || !t.annotation.office,
        ).length,
      };
    },
    { isolationLevel: "RepeatableRead", timeout: 30000 },
  );
}
export type ManagementReport = Awaited<ReturnType<typeof managementReport>>;
export function reportTable(
  r: ManagementReport,
  view = r.f.view,
): {
  title: string;
  headers: string[];
  rows: (string | number)[][];
  note: string;
} {
  const scope = `${r.f.from}〜${r.f.to} / 部門: ${r.f.department === "__none__" ? "未分類" : r.f.department || "全て"} / 事業所: ${r.f.office === "__none__" ? "未分類" : r.f.office || "全て"}`;
  if (view === "receipts" || view === "payments")
    return {
      title: view === "receipts" ? "入金管理レポート" : "支払管理レポート",
      headers: ["予定日", "相手先", "内容", "金額（円）", "種別", "部門"],
      rows: (view === "receipts" ? r.receipts : r.payments).map((v) => [
        v.due || "予定日未設定",
        v.name,
        v.description,
        v.amount,
        v.kind,
        v.annotation.department || "未分類",
      ]),
      note: `${scope} / ${r.today}現在の未決済分。予定日で集計。入金は源泉徴収差引後。`,
    };
  if (view === "revenue")
    return {
      title: "収益レポート",
      headers: ["区分", "名称", "税抜売上（円）"],
      rows: [
        ...r.customers.map((v) => ["取引先", v.name, v.amount]),
        ...r.products.map((v) => ["商品", v.name, v.amount]),
      ],
      note: `${scope} / 発行済み請求書の請求日基準・税抜。取引先別と商品別は同じ売上の別集計です。`,
    };
  if (view === "costs")
    return {
      title: "費用レポート",
      headers: ["区分", "名称・月", "費用（円）"],
      rows: [
        ...r.ledger.costs.map((v) => ["科目", v.name, v.amount]),
        ...r.ledger.months.map((v) => ["月別", v.month, v.cost]),
      ],
      note: `${scope} / 登録済み仕訳・税込経理。科目別と月別は同じ費用の別集計です。`,
    };
  if (view === "cash")
    return {
      title: "資金繰りレポート",
      headers: [
        "月",
        "入金予定（円）",
        "支払予定（円）",
        "差引（円）",
        "予測残高（円）",
      ],
      rows: r.cashflow.months.map((v) => [
        v.month,
        v.incoming,
        v.outgoing,
        v.net,
        v.balance ?? "—",
      ]),
      note: `${r.today}現在から6か月 / 部門:${r.f.department || "全て"} 事業所:${r.f.office || "全て"} / 開始帳簿残高 ${r.opening}円 / 期限超過入金 ${r.cashflow.overdueIncoming}円・支払 ${r.cashflow.overdueOutgoing}円・日付未設定 ${r.cashflow.undated}円は予測から除外。部門等の指定時は差引のみ。`,
    };
  if (view === "departments")
    return {
      title: "部門別損益",
      headers: ["部門", "収益（円）", "費用（円）", "損益（円）"],
      rows: r.ledger.departments.map((v) => [
        v.name,
        v.revenue,
        v.cost,
        v.profit,
      ]),
      note: `${scope} / 登録済み仕訳・税込経理。未分類も含む。`,
    };
  return {
    title: "損益レポート",
    headers: ["月", "収益（円）", "費用（円）", "損益（円）"],
    rows: r.ledger.months.map((v) => [v.month, v.revenue, v.cost, v.profit]),
    note: `${scope} / 登録済み仕訳・税込経理。取消仕訳を含む。`,
  };
}
export function transferRows(r: ManagementReport) {
  if (!r.payments.length) throw new Error("振込対象がありません。");
  if (
    r.payments.some(
      (p) =>
        !p.due ||
        !p.annotation.bankCode ||
        !p.annotation.bankAccountNumber ||
        !p.annotation.bankAccountHolder,
    )
  )
    throw new Error(
      "全ての支払予定日と振込先を登録してください。「分類・振込先」から設定できます。",
    );
  return [
    [
      "支払予定日",
      "銀行コード",
      "支店コード",
      "預金種目（1普通/2当座）",
      "口座番号",
      "受取人名（半角）",
      "振込金額（円）",
      "相手先",
      "管理番号",
    ],
    ...r.payments.map((p) => [
      p.due,
      p.annotation.bankCode,
      p.annotation.branchCode,
      p.annotation.bankAccountType,
      p.annotation.bankAccountNumber,
      p.annotation.bankAccountHolder,
      p.amount,
      p.name,
      p.key,
    ]),
  ];
}
