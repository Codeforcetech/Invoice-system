export function KpiStatCard(props: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] md:p-6">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{props.label}</p>
      <p className="mt-3 text-3xl font-semibold tabular-nums tracking-tight text-slate-900 md:text-4xl">{props.value}</p>
    </div>
  );
}
