import { z } from "zod";
import type { Prisma, PrismaClient } from "@prisma/client";
import { daySchema } from "./model";
import type { TaxCategory } from "@/lib/tax/categories";

/**
 * 「かんたん入力」の部品。利用者には「出ていったお金／入ってきたお金／口座の移動」と
 * 「何のお金か」だけを聞き、借方・貸方の仕訳はここで組み立てる。
 */
type Db = PrismaClient | Prisma.TransactionClient;

export type EasyKind = "OUT" | "IN" | "MOVE";

export const easyKindInfo: Record<
  EasyKind,
  { label: string; lead: string; summary: string }
> = {
  OUT: {
    label: "出ていったお金",
    lead: "支払い・経費など",
    summary: "出金",
  },
  IN: {
    label: "入ってきたお金",
    lead: "売上の入金など",
    summary: "入金",
  },
  MOVE: {
    label: "口座・現金の移動",
    lead: "預金から現金を引き出した、など",
    summary: "移動",
  },
};

export type TaxChoice = "10" | "8" | "none";
export const taxChoiceInfo: Record<
  TaxChoice,
  { label: string; hint: string; category: TaxCategory | null }
> = {
  "10": {
    label: "10%（ふつう）",
    hint: "ほとんどの支払い・売上はこちらです",
    category: "TAXABLE_10",
  },
  "8": {
    label: "8%（食品・新聞など）",
    hint: "軽減税率の対象のものです",
    category: "TAXABLE_8",
  },
  none: {
    label: "かからない／わからない",
    hint: "給与・税金・保険料など。迷ったらこちらにして、あとで税理士さんに確認できます",
    category: null,
  },
};

type Standard = {
  code: string;
  label: string;
  example: string;
  tax: TaxChoice;
};

/** 出ていったお金の分類（標準の勘定科目の、やさしい言い方）。 */
const outStandard: Standard[] = [
  {
    code: "520",
    label: "家賃・賃料",
    example: "事務所・駐車場などの家賃",
    tax: "10",
  },
  {
    code: "530",
    label: "電話・ネット・郵送",
    example: "スマホ代、インターネット、切手",
    tax: "10",
  },
  {
    code: "540",
    label: "広告・宣伝",
    example: "Web広告、チラシ、名刺",
    tax: "10",
  },
  {
    code: "550",
    label: "交通費・出張",
    example: "電車・タクシー・宿泊",
    tax: "10",
  },
  {
    code: "560",
    label: "事務用品・消耗品",
    example: "文房具、10万円未満の備品",
    tax: "10",
  },
  {
    code: "510",
    label: "外注・業務委託",
    example: "デザインや制作を依頼した費用",
    tax: "10",
  },
  {
    code: "500",
    label: "仕入（商品・材料）",
    example: "売るための商品や、材料",
    tax: "10",
  },
  {
    code: "570",
    label: "手数料",
    example: "振込手数料、決済手数料",
    tax: "10",
  },
  {
    code: "580",
    label: "その他の支払い",
    example: "上のどれにも当てはまらないもの",
    tax: "none",
  },
];

/** 入ってきたお金の分類。 */
const inStandard: Standard[] = [
  {
    code: "400",
    label: "売上（商品・サービスの代金）",
    example: "お客様からの入金",
    tax: "10",
  },
];
/** 標準の科目にない「その他の入金」。初めて使うときに自動で作る。 */
export const OTHER_INCOME = {
  code: "410",
  name: "雑収入",
  label: "その他の入金",
  example: "利息・補助金・返金など",
};
export const NEW_OTHER_INCOME_ID = `new:${OTHER_INCOME.code}`;

export type EasyOption = {
  id: string;
  label: string;
  example: string;
  tax: TaxChoice;
  /** 標準の分類か（自社で追加した科目は false） */
  standard: boolean;
};
export type MoneyOption = {
  id: string;
  label: string;
  kind: "CASH" | "BANK" | "CARD";
};
export type AccountLite = {
  id: string;
  code: string;
  name: string;
  kind: string;
  active: boolean;
};
export type FeedLite = { name: string; kind: string; accountId: string };

/** 自動で作られる科目など、利用者が直接選ぶものではない科目。 */
const hidden = new Set(["DEP"]);

