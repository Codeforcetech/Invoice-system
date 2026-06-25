import type { ReactNode } from "react";

/** ページ見出しと同じタイポ（コンポーネント外でも再利用可） */
export const pageTitleClass =
  "text-2xl font-bold leading-tight tracking-tight text-slate-900 md:text-[1.875rem] md:leading-tight";

export const pageDescriptionClass = "mt-2 text-sm leading-relaxed text-slate-500 md:text-[0.9375rem] md:leading-relaxed";

export const sectionTitleClass = "text-base font-semibold leading-snug tracking-tight text-slate-900";

export const sectionDescriptionClass = "mt-1.5 text-sm leading-relaxed text-slate-500";

export function SectionHeader(props: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  /** ページ最上位の見出し（より大きいタイポ） */
  variant?: "page" | "section";
  className?: string;
}) {
  const isPage = props.variant === "page";
  const title = isPage ? (
    <h1 className={pageTitleClass}>{props.title}</h1>
  ) : (
    <h2 className={sectionTitleClass}>{props.title}</h2>
  );
  const descClass = isPage ? pageDescriptionClass : sectionDescriptionClass;

  return (
    <div
      className={["flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", props.className ?? ""]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="min-w-0">
        {title}
        {props.description != null && props.description !== "" ? (
          <div className={descClass}>{props.description}</div>
        ) : null}
      </div>
      {props.action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{props.action}</div> : null}
    </div>
  );
}
