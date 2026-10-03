"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BrandLogo } from "@/components/brand/brand-logo";
import { AppIcon } from "@/components/ui/app-icon";
import { navigation, SidebarContent } from "./app-sidebar";
export function MobileAppHeader({
  email = "",
  showAdmin = false,
  canEdit = true,
  memberRole,
  unreadNotifications = 0,
}: {
  email?: string;
  showAdmin?: boolean;
  canEdit?: boolean;
  memberRole?: string;
  unreadNotifications?: number;
}) {
  const pathname = usePathname();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const el = dialog.current;
    el?.showModal();
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      el?.close();
      document.body.style.overflow = old;
    };
  }, [open]);
  const current = navigation.find(
    (n) => pathname === n.href || pathname.startsWith(n.href + "/"),
  );
  return (
    <>
      <header className="flex min-h-20 items-center justify-between gap-3 border-b border-slate-200/70 bg-white/90 px-4 sm:px-8">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="メニューを開く"
            aria-expanded={open}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 lg:hidden"
          >
            <AppIcon name="menu" />
          </button>
          <Link
            href="/dashboard"
            className="lg:hidden"
            aria-label="SEIQ ホーム"
          >
            <BrandLogo />
          </Link>
          <p className="hidden text-xs text-slate-500 lg:block">
            ワークスペース <span className="mx-3 text-slate-300">/</span>
            <span className="font-medium text-slate-800">
              {pathname === "/reports"
                ? "経営レポート"
                : (current?.label ?? "請求書")}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/notifications"
            className="rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-600"
            aria-label={`お知らせ 未読${unreadNotifications}件`}
          >
            お知らせ
            {unreadNotifications > 0 && (
              <span className="ml-2 rounded-full bg-sky-600 px-1.5 py-0.5 text-white">
                {unreadNotifications}
              </span>
            )}
          </Link>
          <span className="hidden rounded-full border border-slate-200 px-3 py-1.5 text-[11px] text-slate-500 sm:inline">
            請求・売上・支払管理
          </span>
        </div>
      </header>
      <dialog
        ref={dialog}
        onCancel={() => setOpen(false)}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setOpen(false);
        }}
        className="m-0 h-dvh max-h-none w-[min(300px,90vw)] max-w-none bg-[#132b32] p-0 text-white backdrop:bg-slate-950/50"
      >
        <button
          autoFocus
          type="button"
          aria-label="メニューを閉じる"
          onClick={() => setOpen(false)}
          className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-lg text-slate-300 hover:bg-white/10"
        >
          <AppIcon name="close" />
        </button>
        <SidebarContent
          email={email}
          showAdmin={showAdmin}
          canEdit={canEdit}
          memberRole={memberRole}
          onNavigate={() => setOpen(false)}
        />
      </dialog>
    </>
  );
}