/** 画面に出す選択肢を、事業所の勘定科目と、登録済みの銀行・カードから作る。 */
export function easyOptions(accounts: AccountLite[], feeds: FeedLite[]) {
  const live = accounts.filter((a) => a.active && !hidden.has(a.code));
  const byCode = new Map(live.map((a) => [a.code, a]));
  const build = (
    standard: Standard[],
    kind: "EXPENSE" | "REVENUE",
  ): EasyOption[] => {
    const known = new Set(standard.map((s) => s.code));
    const base = standard.flatMap((s) => {
      const a = byCode.get(s.code);
      return a && a.kind === kind
        ? [
            {
              id: a.id,
              label: s.label,
              example: s.example,
              tax: s.tax,
              standard: true,
            },
          ]
        : [];
    });
    const own = live
      .filter(
        (a) =>
          a.kind === kind && !known.has(a.code) && a.code !== OTHER_INCOME.code,
      )
      .map((a) => ({
        id: a.id,
        label: a.name,
        example: "自社で追加した分類",
        tax: "none" as TaxChoice,
        standard: false,
      }));
    return [...base, ...own];
  };
  const out = build(outStandard, "EXPENSE");
  const income = build(inStandard, "REVENUE");
  const otherIncome = byCode.get(OTHER_INCOME.code);
  income.push({
    id: otherIncome?.kind === "REVENUE" ? otherIncome.id : NEW_OTHER_INCOME_ID,
    label: OTHER_INCOME.label,
    example: OTHER_INCOME.example,
    tax: "none",
    standard: true,
  });
  const money: MoneyOption[] = [];
  for (const code of ["100", "110"]) {
    const a = byCode.get(code);
    if (a && a.kind === "ASSET")
      money.push({
        id: a.id,
        label: a.name,
        kind: code === "100" ? "CASH" : "BANK",
      });
  }
  for (const f of feeds) {
    if (money.some((m) => m.id === f.accountId)) continue;
    if (!live.some((a) => a.id === f.accountId)) continue;
    money.push(
      f.kind === "CARD"
        ? { id: f.accountId, label: `カード（${f.name}）`, kind: "CARD" }
        : { id: f.accountId, label: f.name, kind: "BANK" },
    );
  }
  return { out, income, money };
}

/** 「お金の置き場所」（現金・預金・登録済みの銀行やカード）を、事業所のデータから取得する。 */
export async function loadMoneyOptions(db: Db, ownerId: string) {
  const [accounts, feeds] = await Promise.all([
    db.account.findMany({
      where: { userId: ownerId },
      orderBy: { code: "asc" },
    }),
    db.statementFeed.findMany({
      where: { userId: ownerId },
      select: { name: true, kind: true, accountId: true },
    }),
  ]);
  return { accounts, feeds, options: easyOptions(accounts, feeds) };
}

export const easySchema = z
  .object({
    requestKey: z.string().uuid(),
    kind: z.enum(["OUT", "IN", "MOVE"], {
      error: "お金の種類を選んでください",
    }),
    date: daySchema,
    amount: z.coerce
      .number({ error: "金額を入力してください" })
      .int("金額は整数の円で入力してください")
      .min(1, "金額は1円以上で入力してください")
      .max(2147483647, "金額が上限を超えています"),
    /** 出金・入金：何のお金か（勘定科目のID） */
    categoryAccountId: z.string().max(100).default(""),
    /** 出金・入金：どの口座か。移動：移動元 */
    moneyAccountId: z.string().max(100).default(""),
    /** 移動：移動先 */
    toAccountId: z.string().max(100).default(""),
    /** 取引先・内容 */
    memo: z
      .string()
      .trim()
      .max(150, "取引先・内容は150文字以内で入力してください")
      .default(""),
    taxChoice: z.enum(["10", "8", "none"]).default("none"),
  })
  .superRefine((v, ctx) => {
    const need = (ok: boolean, path: string, message: string) => {
      if (!ok) ctx.addIssue({ code: "custom", path: [path], message });
    };
    if (v.kind === "MOVE") {
      need(!!v.moneyAccountId, "moneyAccountId", "移動元を選んでください");
      need(!!v.toAccountId, "toAccountId", "移動先を選んでください");
      need(
        !v.moneyAccountId || v.moneyAccountId !== v.toAccountId,
        "toAccountId",
        "移動元と移動先は、別のものを選んでください",
      );
    } else {
      need(
        !!v.categoryAccountId,
        "categoryAccountId",
        "何のお金かを選んでください",
      );
      need(!!v.moneyAccountId, "moneyAccountId", "どの口座かを選んでください");
      need(v.memo.length > 0, "memo", "取引先・内容を入力してください");
    }
  });
