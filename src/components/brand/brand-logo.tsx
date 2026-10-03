/** SEIQ / SEAM: the selected original S symbol and outlined wordmark. */
const seamPaths = [
  "M78 15H43C23 15 10 29 10 49V58H28V49C28 39 34 33 44 33H60L78 15Z",
  "M22 85H57C77 85 90 71 90 51V42H72V51C72 61 66 67 56 67H40L22 85Z",
  "m41 42 18 0-18 16H23Z",
  "m59 58-18 0 18-16h18Z",
];
export function BrandMark({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="#73E2C1"
      className={className}
      aria-hidden="true"
    >
      {seamPaths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
export function BrandLogo({ light = false }: { light?: boolean }) {
  const color = light ? "#73E2C1" : "#132B32";
  return (
    <span
      className="inline-flex items-center gap-2.5"
      role="img"
      aria-label="SEIQ"
    >
      <svg
        viewBox="0 0 100 100"
        fill={color}
        className="h-11 w-11 shrink-0"
        aria-hidden="true"
      >
        {seamPaths.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
      <svg
        viewBox="0 0 200 60"
        className="h-[33px] w-[112px] shrink-0"
        fill="none"
        stroke={color}
        strokeWidth="7.5"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M39 6H17C1 6 1 26 17 26H26C42 26 42 47 26 47H4" />
        <path d="M96 6H62V47H96 M62 26H88" />
        <path d="M120 6V47" />
        <path d="M166 4C139 4 139 49 166 49S193 4 166 4Z" />
        <path d="m172 34 20 21" />
      </svg>
    </span>
  );
}
