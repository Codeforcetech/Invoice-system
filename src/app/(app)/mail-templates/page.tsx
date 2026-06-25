import { requireUser } from "@/lib/auth/require-user";
import { listMailTemplates } from "@/actions/mail-template-actions";
import { MailTemplateManager } from "@/app/(app)/mail-templates/_components/mail-template-manager";
import { PageShell } from "@/components/ui/page-shell";
import { SectionHeader } from "@/components/ui/section-header";

export default async function MailTemplatesPage() {
  await requireUser();
  const rows = await listMailTemplates();
  const initialRows = rows.map((t) => ({
    id: t.id,
    name: t.name,
    subjectTemplate: t.subjectTemplate,
    bodyTemplate: t.bodyTemplate,
  }));

  return (
    <PageShell maxWidth="5xl">
      <SectionHeader
        variant="page"
        title="メールテンプレート"
        description={
          <>
            請求書送付メールの件名・本文を登録します。変数は{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.8125rem] text-slate-700">
              {"{{company_name}}"}
            </code>{" "}
            形式で差し込めます。
          </>
        }
      />
      <MailTemplateManager initialRows={initialRows} />
    </PageShell>
  );
}
