"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function navActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarLink(props: { href: string; label: string }) {
  const pathname = usePathname();
  const active = navActive(pathname, props.href);
  return (
    <Link
      href={props.href}
      className={[
        "block rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
        active
          ? "bg-sky-50 text-sky-700"
          : "text-slate-600 hover:bg-slate-100/90 hover:text-slate-900",
      ].join(" ")}
    >
      {props.label}
    </Link>
  );
}

export function AppSidebar(props: { email: string; showAdmin: boolean }) {
  return (
    <aside className="hidden w-[15.5rem] shrink-0 md:block">
      <div className="sticky top-6 rounded-xl border border-slate-200/90 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="border-b border-slate-100 pb-4">
          <div className="text-[13px] font-semibold leading-snug text-slate-900">請求書作成</div>
          <div className="mt-1 truncate text-xs text-slate-500">{props.email}</div>
        </div>

        <nav className="mt-4 flex flex-col gap-0.5">
          <SidebarLink href="/dashboard" label="ダッシュボード" />
          <SidebarLink href="/invoices" label="請求書一覧" />
          <SidebarLink href="/companies" label="会社一覧" />
          <SidebarLink href="/item-templates" label="明細テンプレ" />
          <SidebarLink href="/mail-templates" label="メールテンプレ" />
          <SidebarLink href="/settings" label="設定" />
          {props.showAdmin ? <SidebarLink href="/admin/users" label="ユーザー管理" /> : null}
        </nav>

        <form action="/api/auth/logout" method="post" className="mt-6 border-t border-slate-100 pt-4">
          <button
            type="submit"
            className="w-full rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
          >
            ログアウト
          </button>
        </form>
      </div>
    </aside>
  );
}
