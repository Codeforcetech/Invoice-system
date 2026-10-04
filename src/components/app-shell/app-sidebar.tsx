"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLogo } from "@/components/brand/brand-logo";
import { AppIcon, type IconName } from "@/components/ui/app-icon";
export const navigation: {
  href: string;
  label: string;
  icon: IconName;
  group: string;
}[] = [
  {
    href: "/dashboard",
    label: "ダッシュボード",
    icon: "home",
    group: "ワークスペース",
  },
  {
    href: "/invoices",
    label: "請求書",
    icon: "invoice",
    group: "ワークスペース",
  },
  {
    href: "/expenses",
    label: "支払管理",
    icon: "wallet",
    group: "ワークスペース",
  },
  {
    href: "/claims",
    label: "経費精算",
    icon: "wallet",
    group: "ワークスペース",
  },
  {
    href: "/accounting",
    label: "会計・帳簿",
    icon: "book",
    group: "ワークスペース",
  },
  {
    href: "/companies",
    label: "取引先",
    icon: "company",
    group: "ワークスペース",
  },
  {
    href: "/item-templates",
    label: "明細テンプレート",
    icon: "items",
    group: "作成を効率化",
  },
  {
    href: "/mail-templates",
    label: "メールテンプレート",
    icon: "mail",
    group: "作成を効率化",
  },
  {
    href: "/settings",
    label: "自社情報・設定",
    icon: "settings",
    group: "管理",
  },
  { href: "/admin/users", label: "ユーザー管理", icon: "users", group: "管理" },
  {
    href: "/notifications",
    label: "お知らせ",
    icon: "mail",
    group: "サポート",
  },
  { href: "/guide", label: "使い方ガイド", icon: "book", group: "サポート" },
];
/** 経費精算の申請メンバーでもある提出者に、足すメニュー。 */
export const submitterClaimsEntry: (typeof navigation)[number] = {
  href: "/claims",
  label: "経費を申請する",
  icon: "wallet",
  group: "提出",
};
/** 提出者（業務委託）に見せるメニュー。会社のデータの画面は、一切出さない。 */
export const submitterNavigation: typeof navigation = [
  { href: "/submit", label: "書類を提出する", icon: "invoice", group: "提出" },
  {
    href: "/submit/profile",
    label: "自分の情報",
    icon: "settings",
    group: "提出",
  },
  {
    href: "/notifications",
    label: "お知らせ",
    icon: "mail",
    group: "サポート",
  },
  { href: "/guide", label: "使い方ガイド", icon: "book", group: "サポート" },
];
export function SidebarContent(props: {
  email: string;
  showAdmin: boolean;
  canEdit?: boolean;
  submitter?: boolean;
  /** 提出者のうち、経費精算の申請メンバーでもある人 */
  claims?: boolean;
  memberRole?: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const entries = props.submitter
    ? props.claims
      ? [
          submitterNavigation[0],
          submitterClaimsEntry,
          ...submitterNavigation.slice(1),
        ]
      : submitterNavigation
    : navigation.filter((n) => props.showAdmin || n.href !== "/admin/users");
  return (
    <div className="flex h-full flex-col px-5 pb-5 pt-8">
      <Link
        href={props.submitter ? "/submit" : "/dashboard"}
        aria-label={props.submitter ? "SEIQ 提出" : "SEIQ ダッシュボード"}
        onClick={props.onNavigate}
        className="px-2"
      >
        <BrandLogo light />
      </Link>
      {props.canEdit !== false && (
        <Link
          href="/invoices/new"
          onClick={props.onNavigate}
          className="mt-9 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-gold px-3 py-3 text-sm font-bold text-brand-navy transition-colors hover:bg-brand-gold-hover"
        >
          <AppIcon name="plus" />
          請求書を作成
        </Link>
      )}
      <nav
        aria-label="メインメニュー"
        className={`${props.canEdit !== false ? "mt-6" : "mt-9"} flex-1 space-y-6`}
      >
        {[...new Set(entries.map((n) => n.group))].map((group) => (
          <div key={group}>
            <p className="mb-2 px-3 text-[10px] font-medium tracking-widest text-slate-400">
              {group}
            </p>
            <div className="space-y-1">
              {entries
                .filter((n) => n.group === group)
                .map((n) => {
                  const active =
                    pathname === n.href || pathname.startsWith(n.href + "/");
                  return (
                    <Link
                      key={n.href}
                      href={n.href}
                      aria-current={active ? "page" : undefined}
                      onClick={props.onNavigate}
                      className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-colors ${active ? "bg-brand-blue/20 text-sky-200 ring-1 ring-inset ring-brand-blue/30" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}
                    >
                      <AppIcon name={n.icon} />
                      {n.label}
                      {active && (
                        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-brand-blue" />
                      )}
                    </Link>
                  );
                })}
            </div>
          </div>
        ))}
      </nav>
      <div className="mt-8 border-t border-white/10 pt-5">
        <div className="flex items-center gap-3 px-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-semibold text-white">
            {props.email.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="text-[10px] text-slate-400">
              {props.memberRole
                ? `事業所の権限：${props.memberRole}`
                : props.showAdmin
                  ? "管理者アカウント"
                  : "マイアカウント"}
            </p>
            <p
              className="mt-0.5 truncate text-xs text-slate-200"
              title={props.email}
            >
              {props.email}
            </p>
          </div>
        </div>
        <form action="/api/auth/logout" method="post" className="mt-3">
          <button className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-xs text-slate-400 hover:bg-white/5 hover:text-white">
            <AppIcon name="logout" className="h-4 w-4" />
            ログアウト
          </button>
        </form>
      </div>
    </div>
  );
}
export function AppSidebar(props: {
  email: string;
  showAdmin: boolean;
  canEdit?: boolean;
  submitter?: boolean;
  claims?: boolean;
  memberRole?: string;
}) {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[232px] overflow-y-auto bg-brand-navy lg:block">
      <SidebarContent {...props} />
    </aside>
  );
}
