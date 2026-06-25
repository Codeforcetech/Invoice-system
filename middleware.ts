import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED_PREFIXES = [
  "/companies",
  "/invoices",
  "/settings",
  "/admin",
  "/item-templates",
  "/mail-templates",
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!isProtected) return NextResponse.next();

  const token = req.cookies.get("invoice_session")?.value;
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // /api/* は含めない（ログイン POST 等を middleware でリダイレクトしない）
  matcher: [
    "/companies/:path*",
    "/invoices/:path*",
    "/settings/:path*",
    "/admin/:path*",
    "/item-templates/:path*",
    "/mail-templates/:path*",
  ],
};

