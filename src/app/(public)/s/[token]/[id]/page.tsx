import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { findActiveLink } from "@/lib/submissions/link";
import { loadLinkSubmission } from "@/lib/submissions/public";
import { SubmissionDetail } from "@/components/submissions/submission-detail";
import { ExternalActions } from "@/components/submissions/external-actions";

import {
  PublicShell,
  publicMetadata,
} from "@/components/submissions/public-shell";

export const dynamic = "force-dynamic";
export const metadata = publicMetadata;

/** 外部の人が、自分の提出の内容・状況を確認するページ（ログイン不要）。 */
export default async function LinkSubmissionPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string; id: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const { token, id } = await params;
  const { done } = await searchParams;
  const link = await findActiveLink(prisma, token);
  if (!link) notFound();
  const s = await loadLinkSubmission(prisma, link, id);
  if (!s) notFound();
  return (
    <PublicShell>
      <div className="space-y-5">
        <Link href={`/s/${token}`} className="text-sm text-sky-700">
          ← 提出のページへ戻る
        </Link>
        {done && (
          <div
            role="status"
            className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
          >
            <p className="font-semibold">提出を受け付けました。</p>
            <p className="mt-1">
              受付番号：<span className="font-mono">{s.id.slice(0, 8)}</span>
              　承認または差し戻しがあるまで、お待ちください。
            </p>
          </div>
        )}
        <ExternalActions token={token} id={s.id} status={s.status} />
        <SubmissionDetail
          s={s}
          fileHref={(fileId) => `/s/${token}/files/${fileId}`}
        />
      </div>
    </PublicShell>
  );
}
