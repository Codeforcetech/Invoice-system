/**
 * 下層ページの「戻り先」。画面の一番上に「← ○○へ戻る」を出すために使う。
 * 一覧・ホームにあたるページ（サイドバーから開くページ）は戻り先なし。
 */
export type ParentLink = { href: string; label: string };

const ID = "[^/]+";
const rules: {
  pattern: RegExp;
  parent: (m: RegExpMatchArray) => ParentLink;
}[] = [
  {
    pattern: /^\/submit\/[^/]+\/edit$/,
    parent: () => ({ href: "/submit", label: "提出の一覧" }),
  },
  {
    pattern: /^\/submit\/[^/]+$/,
    parent: () => ({ href: "/submit", label: "提出の一覧" }),
  },
  {
    pattern: new RegExp(`^/accounting/submissions/${ID}$`),
    parent: () => ({
      href: "/accounting/received",
      label: "書類の受け取り状況",
    }),
  },
  {
    pattern: /^\/accounting\/transactions\/new$/,
    parent: () => ({ href: "/accounting", label: "お金の出入り" }),
  },
  {
    pattern: /^\/accounting\/transactions\/advanced$/,
    parent: () => ({
      href: "/accounting/transactions/new",
      label: "お金の出入りを記録する",
    }),
  },
  {
    pattern: /^\/accounting\/assets\/new$/,
    parent: () => ({ href: "/accounting/assets", label: "固定資産" }),
  },
  {
    pattern: new RegExp(`^/accounting/assets/${ID}$`),
    parent: () => ({ href: "/accounting/assets", label: "固定資産" }),
  },
  {
    pattern: new RegExp(`^/accounting/evidence/${ID}$`),
    parent: () => ({
      href: "/accounting/evidence",
      label: "証憑ファイルボックス",
    }),
  },
  {
    pattern:
      /^\/accounting\/(assets|evidence|linking|statements|opening|received|monthly|links)$/,
    parent: () => ({ href: "/accounting", label: "会計・帳簿" }),
  },
  {
    pattern: new RegExp(`^/claims/(${ID})/edit$`),
    parent: (m) => ({ href: `/claims/${m[1]}`, label: "申請の内容" }),
  },
  {
    pattern: /^\/claims\/(new|team)$/,
    parent: () => ({ href: "/claims", label: "経費精算" }),
  },
  {
    pattern: new RegExp(`^/claims/${ID}$`),
    parent: () => ({ href: "/claims", label: "経費精算" }),
  },
  {
    pattern: /^\/companies\/(new|[^/]+)$/,
    parent: () => ({ href: "/companies", label: "取引先" }),
  },
  {
    pattern: new RegExp(`^/expenses/(new|${ID}/edit)$`),
    parent: () => ({ href: "/expenses", label: "支払管理" }),
  },
  {
    pattern: new RegExp(`^/invoices/(${ID})/edit$`),
    parent: (m) => ({ href: `/invoices/${m[1]}`, label: "請求書の詳細" }),
  },
  {
    pattern: new RegExp(`^/invoices/(new|${ID})$`),
    parent: () => ({ href: "/invoices", label: "請求書" }),
  },
  {
    pattern: /^\/settings\/members$/,
    parent: () => ({ href: "/settings", label: "自社情報・設定" }),
  },
  {
    pattern: /^\/settings\/audit$/,
    parent: () => ({ href: "/settings/members", label: "メンバー・権限" }),
  },
];

export function parentLink(pathname: string): ParentLink | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  for (const r of rules) {
    const m = path.match(r.pattern);
    if (m) return r.parent(m);
  }
  return null;
}
