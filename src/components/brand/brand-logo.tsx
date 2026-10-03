import { useId } from "react";

/** SEIQ reference owl: flowing line art with a subtle constellation detail. */
const owlPaths = [
  "M12 5C12 12 20 13 29 15M51 5C51 12 43 13 34 15",
  "M15 18C19 7 43 7 48 18C54 32 46 49 38 56",
  "M15 18C11 29 17 43 14 61C27 60 40 49 43 33",
  "M16 19C22 15 30 20 32 29C35 20 42 16 48 19",
  "M16 20C16 31 23 39 32 37C41 37 48 28 48 20",
  "M29 29L32 34L35 29",
  "M20 38C23 47 20 55 16 60M29 42C29 51 23 57 19 60",
  "M24 61L31 64M28 57L35 62",
  "M37 49L43 58L53 46",
];

export function BrandMark({ className = "h-14 w-12" }: { className?: string }) {
  const id = `owl-${useId().replaceAll(":", "")}`;
  return (
    <svg viewBox="0 0 64 72" fill="none" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="9" y1="38" x2="55" y2="25" gradientUnits="userSpaceOnUse">
          <stop stopColor="#70b9c3" />
          <stop offset="0.48" stopColor="#b3cfbb" />
          <stop offset="1" stopColor="#e8d58a" />
        </linearGradient>
      </defs>
      <g stroke={`url(#${id})`} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {owlPaths.map(d => <path key={d} d={d} />)}
        <circle cx="23" cy="24" r="3" />
        <circle cx="41" cy="24" r="3" />
        <circle cx="37" cy="49" r="2.5" />
        <circle cx="43" cy="58" r="2.5" />
        <circle cx="53" cy="46" r="2.5" />
      </g>
    </svg>
  );
}

export function BrandLogo({ light = false }: { light?: boolean }) {
  const id = `word-${useId().replaceAll(":", "")}`;
  return (
    <span className="relative isolate inline-flex items-center gap-2.5" role="img" aria-label="SEIQ">
      {light && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -inset-y-4 -left-5 -z-10 w-[105px]"
          style={{
            background: "radial-gradient(ellipse at 32% 58%, rgba(71, 190, 208, 0.22), transparent 65%), radial-gradient(ellipse at 68% 36%, rgba(224, 203, 112, 0.15), transparent 60%)",
            filter: "blur(9px)",
          }}
        />
      )}
      <BrandMark className={`h-[62px] w-[55px] shrink-0 ${light ? "drop-shadow-[0_0_4px_rgba(143,215,207,0.45)]" : ""}`} />
      <svg viewBox="0 0 200 60" className={`h-[31px] w-[108px] shrink-0 ${light ? "drop-shadow-[0_0_5px_rgba(143,215,207,0.25)]" : ""}`} fill="none" stroke={`url(#${id})`} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <defs>
          <linearGradient id={id} x1="0" y1="30" x2="200" y2="30" gradientUnits="userSpaceOnUse">
            <stop stopColor="#70b9c3" /><stop offset="0.5" stopColor="#b3cfbb" /><stop offset="1" stopColor="#e8d58a" />
          </linearGradient>
        </defs>
        <path d="M39 9C30 1 5 3 5 17C5 30 39 22 39 37C39 52 15 53 4 44" />
        <path d="M96 6H64V48H96M64 26H91" />
        <path d="M120 6V48" />
        <path d="M166 5C138 5 138 49 166 49S194 5 166 5ZM173 38L193 56" />
      </svg>
    </span>
  );
}