export type EasyInput = z.infer<typeof easySchema>;

type Names = { category?: string; money?: string; to?: string };

/** 入力から仕訳の行を組み立てる。利用者は借方・貸方を意識しなくてよい。 */
export function buildEasyLines(
  v: Pick<EasyInput, "kind" | "amount" | "taxChoice">,
  ids: { category?: string; money: string; to?: string },
) {
  const taxCategory = taxChoiceInfo[v.taxChoice].category;
  if (v.kind === "OUT")
    return [
      { accountId: ids.category!, debit: v.amount, credit: 0, taxCategory },
      { accountId: ids.money, debit: 0, credit: v.amount },
    ];
  if (v.kind === "IN")
    return [
      { accountId: ids.money, debit: v.amount, credit: 0 },
      { accountId: ids.category!, debit: 0, credit: v.amount, taxCategory },
    ];
  return [
    { accountId: ids.to!, debit: v.amount, credit: 0 },
    { accountId: ids.money, debit: 0, credit: v.amount },
  ];
}

/** 「何が記録されるか」の説明（画面の確認・操作ログ用）。 */
export function describeEasy(
  v: Pick<EasyInput, "kind" | "amount" | "memo">,
  n: Names,
) {
  const yen = `¥${v.amount.toLocaleString("ja-JP")}`;
  if (v.kind === "OUT")
    return `${n.money ?? "口座"}から ${yen} の支払い（${n.category ?? "分類なし"}）${v.memo ? `：${v.memo}` : ""}`;
  if (v.kind === "IN")
    return `${n.money ?? "口座"}に ${yen} の入金（${n.category ?? "分類なし"}）${v.memo ? `：${v.memo}` : ""}`;
  return `${n.money ?? "移動元"}から${n.to ?? "移動先"}へ ${yen} を移動`;
}

/** 経理の方向けに、帳簿での記録のされ方を文章にする。 */
export function describeBooks(
  lines: { name: string; debit: number; credit: number }[],
) {
  const side = (key: "debit" | "credit") =>
    lines
      .filter((l) => l[key] > 0)
      .map((l) => `${l.name} ${l[key].toLocaleString("ja-JP")}`)
      .join("、");
  return { debit: side("debit"), credit: side("credit") };
}

/** 開始残高（会計をはじめる日の残高）。利用者には、いまのお金の状況だけを聞く。 */
export const openingSchema = z.object({
  cash: z.coerce.number().int().min(0).max(2147483647).default(0),
  bank: z.coerce.number().int().min(0).max(2147483647).default(0),
  receivable: z.coerce.number().int().min(0).max(2147483647).default(0),
  payable: z.coerce.number().int().min(0).max(2147483647).default(0),
  loan: z.coerce.number().int().min(0).max(2147483647).default(0),
});
export type OpeningInput = z.infer<typeof openingSchema>;

export const OPENING_MEMO = "開始残高";

/** 資産と負債の差を「元入金・資本金」として、貸借が合うように自動で計算する。 */
export function openingLines(v: OpeningInput, id: (code: string) => string) {
  const assets = v.cash + v.bank + v.receivable;
  const debts = v.payable + v.loan;
  const equity = assets - debts;
  const lines = [
    { code: "100", debit: v.cash, credit: 0 },
    { code: "110", debit: v.bank, credit: 0 },
    { code: "120", debit: v.receivable, credit: 0 },
    { code: "210", debit: 0, credit: v.payable },
    { code: "220", debit: 0, credit: v.loan },
    {
      code: "300",
      debit: equity < 0 ? -equity : 0,
      credit: equity > 0 ? equity : 0,
    },
  ]
    .filter((l) => l.debit || l.credit)
    .map((l) => ({ accountId: id(l.code), debit: l.debit, credit: l.credit }));
  return { lines, assets, debts, equity };
}
