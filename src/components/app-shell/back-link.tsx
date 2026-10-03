"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { parentLink } from "@/lib/navigation/parent";

/** 下層ページの先頭に出す「← ○○へ戻る」。一覧・ホームのページでは何も出さない。 */
export function BackLink() {
  const parent = parentLink(usePathname());
  if (!parent) return null;
  return (
    <nav aria-label="前のページへ" className="-mb-2">
      <Link
        href={parent.href}
        className="inline-flex items-center gap-1 rounded-lg px-1 py-1 text-sm font-medium text-sky-700 hover:bg-sky-50 hover:underline"
      >
        <span aria-hidden>←</span>
        {parent.label}へ戻る
      </Link>
    </nav>
  );
}
