import type { SVGProps } from "react";
const paths = {
  wallet: "M3 5h16v4H3V5Zm0 4v11h18V9H3Zm12 4h6v4h-6v-4Z",
  book: "M12 5C8 3 5 3 2 4v15c3-1 6-1 10 1 4-2 7-2 10-1V4c-3-1-6-1-10 1Z M12 5v15",
  home: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  invoice: "M6 3h9l4 4v14H6z M14 3v5h5 M9 12h7 M9 16h7",
  company: "M4 21V7h10v14 M14 11h6v10 M2 21h20 M7 10h4 M7 14h4 M8 21v-3h3",
  items: "M4 5h16v4H4z M4 11h16v4H4z M4 17h16v4H4z",
  mail: "M3 5h18v14H3z m0 1 9 7 9-7",
  settings: "M4 7h16 M4 17h16 M8 4v6 M16 14v6",
  users:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M20 21v-2a4 4 0 0 0-3-4 M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M16 3a4 4 0 0 1 0 8",
  plus: "M12 5v14 M5 12h14",
  arrow: "M5 12h14 m-5-5 5 5-5 5",
  logout: "M9 4H4v16h5 M10 12h11 m-4-4 4 4-4 4",
  menu: "M4 6h16 M4 12h16 M4 18h16",
  close: "m6 6 12 12 M6 18 18 6",
  check: "m5 12 4 4L19 6",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v5l3 2",
} as const;
export type IconName = keyof typeof paths;
export function AppIcon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={paths[name]} />
    </svg>
  );
}
