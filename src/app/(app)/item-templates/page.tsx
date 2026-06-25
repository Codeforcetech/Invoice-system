import { requireUser } from "@/lib/auth/require-user";
import { listItemTemplates } from "@/actions/item-template-actions";
import { ItemTemplateManager } from "@/app/(app)/item-templates/_components/item-template-manager";
import { PageShell } from "@/components/ui/page-shell";
import { SectionHeader } from "@/components/ui/section-header";

export default async function ItemTemplatesPage() {
  await requireUser();
  const rows = await listItemTemplates();
  const initialRows = rows.map((t) => ({
    id: t.id,
    name: t.name,
    productName: t.productName,
    unit: t.unit,
    quantity: Number(t.quantity),
    unitPrice: t.unitPrice,
    note: t.note,
  }));

  return (
    <PageShell maxWidth="5xl">
      <SectionHeader
        variant="page"
        title="明細テンプレート"
        description="よく使う明細行を登録し、請求書作成画面からワンクリックで追加できます。"
      />
      <ItemTemplateManager initialRows={initialRows} />
    </PageShell>
  );
}
