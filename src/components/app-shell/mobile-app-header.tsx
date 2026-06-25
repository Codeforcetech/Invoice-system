"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function MLink(props: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = pathname === props.href || pathname.startsWith(`${props.href}/`);
  return (
    <Link
      href={props.href}
      className={[
        "rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
        active ? "bg-sky-50 text-sky-700" : "text-slate-600 hover:bg-slate-100",
      ].join(" ")}
    >
      {props.children}
    </Link>
  );
}

export function MobileAppHeader() {
  return (
    <div className="mb-6 rounded-xl border border-slate-200/90 bg-white px-3 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] md:hidden">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-900">請求書作成</span>
        <div className="flex flex-wrap items-center justify-end gap-1">
          <MLink href="/dashboard">ホーム</MLink>
          <MLink href="/invoices">請求書</MLink>
          <MLink href="/companies">会社</MLink>
          <MLink href="/item-templates">明細</MLink>
          <MLink href="/mail-templates">メール</MLink>
          <MLink href="/settings">設定</MLink>
        </div>
      </div>
    </div>
  );
}
